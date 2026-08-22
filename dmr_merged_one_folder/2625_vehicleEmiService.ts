import type pg from "pg";
import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import type { EmiOverview, VehicleEMI, VehicleEMIInstallment, EMIStatus } from "../types/fleet.js";
import { dateOnly, num, numOrNull, str } from "../utils/coerce.js";
import { assertVehicleExists } from "../utils/fkValidation.js";
import {
  emiCreateSchema,
  emiPaySchema,
  emiUpdateSchema,
  parseBody,
} from "../validation/emi.js";

type Client = pg.PoolClient;

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
async function recomputeAggregates(client: Client, emiId: number): Promise<void> {
  await client.query("SELECT recompute_vehicle_emi($1)", [emiId]);
}

function mapEmi(row: Record<string, unknown>): VehicleEMI {
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
    status: str(row.status) as EMIStatus,
    paidEMIs,
    pendingEMIs: Math.max(0, totalEMIs - paidEMIs),
    totalEMIs,
    createdBy: str(row.created_by),
    createdAt: row.created_at == null ? null : str(row.created_at),
    updatedAt: row.updated_at == null ? null : str(row.updated_at),
  };
}

function mapInstallment(row: Record<string, unknown>): VehicleEMIInstallment {
  return {
    id: num(row.id),
    vehicleEmiId: num(row.vehicle_emi_id),
    installmentNo: num(row.installment_no),
    dueDate: dateOnly(row.due_date) ?? "",
    amount: num(row.amount),
    status: str(row.status) as VehicleEMIInstallment["status"],
    paidAt: row.paid_at == null ? null : str(row.paid_at),
  };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isoDate(y: number, m: number, d: number): string {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

function lastDayOfMonthUTC(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

/** Next occurrence of `day` on or after `after` (UTC), clamped to month length.
 * Month-end is handled safely: a 31st never produces an invalid date in a
 * 30-day month or February. */
function nextOccurrenceOnOrAfter(day: number, after: Date): string {
  const y0 = after.getUTCFullYear();
  const m0 = after.getUTCMonth();
  for (let i = 0; i < 2; i++) {
    const y = m0 + i >= 12 ? y0 + 1 : y0;
    const m = (m0 + i) % 12;
    const clamped = Math.min(day, lastDayOfMonthUTC(y, m));
    const candidate = new Date(Date.UTC(y, m, clamped));
    if (candidate.getTime() >= after.getTime()) return isoDate(y, m, clamped);
  }
  const y = m0 + 1 >= 12 ? y0 + 1 : y0;
  const m = (m0 + 1) % 12;
  return isoDate(y, m, Math.min(day, lastDayOfMonthUTC(y, m)));
}

/** Map one EMI-overview row (Vehicle Master LEFT JOIN payment schedule) onto the
 * read-only EmiOverview DTO. Vehicle facts are authoritative from `vehicles`;
 * only the completed/payment state comes from the EMI schedule. */
function mapOverviewRow(row: Record<string, unknown>): EmiOverview {
  // Total EMI — Vehicle Master is authoritative; fall back to the EMI record's
  // tenure only for legacy vehicles that predate the master total_emis column.
  const masterTotal = numOrNull(row.master_total_emis);
  const emiTotal = numOrNull(row.emi_total_emis);
  const totalEMIs = Math.max(0, masterTotal ?? emiTotal ?? 0);

  // Purchase amount — Vehicle Master is authoritative; fall back to the EMI
  // record's loan amount for legacy vehicles with no master purchase amount.
  const purchaseAmount = numOrNull(row.purchase_amount) ?? numOrNull(row.loan_amount) ?? 0;

  const masterDate = dateOnly(row.purchase_date);
  const emiStartDate = dateOnly(row.emi_start_date);
  const masterEmiStartDate = dateOnly(row.master_emi_start_date);
  const purchaseDate = masterDate ?? emiStartDate;

  const completedRaw = Math.max(0, num(row.paid_emis));
  const completedEMIs = Math.min(completedRaw, totalEMIs);
  const pendingEMIs = Math.max(0, totalEMIs - completedEMIs);
  const completed = totalEMIs > 0 ? completedEMIs >= totalEMIs : true;

  const monthlyEmi =
    numOrNull(row.emi_amount) ??
    (totalEMIs > 0 ? Math.round(purchaseAmount / totalEMIs) : 0);

  const emiRecordId = numOrNull(row.emi_id);
  let emiDate: string | null;
  if (completed) {
    emiDate = null;
  } else if (emiRecordId != null && row.next_emi_date != null) {
    emiDate = dateOnly(row.next_emi_date);
  } else {
    const day = numOrNull(row.emi_day);
    emiDate = day && day >= 1 ? nextOccurrenceOnOrAfter(day, new Date()) : null;
  }

  return {
    vehicleId: num(row.vehicle_id),
    vehicleNo: str(row.vehicle_number),
    financeCompany: str(row.finance_company),
    purchaseAmount,
    purchaseDate,
    emiDay: numOrNull(row.emi_day),
    totalEMIs,
    completedEMIs,
    pendingEMIs,
    emiDate,
    status: completed ? "completed" : "pending",
    monthlyEmi,
    emiRecordId,
    startDate: emiStartDate ?? masterEmiStartDate,
    endDate: dateOnly(row.emi_end_date),
  };
}

/**
 * Monthly due dates for the schedule — the "next occurrence of emiDay" rule the
 * existing EMI table uses (setDate(purchaseDate, emiDay), then advance by
 * month). The day is clamped to the month length; vehicle.emi_day is used when
 * present, otherwise the day of startDate.
 */
function monthlyDueDates(
  startDate: string,
  emiDay: number | null | undefined,
  count: number
): string[] {
  const base = new Date(`${startDate}T00:00:00Z`);
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  const day = emiDay && emiDay >= 1 ? emiDay : Math.max(1, base.getUTCDate());

  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    const firstOfMonth = new Date(Date.UTC(year, month + i, 1));
    const lastDay = new Date(Date.UTC(year, month + i + 1, 0)).getUTCDate();
    const dueDay = Math.min(day, lastDay);
    dates.push(
      isoDate(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth(), dueDay)
    );
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
function installmentAmounts(loanAmount: number, totalEMIs: number): { emiAmount: number; amounts: number[] } {
  const raw = Math.round(loanAmount / totalEMIs);
  const emiAmount = raw > 0 ? raw : 1;
  const amounts: number[] = Array(totalEMIs).fill(emiAmount);
  const total = amounts.reduce((sum, a) => sum + a, 0);
  amounts[totalEMIs - 1] = emiAmount + (loanAmount - total);
  return { emiAmount, amounts };
}

function monthsAfter(startDate: string, months: number): string {
  const base = new Date(`${startDate}T00:00:00Z`);
  const shifted = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, base.getUTCDate())
  );
  return isoDate(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}

/** Insert the full schedule (all pending) inside the caller's transaction. */
async function insertSchedule(
  client: Client,
  emiId: number,
  amounts: number[],
  dueDates: string[],
  paidCount: number,
  existingPaidAt: (string | null)[] = []
): Promise<void> {
  for (let i = 0; i < amounts.length; i++) {
    const installmentNo = i + 1;
    const isPaid = i < paidCount;
    const paidAt = isPaid ? (existingPaidAt[i] ?? new Date().toISOString()) : null;
    await client.query(
      `INSERT INTO vehicle_emi_installments
         (vehicle_emi_id, installment_no, due_date, amount, status, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [emiId, installmentNo, dueDates[i], amounts[i], isPaid ? "paid" : "pending", paidAt]
    );
  }
}

/** Resolve the vehicle registration number + emi_day from the Vehicle Master. */
async function resolveVehicle(client: Client, vehicleId: number): Promise<{
  vehicleNo: string;
  emiDay: number | null;
}> {
  const result = await client.query<{ vehicle_number: string; emi_day: number | null }>(
    `SELECT vehicle_number, emi_day FROM vehicles WHERE id = $1 LIMIT 1`,
    [vehicleId]
  );
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
async function existingPaidStamps(
  client: Client,
  emiId: number
): Promise<(string | null)[]> {
  const result = await client.query<{ paid_at: unknown }>(
    `SELECT paid_at FROM vehicle_emi_installments
     WHERE vehicle_emi_id = $1 AND status = 'paid'
     ORDER BY installment_no`,
    [emiId]
  );
  return result.rows.map((r) => (r.paid_at == null ? null : str(r.paid_at)));
}

async function fetchEmi(client: Client, emiId: number): Promise<VehicleEMI> {
  const full = await client.query(`${EMI_SELECT} WHERE e.id = $1`, [emiId]);
  if (!full.rowCount) throw new AppError(404, "EMI record not found");
  return mapEmi(full.rows[0]);
}

export const vehicleEmiService = {
  /**
   * All EMI records across every vehicle, joined with the Vehicle Master for
   * the real registration number. Optional filters mirror what the EMI page
   * needs: a vehicle-wise lookup (vehicleId), a status filter, and a free-text
   * search over the vehicle number / finance company.
   */
  async list(filters: {
    vehicleId?: number;
    status?: string;
    search?: string;
  } = {}): Promise<VehicleEMI[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];

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
    const result = await query(
      `${EMI_SELECT} ${where} ORDER BY v.vehicle_number`,
      params
    );
    return result.rows.map(mapEmi);
  },

  /**
   * EMI Management overview — read-only, derived from the Vehicle Master.
   *
   * Every ACTIVE vehicle from `vehicles` is returned (whether or not it has an
   * EMI payment record yet). The authoritative vehicle facts — vehicle number,
   * purchase amount, purchase date, total EMI, EMI day — are read from the
   * Vehicle Master; the completed/payment state is LEFT JOINed from the
   * existing EMI payment schedule (vehicle_emis + vehicle_emi_installments)
   * when one exists. Status is restricted to pending | completed.
   *
   * The EMI page consumes ONLY this endpoint for its table and dashboard
   * cards. It never creates a separate vehicle or an EMI-specific copy of the
   * master data, and it never persists vehicle-master facts here.
   */
  async overview(): Promise<EmiOverview[]> {
    const result = await query(`
      SELECT
        v.id                    AS vehicle_id,
        v.vehicle_number        AS vehicle_number,
        v.purchase_date         AS purchase_date,
        v.purchase_amount       AS purchase_amount,
        v.emi_day               AS emi_day,
        v.emi_start_date        AS master_emi_start_date,
        v.total_emis            AS master_total_emis,
        e.id                    AS emi_id,
        e.finance_company       AS finance_company,
        e.loan_amount           AS loan_amount,
        e.emi_amount            AS emi_amount,
        e.start_date            AS emi_start_date,
        e.end_date              AS emi_end_date,
        e.total_emis            AS emi_total_emis,
        e.paid_emis             AS paid_emis,
        e.next_emi_date         AS next_emi_date
      FROM vehicles v
      LEFT JOIN vehicle_emis e ON e.vehicle_id = v.id
      WHERE v.status = 'Active'
    `);
    // Deterministic default order for the EMI page: PENDING first, then
    // COMPLETED; within each group vehicle number A → Z.
    const rows = result.rows.map(mapOverviewRow);
    const statusRank: Record<EmiOverview["status"], number> = { pending: 0, completed: 1 };
    return rows.sort((a, b) => {
      const rankDiff = statusRank[a.status] - statusRank[b.status];
      if (rankDiff !== 0) return rankDiff;
      return a.vehicleNo.localeCompare(b.vehicleNo);
    });
  },

  async getById(id: number): Promise<VehicleEMI> {
    const result = await query(`${EMI_SELECT} WHERE e.id = $1`, [id]);
    if (!result.rowCount) throw new AppError(404, "EMI record not found");
    return mapEmi(result.rows[0]);
  },

  /** EMI record for a specific vehicle (used by vehicle-wise EMI views). */
  async getByVehicleId(vehicleId: number): Promise<VehicleEMI> {
    const result = await query(`${EMI_SELECT} WHERE e.vehicle_id = $1`, [vehicleId]);
    if (!result.rowCount) {
      throw new AppError(404, "No EMI record found for this vehicle");
    }
    return mapEmi(result.rows[0]);
  },

  /** The persisted installment schedule for an EMI record, oldest first. */
  async listSchedule(emiId: number): Promise<VehicleEMIInstallment[]> {
    const emi = await query(`SELECT id FROM vehicle_emis WHERE id = $1`, [emiId]);
    if (!emi.rowCount) throw new AppError(404, "EMI record not found");

    const result = await query(
      `SELECT id, vehicle_emi_id, installment_no, due_date, amount, status, paid_at
       FROM vehicle_emi_installments
       WHERE vehicle_emi_id = $1
       ORDER BY installment_no`,
      [emiId]
    );
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
  async create(body: unknown): Promise<VehicleEMI> {
    const data = parseBody(emiCreateSchema, body);

    return withTransaction(async (client) => {
      await assertVehicleExists(data.vehicleId, client);

      const existing = await client.query(
        `SELECT id FROM vehicle_emis WHERE vehicle_id = $1`,
        [data.vehicleId]
      );
      if (existing.rowCount) {
        throw new AppError(409, "An EMI record already exists for this vehicle");
      }

      const { vehicleNo, emiDay } = await resolveVehicle(client, data.vehicleId);
      const totalEMIs = num(data.totalEMIs);
      const loanAmount = num(data.loanAmount);
      const { emiAmount, amounts } = installmentAmounts(loanAmount, totalEMIs);
      const startDate = dateOnly(data.startDate) ?? "";
      const endDate = data.endDate ? dateOnly(data.endDate) : monthsAfter(startDate, totalEMIs);

      const dueDates = monthlyDueDates(startDate, emiDay, totalEMIs);
      const nextEmiDate = dueDates[0] ?? null;

      const result = await client.query(
        `INSERT INTO vehicle_emis (
           vehicle_id, finance_company, loan_amount, emi_amount, start_date, end_date,
           total_emis, paid_emis, next_emi_date, status, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, 'active', $9)
         RETURNING id`,
        [
          data.vehicleId,
          str(data.financeCompany).trim(),
          loanAmount,
          emiAmount,
          startDate,
          endDate,
          totalEMIs,
          nextEmiDate,
          data.createdBy ?? "",
        ]
      );
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
  async update(id: number, body: unknown): Promise<VehicleEMI> {
    const data = parseBody(emiUpdateSchema, body);

    return withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT id, vehicle_id, finance_company, loan_amount, emi_amount, start_date,
                end_date, total_emis, paid_emis
         FROM vehicle_emis WHERE id = $1`,
        [id]
      );
      if (!existing.rowCount) throw new AppError(404, "EMI record not found");
      const row = existing.rows[0];
      const vehicleId = num(row.vehicle_id);

      const financeCompany =
        data.financeCompany !== undefined ? str(data.financeCompany).trim() : null;

      const scheduleAffected =
        data.loanAmount !== undefined ||
        data.totalEMIs !== undefined ||
        data.startDate !== undefined ||
        data.endDate !== undefined ||
        data.emiAmount !== undefined;

      if (scheduleAffected) {
        const { emiDay } = await resolveVehicle(client, vehicleId);
        const totalEMIs = num(data.totalEMIs ?? row.total_emis);
        const loanAmount = num(data.loanAmount ?? row.loan_amount);
        const { emiAmount, amounts } =
          data.emiAmount !== undefined
            ? { emiAmount: num(data.emiAmount), amounts: null }
            : installmentAmounts(loanAmount, totalEMIs);
        const resolvedEmiAmount =
          data.emiAmount !== undefined ? num(data.emiAmount) : emiAmount;
        const startDate = dateOnly(data.startDate ?? row.start_date) ?? "";
        const endDate = data.endDate
          ? dateOnly(data.endDate)
          : monthsAfter(startDate, totalEMIs);

        // Preserve paid count + paid history. A shrunken tenure can never keep
        // more paid installments than total installments.
        const paidCount = Math.max(0, Math.min(num(row.paid_emis), totalEMIs));
        const stamps = await existingPaidStamps(client, id);

        await client.query(`DELETE FROM vehicle_emi_installments WHERE vehicle_emi_id = $1`, [id]);

        const dueDates = monthlyDueDates(startDate, emiDay, totalEMIs);
        const scheduleAmounts = amounts ?? Array(totalEMIs).fill(resolvedEmiAmount);
        await insertSchedule(client, id, scheduleAmounts, dueDates, paidCount, stamps);

        await client.query(
          `UPDATE vehicle_emis SET
             finance_company = COALESCE($2, finance_company),
             loan_amount = $3,
             emi_amount = $4,
             start_date = $5,
             end_date = $6,
             total_emis = $7
           WHERE id = $1`,
          [id, financeCompany, loanAmount, resolvedEmiAmount, startDate, endDate, totalEMIs]
        );
      } else {
        await client.query(
          `UPDATE vehicle_emis SET finance_company = COALESCE($2, finance_company)
           WHERE id = $1`,
          [id, financeCompany]
        );
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
   *
   * When `idempotencyKey` is present, a retry of the same logical payment
   * returns the already-applied result and does not pay another installment.
   * The EMI row is locked so concurrent requests cannot double-apply.
   */
  async pay(id: number, body: unknown): Promise<VehicleEMI> {
    const data = parseBody(emiPaySchema, body);
    const idempotencyKey = data.idempotencyKey?.trim() || null;

    return withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT id FROM vehicle_emis WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (!existing.rowCount) throw new AppError(404, "EMI record not found");

      if (idempotencyKey) {
        const claimed = await client.query<{ installment_id: number }>(
          `INSERT INTO vehicle_emi_payment_keys (vehicle_emi_id, idempotency_key, installment_id)
           SELECT $1, $2, i.id
             FROM vehicle_emi_installments i
            WHERE i.vehicle_emi_id = $1 AND i.status = 'pending'
            ORDER BY i.installment_no
            LIMIT 1
           ON CONFLICT (vehicle_emi_id, idempotency_key) DO NOTHING
           RETURNING installment_id`,
          [id, idempotencyKey]
        );

        if (!claimed.rowCount) {
          const prior = await client.query(
            `SELECT installment_id FROM vehicle_emi_payment_keys
             WHERE vehicle_emi_id = $1 AND idempotency_key = $2`,
            [id, idempotencyKey]
          );
          if (prior.rowCount) {
            return fetchEmi(client, id);
          }
          throw new AppError(409, "EMI is already fully paid");
        }

        await client.query(
          `UPDATE vehicle_emi_installments SET status = 'paid', paid_at = NOW()
           WHERE id = $1 AND status = 'pending'`,
          [num(claimed.rows[0].installment_id)]
        );
      } else {
        const next = await client.query(
          `SELECT id FROM vehicle_emi_installments
           WHERE vehicle_emi_id = $1 AND status = 'pending'
           ORDER BY installment_no
           LIMIT 1
           FOR UPDATE`,
          [id]
        );
        if (!next.rowCount) {
          throw new AppError(409, "EMI is already fully paid");
        }

        await client.query(
          `UPDATE vehicle_emi_installments SET status = 'paid', paid_at = NOW()
           WHERE id = $1`,
          [num(next.rows[0].id)]
        );
      }

      await recomputeAggregates(client, id);
      return fetchEmi(client, id);
    });
  },

  /**
   * Delete an EMI record and its persisted schedule. The schedule rows follow
   * via ON DELETE CASCADE inside the same transaction.
   */
  async remove(id: number) {
    return withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT vehicle_id FROM vehicle_emis WHERE id = $1`,
        [id]
      );
      if (!existing.rowCount) throw new AppError(404, "EMI record not found");
      const vehicleId = num(existing.rows[0].vehicle_id);

      await client.query(`DELETE FROM vehicle_emis WHERE id = $1`, [id]);
      return { id, vehicleId, deleted: true };
    });
  },
};