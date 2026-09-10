import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { dateOnly, num, str } from "../utils/coerce.js";
import { assertVehicleExists } from "../utils/fkValidation.js";
import { emiCreateSchema, emiPaySchema, emiUpdateSchema, parseBody, } from "../validation/emi.js";
/**
 * Shared list selector — always joined against the Vehicle Master so the
 * vehicle number is resolved server-side, never synthesized (the EMI table
 * shows the real registration number, e.g. "AP 39 AB 1234").
 */
const EMI_SELECT = `
  SELECT e.*, v.vehicle_number AS v_vehicle_number
  FROM vehicle_emis e
  JOIN vehicles v ON v.id = e.vehicle_id
`;
/** Recompute paidEMIs / nextEMIDate / status from the persisted schedule.
 * Centralized in PostgreSQL (recompute_vehicle_emi) so every mutation path —
 * create, update, payment — stays consistent with the installments. */
async function recomputeAggregates(client, emiId) {
    await client.query("SELECT recompute_vehicle_emi($1)", [emiId]);
}
function mapEmi(row) {
    const totalEMIs = num(row.total_emis);
    const paidEMIs = num(row.paid_emis);
    return {
        id: num(row.id),
        vehicleId: num(row.vehicle_id),
        vehicleNo: str(row.v_vehicle_number ?? row.vehicle_number),
        financeCompany: str(row.finance_company),
        loanAmount: num(row.loan_amount),
        emiAmount: num(row.emi_amount),
        startDate: dateOnly(row.start_date) ?? "",
        endDate: dateOnly(row.end_date) ?? "",
        nextEMIDate: row.next_emi_date == null ? null : dateOnly(row.next_emi_date),
        status: str(row.status),
        paidEMIs,
        pendingEMIs: Math.max(0, totalEMIs - paidEMIs),
        totalEMIs,
        createdBy: str(row.created_by),
        createdAt: row.created_at == null ? null : str(row.created_at),
        updatedAt: row.updated_at == null ? null : str(row.updated_at),
    };
}
function mapInstallment(row) {
    return {
        id: num(row.id),
        vehicleEmiId: num(row.vehicle_emi_id),
        installmentNo: num(row.installment_no),
        dueDate: dateOnly(row.due_date) ?? "",
        amount: num(row.amount),
        status: str(row.status),
        paidAt: row.paid_at == null ? null : str(row.paid_at),
    };
}
function pad2(n) {
    return n < 10 ? `0${n}` : String(n);
}
function isoDate(y, m, d) {
    return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}
/**
 * Monthly due dates for the schedule — the "next occurrence of emiDay" rule the
 * existing EMI table uses (setDate(purchaseDate, emiDay), then advance by
 * month). The day is clamped to the month length; vehicle.emi_day is used when
 * present, otherwise the day of startDate.
 */
function monthlyDueDates(startDate, emiDay, count) {
    const base = new Date(`${startDate}T00:00:00Z`);
    const year = base.getUTCFullYear();
    const month = base.getUTCMonth();
    const day = emiDay && emiDay >= 1 ? emiDay : Math.max(1, base.getUTCDate());
    const dates = [];
    for (let i = 0; i < count; i++) {
        const firstOfMonth = new Date(Date.UTC(year, month + i, 1));
        const lastDay = new Date(Date.UTC(year, month + i + 1, 0)).getUTCDate();
        const dueDay = Math.min(day, lastDay);
        dates.push(isoDate(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth(), dueDay));
    }
    return dates;
}
/**
 * Build the installment amounts for the schedule.
 *
 * The displayed EMI amount uses the exact flat-principal formula the existing
 * page already shows: Math.round(loanAmount / totalEMIs). To keep the sum of
 * the schedule exactly equal to loanAmount (money consistency when every
 * installment is paid), the FINAL installment absorbs the rounding remainder —
 * this only affects the internal schedule, never the emiAmount the page shows.
 * Installments that would be 0 are floored to 1 so a tiny loan never gets a
 * zero-value schedule row.
 */
function installmentAmounts(loanAmount, totalEMIs) {
    const totalCents = Math.round(loanAmount * 100);
    const baseCents = Math.floor(totalCents / totalEMIs);
    const remainder = totalCents % totalEMIs;
    const emiAmount = Math.round(totalCents / totalEMIs) / 100;
    const amounts = Array.from({ length: totalEMIs }, (_, index) => (baseCents + (index < remainder ? 1 : 0)) / 100);
    return { emiAmount, amounts };
}
function monthsAfter(startDate, months) {
    const base = new Date(`${startDate}T00:00:00Z`);
    const shifted = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, base.getUTCDate()));
    return isoDate(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}
/** Insert the full schedule (all pending) inside the caller's transaction. */
async function insertSchedule(client, emiId, amounts, dueDates, paidCount, existingPaidAt = []) {
    for (let i = 0; i < amounts.length; i++) {
        const installmentNo = i + 1;
        const isPaid = i < paidCount;
        const paidAt = isPaid ? (existingPaidAt[i] ?? new Date().toISOString()) : null;
        await client.query(`INSERT INTO vehicle_emi_installments
         (vehicle_emi_id, installment_no, due_date, amount, status, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6)`, [emiId, installmentNo, dueDates[i], amounts[i], isPaid ? "paid" : "pending", paidAt]);
    }
}
/** Resolve the vehicle registration number + emi_day from the Vehicle Master. */
async function resolveVehicle(client, vehicleId) {
    const result = await client.query(`SELECT vehicle_number, emi_day FROM vehicles WHERE id = $1 LIMIT 1`, [vehicleId]);
    if (!result.rowCount) {
        throw new AppError(422, "Vehicle not found", { vehicleId });
    }
    return {
        vehicleNo: str(result.rows[0].vehicle_number),
        emiDay: result.rows[0].emi_day == null ? null : num(result.rows[0].emi_day),
    };
}
/** Read the paid installments' paid_at stamps (oldest first) so a schedule
 * regenerated on update keeps a faithful paid-history timestamp order.
 * Null stamps stay null so the INSERT never writes an invalid timestamp. */
async function existingPaidStamps(client, emiId) {
    const result = await client.query(`SELECT paid_at FROM vehicle_emi_installments
     WHERE vehicle_emi_id = $1 AND status = 'paid'
     ORDER BY installment_no`, [emiId]);
    return result.rows.map((r) => (r.paid_at == null ? null : str(r.paid_at)));
}
async function fetchEmi(client, emiId) {
    const full = await client.query(`${EMI_SELECT} WHERE e.id = $1`, [emiId]);
    if (!full.rowCount)
        throw new AppError(404, "EMI record not found");
    return mapEmi(full.rows[0]);
}
export const vehicleEmiService = {
    /**
     * All EMI records across every vehicle, joined with the Vehicle Master for
     * the real registration number. Optional filters mirror what the EMI page
     * needs: a vehicle-wise lookup (vehicleId), a status filter, and a free-text
     * search over the vehicle number / finance company.
     */
    async list(filters = {}) {
        const clauses = [];
        const params = [];
        if (filters.vehicleId) {
            params.push(filters.vehicleId);
            clauses.push(`e.vehicle_id = $${params.length}`);
        }
        if (filters.status) {
            params.push(filters.status);
            clauses.push(`e.status = $${params.length}::text`);
        }
        if (filters.search) {
            params.push(`%${filters.search}%`);
            const p = params.length;
            clauses.push(`(v.vehicle_number ILIKE $${p} OR e.finance_company ILIKE $${p})`);
        }
        const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
        const result = await query(`${EMI_SELECT} ${where} ORDER BY v.vehicle_number`, params);
        return result.rows.map(mapEmi);
    },
    async getById(id) {
        const result = await query(`${EMI_SELECT} WHERE e.id = $1`, [id]);
        if (!result.rowCount)
            throw new AppError(404, "EMI record not found");
        return mapEmi(result.rows[0]);
    },
    /** EMI record for a specific vehicle (used by vehicle-wise EMI views). */
    async getByVehicleId(vehicleId) {
        const result = await query(`${EMI_SELECT} WHERE e.vehicle_id = $1`, [vehicleId]);
        if (!result.rowCount) {
            throw new AppError(404, "No EMI record found for this vehicle");
        }
        return mapEmi(result.rows[0]);
    },
    /** The persisted installment schedule for an EMI record, oldest first. */
    async listSchedule(emiId) {
        const emi = await query(`SELECT id FROM vehicle_emis WHERE id = $1`, [emiId]);
        if (!emi.rowCount)
            throw new AppError(404, "EMI record not found");
        const result = await query(`SELECT id, vehicle_emi_id, installment_no, due_date, amount, status, paid_at
       FROM vehicle_emi_installments
       WHERE vehicle_emi_id = $1
       ORDER BY installment_no`, [emiId]);
        return result.rows.map(mapInstallment);
    },
    /**
     * Create an EMI record + its full persisted schedule, atomically.
     *
     * - vehicleId must reference an existing Vehicle Master row (no duplicate
     *   vehicles are ever created). One EMI record per vehicle — a second
     *   attempt for the same vehicle is rejected (409).
     * - The schedule is generated from the authoritative inputs (loanAmount,
     *   totalEMIs, startDate + the vehicle's emi_day) inside the same
     *   transaction, so a failure on any installment rolls everything back.
     * - The returned record carries the derived fields the EMI page displays
     *   (emiAmount, endDate, paidEMIs, pendingEMIs, nextEMIDate, status).
     */
    async create(body) {
        const data = parseBody(emiCreateSchema, body);
        return withTransaction(async (client) => {
            await assertVehicleExists(data.vehicleId, client);
            const existing = await client.query(`SELECT id FROM vehicle_emis WHERE vehicle_id = $1`, [data.vehicleId]);
            if (existing.rowCount) {
                throw new AppError(409, "An EMI record already exists for this vehicle");
            }
            const { vehicleNo, emiDay } = await resolveVehicle(client, data.vehicleId);
            const totalEMIs = num(data.totalEMIs);
            const loanAmount = num(data.loanAmount);
            const { emiAmount, amounts } = installmentAmounts(loanAmount, totalEMIs);
            const startDate = dateOnly(data.startDate) ?? "";
            const endDate = monthsAfter(startDate, totalEMIs);
            const dueDates = monthlyDueDates(startDate, emiDay, totalEMIs);
            const nextEmiDate = dueDates[0] ?? null;
            const result = await client.query(`INSERT INTO vehicle_emis (
           vehicle_id, finance_company, loan_amount, emi_amount, start_date, end_date,
           total_emis, paid_emis, next_emi_date, status, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, 'active', $9)
         RETURNING id`, [
                data.vehicleId,
                str(data.financeCompany).trim(),
                loanAmount,
                emiAmount,
                startDate,
                endDate,
                totalEMIs,
                nextEmiDate,
                data.createdBy ?? "",
            ]);
            const emiId = num(result.rows[0].id);
            await insertSchedule(client, emiId, amounts, dueDates, 0);
            // Recompute so the initial status/next date reflect the real schedule
            // (e.g. a past-dated start immediately surfaces as 'overdue').
            await recomputeAggregates(client, emiId);
            return fetchEmi(client, emiId);
        });
    },
    /**
     * Update an EMI record. Schedule-affecting fields (loanAmount, totalEMIs,
     * startDate, endDate, emiAmount) regenerate the pending schedule while
     * preserving the number of already-paid installments and their paid
     * timestamps; a plain financeCompany change touches only the record row.
     * Everything is atomic.
     */
    async update(id, body) {
        const data = parseBody(emiUpdateSchema, body);
        return withTransaction(async (client) => {
            const existing = await client.query(`SELECT id, vehicle_id, finance_company, loan_amount, emi_amount, start_date,
                end_date, total_emis, paid_emis
         FROM vehicle_emis WHERE id = $1`, [id]);
            if (!existing.rowCount)
                throw new AppError(404, "EMI record not found");
            const row = existing.rows[0];
            const vehicleId = num(row.vehicle_id);
            const financeCompany = data.financeCompany !== undefined ? str(data.financeCompany).trim() : null;
            const scheduleAffected = data.loanAmount !== undefined ||
                data.totalEMIs !== undefined ||
                data.startDate !== undefined ||
                false;
            if (scheduleAffected) {
                const { emiDay } = await resolveVehicle(client, vehicleId);
                const totalEMIs = num(data.totalEMIs ?? row.total_emis);
                const loanAmount = num(data.loanAmount ?? row.loan_amount);
                const { emiAmount: resolvedEmiAmount, amounts } = installmentAmounts(loanAmount, totalEMIs);
                const startDate = dateOnly(data.startDate ?? row.start_date) ?? "";
                const endDate = monthsAfter(startDate, totalEMIs);
                // Preserve paid count + paid history. A shrunken tenure can never keep
                // more paid installments than total installments.
                const paidCount = Math.max(0, Math.min(num(row.paid_emis), totalEMIs));
                const stamps = await existingPaidStamps(client, id);
                await client.query(`DELETE FROM vehicle_emi_installments WHERE vehicle_emi_id = $1`, [id]);
                const dueDates = monthlyDueDates(startDate, emiDay, totalEMIs);
                await insertSchedule(client, id, amounts, dueDates, paidCount, stamps);
                await client.query(`UPDATE vehicle_emis SET
             finance_company = COALESCE($2, finance_company),
             loan_amount = $3,
             emi_amount = $4,
             start_date = $5,
             end_date = $6,
             total_emis = $7
           WHERE id = $1`, [id, financeCompany, loanAmount, resolvedEmiAmount, startDate, endDate, totalEMIs]);
            }
            else {
                await client.query(`UPDATE vehicle_emis SET finance_company = COALESCE($2, finance_company)
           WHERE id = $1`, [id, financeCompany]);
            }
            await recomputeAggregates(client, id);
            return fetchEmi(client, id);
        });
    },
    /**
     * Mark the next pending installment as paid and recompute the EMI
     * aggregates (paidEMIs, nextEMIDate, status) in the same transaction so the
     * payment, the pending count, the next due date and the overall status can
     * never drift out of sync. Fully-paid EMIs reject further payments (409).
     */
    async pay(id, body) {
        const data = parseBody(emiPaySchema, body);
        return withTransaction(async (client) => {
            const existing = await client.query(`SELECT id FROM vehicle_emis WHERE id = $1 FOR UPDATE`, [id]);
            if (!existing.rowCount)
                throw new AppError(404, "EMI record not found");
            const request = await client.query(`INSERT INTO vehicle_emi_payment_requests (request_id, vehicle_emi_id)
         VALUES ($1::uuid, $2)
         ON CONFLICT (request_id) DO NOTHING
         RETURNING request_id`, [data.idempotencyKey, id]);
            if (!request.rowCount) {
                const replay = await client.query(`SELECT vehicle_emi_id FROM vehicle_emi_payment_requests WHERE request_id = $1::uuid`, [data.idempotencyKey]);
                if (num(replay.rows[0]?.vehicle_emi_id) !== id) {
                    throw new AppError(409, "Idempotency key was already used for another EMI record");
                }
                return fetchEmi(client, id);
            }
            const next = await client.query(`SELECT id FROM vehicle_emi_installments
         WHERE vehicle_emi_id = $1 AND status = 'pending'
         ORDER BY installment_no
         LIMIT 1`, [id]);
            if (!next.rowCount) {
                await client.query(`DELETE FROM vehicle_emi_payment_requests WHERE request_id = $1::uuid`, [data.idempotencyKey]);
                throw new AppError(409, "EMI is already fully paid");
            }
            await client.query(`UPDATE vehicle_emi_installments SET status = 'paid', paid_at = NOW()
         WHERE id = $1`, [num(next.rows[0].id)]);
            await recomputeAggregates(client, id);
            return fetchEmi(client, id);
        });
    },
    /**
     * Delete an EMI record and its persisted schedule. The schedule rows follow
     * via ON DELETE CASCADE inside the same transaction.
     */
    async remove(id) {
        return withTransaction(async (client) => {
            const existing = await client.query(`SELECT vehicle_id FROM vehicle_emis WHERE id = $1`, [id]);
            if (!existing.rowCount)
                throw new AppError(404, "EMI record not found");
            const vehicleId = num(existing.rows[0].vehicle_id);
            await client.query(`DELETE FROM vehicle_emis WHERE id = $1`, [id]);
            return { id, vehicleId, deleted: true };
        });
    },
};
//# sourceMappingURL=vehicleEmiService.js.map