import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { dateOnly, num, numOrNull, str } from "../utils/coerce.js";
import { assertEmployeeExists, assertTripExists, assertVehicleExists, } from "../utils/fkValidation.js";
import { nextManualFuelBillNo } from "../utils/fuelBillNumbering.js";
import { assertCalendarDate, assertFinitePositive, computeFuelAmountSql, MAX_FUEL_LITRES, MAX_FUEL_RATE, parseOptionalGps, validateOptionalFuelImage, } from "../utils/fuelExpenseRules.js";
import { paginatedResult, } from "../utils/pagination.js";
import { rethrowIfAppError } from "../utils/pgErrors.js";
import { ingestCompletedTripDieselToFuel } from "../utils/tripFuelSync.js";
import { lockVehicleForMeterWrite, preciseIsoOrUndefined, validateVehicleMeter, } from "../utils/vehicleMeterLedger.js";
import { fuelApproveSchema, fuelExpenseBodySchema, fuelRejectSchema, parseBody, } from "../validation/operations.js";
function mapFuelExpense(row) {
    const opsStatus = (str(row.ops_status) || "Pending Approval");
    return {
        id: str(row.id),
        billNo: str(row.bill_no),
        billDate: dateOnly(row.expense_date) ?? "",
        sourceType: (str(row.source_type) || "MANUAL"),
        vehicleId: row.vehicle_id == null ? null : num(row.vehicle_id),
        vehicleNo: row.vehicle_no == null ? null : str(row.vehicle_no),
        driverId: row.driver_id == null ? null : num(row.driver_id),
        driverName: row.driver_name == null ? null : str(row.driver_name),
        supervisorId: row.supervisor_id == null ? null : num(row.supervisor_id),
        supervisorName: row.supervisor_name == null ? null : str(row.supervisor_name),
        tripId: row.trip_id == null ? null : num(row.trip_id),
        sourceTripId: row.source_trip_id == null ? null : num(row.source_trip_id),
        tripNo: str(row.source_trip_no || row.trip_no || "") || null,
        tripFuelEntryIndex: row.trip_fuel_entry_index == null ? null : num(row.trip_fuel_entry_index),
        currentMeter: num(row.meter_reading),
        fuelRate: num(row.rate),
        liters: num(row.litres),
        amount: num(row.amount),
        pumpName: str(row.pump_name || row.petrol_bunk),
        bunkAddress: row.bunk_address == null ? null : str(row.bunk_address),
        remarks: row.remarks == null ? null : str(row.remarks),
        gpsLat: numOrNull(row.gps_lat),
        gpsLon: numOrNull(row.gps_lon),
        gpsAccuracy: numOrNull(row.gps_accuracy),
        gpsCapturedAt: row.gps_captured_at == null ? null : str(row.gps_captured_at),
        status: opsStatus,
        imageData: row.image_data == null ? null : str(row.image_data),
        imageName: row.image_name == null ? null : str(row.image_name),
        imageMime: row.image_mime == null ? null : str(row.image_mime),
        deleted: Boolean(row.deleted),
        deletedReason: row.deleted_reason == null ? null : str(row.deleted_reason),
        approvedBy: row.approved_by == null ? null : str(row.approved_by),
        approvedAt: row.approved_date == null ? null : str(row.approved_date),
        rejectedBy: row.rejected_by == null ? null : str(row.rejected_by),
        rejectedAt: row.rejected_at == null ? null : str(row.rejected_at),
        rejectedReason: row.rejected_reason == null ? null : str(row.rejected_reason),
        createdBy: str(row.created_by),
        createdAt: row.created_at == null ? null : str(row.created_at),
        updatedAt: row.updated_at == null ? null : str(row.updated_at),
    };
}
const FUEL_SELECT = `
  SELECT fe.*, COALESCE(fe.source_trip_no, t.trip_no) AS trip_no
  FROM fuel_expenses fe
  LEFT JOIN trips t ON t.id = fe.trip_id
`;
function buildFuelWhere(filters) {
    const clauses = [];
    const params = [];
    if (!filters.includeDeleted) {
        clauses.push(`COALESCE(fe.deleted, FALSE) = FALSE`);
    }
    clauses.push(`(fe.source_type <> 'TRIP' OR fe.ops_status = 'Approved'::ops_record_status)`);
    if (filters.vehicleId) {
        params.push(filters.vehicleId);
        clauses.push(`fe.vehicle_id = $${params.length}`);
    }
    if (filters.vehicleNo) {
        params.push(filters.vehicleNo);
        clauses.push(`fe.vehicle_no = $${params.length}`);
    }
    if (filters.driverId) {
        params.push(filters.driverId);
        clauses.push(`fe.driver_id = $${params.length}`);
    }
    if (filters.fromDate) {
        params.push(filters.fromDate);
        clauses.push(`fe.expense_date >= $${params.length}`);
    }
    if (filters.toDate) {
        params.push(filters.toDate);
        clauses.push(`fe.expense_date <= $${params.length}`);
    }
    if (filters.status && filters.status !== "ALL") {
        const statusMap = {
            Pending: "Pending Approval",
            Approved: "Approved",
            Rejected: "Rejected",
            "Pending Approval": "Pending Approval",
        };
        params.push(statusMap[filters.status] ?? filters.status);
        clauses.push(`fe.ops_status = $${params.length}::ops_record_status`);
    }
    if (filters.sourceType && filters.sourceType !== "ALL") {
        params.push(filters.sourceType);
        clauses.push(`fe.source_type = $${params.length}::fuel_source_type`);
    }
    if (filters.tripNo) {
        params.push(`%${filters.tripNo}%`);
        clauses.push(`(COALESCE(fe.source_trip_no, t.trip_no) ILIKE $${params.length})`);
    }
    if (filters.billNo) {
        params.push(`%${filters.billNo}%`);
        clauses.push(`fe.bill_no ILIKE $${params.length}`);
    }
    if (filters.search) {
        params.push(`%${filters.search}%`);
        const p = params.length;
        clauses.push(`(fe.bill_no ILIKE $${p} OR fe.vehicle_no ILIKE $${p} OR fe.driver_name ILIKE $${p} OR COALESCE(fe.source_trip_no, t.trip_no) ILIKE $${p})`);
    }
    return {
        where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
        params,
    };
}
const FUEL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertFuelId(id) {
    if (!FUEL_UUID.test(id)) {
        throw new AppError(400, "Invalid fuel expense id.");
    }
}
async function computeAmount(client, litres, rate) {
    return computeFuelAmountSql(client, litres, rate);
}
const FUEL_LIST_CAP = 200;
export const fuelExpensesService = {
    async reconcileTripOrigin() {
        return withTransaction(async (client) => {
            try {
                return await ingestCompletedTripDieselToFuel(client);
            }
            catch (err) {
                rethrowIfAppError(err);
                throw new AppError(500, "Fuel trip ingest failed.");
            }
        });
    },
    async list(filters = {}) {
        await this.reconcileTripOrigin();
        const { where, params } = buildFuelWhere(filters);
        if (filters.pagination) {
            const countResult = await query(`SELECT COUNT(*)::text AS c FROM fuel_expenses fe LEFT JOIN trips t ON t.id = fe.trip_id ${where}`, params);
            const total = Number(countResult.rows[0]?.c ?? 0);
            const pagedParams = [...params, filters.pagination.limit, filters.pagination.offset];
            const result = await query(`${FUEL_SELECT} ${where}
         ORDER BY fe.expense_date DESC, fe.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, pagedParams);
            return paginatedResult(result.rows.map(mapFuelExpense), total, filters.pagination);
        }
        const result = await query(`${FUEL_SELECT} ${where} ORDER BY fe.expense_date DESC, fe.created_at DESC LIMIT ${FUEL_LIST_CAP}`, params);
        return result.rows.map(mapFuelExpense);
    },
    async getById(id) {
        assertFuelId(id);
        await this.reconcileTripOrigin();
        const result = await query(`${FUEL_SELECT}
       WHERE fe.id = $1
         AND COALESCE(fe.deleted, FALSE) = FALSE
         AND (fe.source_type <> 'TRIP' OR fe.ops_status = 'Approved'::ops_record_status)`, [id]);
        if (!result.rowCount)
            throw new AppError(404, "Fuel expense not found");
        return mapFuelExpense(result.rows[0]);
    },
    async create(body) {
        const data = parseBody(fuelExpenseBodySchema, body);
        return withTransaction(async (client) => {
            try {
                if (data.vehicleId == null) {
                    throw new AppError(422, "Vehicle is required.");
                }
                const billDate = assertCalendarDate(data.billDate);
                const liters = assertFinitePositive(data.liters, "Litres", MAX_FUEL_LITRES);
                const fuelRate = assertFinitePositive(data.fuelRate, "Rate per litre", MAX_FUEL_RATE);
                const gps = parseOptionalGps({
                    gpsLat: data.gpsLat,
                    gpsLon: data.gpsLon,
                    gpsAccuracy: data.gpsAccuracy,
                });
                const image = validateOptionalFuelImage(data.imageData, data.imageName);
                await assertVehicleExists(data.vehicleId, client);
                await assertEmployeeExists(data.driverId, "Driver", client);
                await assertEmployeeExists(data.supervisorId, "Supervisor", client);
                if (data.tripId != null) {
                    await assertTripExists(data.tripId, client);
                    const trip = await client.query(`SELECT vehicle_id FROM trips WHERE id = $1 AND COALESCE(deleted, FALSE) = FALSE`, [data.tripId]);
                    const tripVehicle = numOrNull(trip.rows[0]?.vehicle_id);
                    if (tripVehicle != null && tripVehicle !== data.vehicleId) {
                        throw new AppError(422, "Trip does not belong to the selected vehicle.");
                    }
                }
                if (data.currentMeter != null && data.currentMeter > 0) {
                    await lockVehicleForMeterWrite(client, data.vehicleId);
                    await validateVehicleMeter(client, {
                        vehicleId: data.vehicleId,
                        newMeter: data.currentMeter,
                        eventDate: billDate,
                        context: "Fuel meter reading",
                    });
                }
                const amount = await computeAmount(client, liters, fuelRate);
                const billNo = await nextManualFuelBillNo(client, billDate);
                const pumpName = data.pumpName ?? "";
                const result = await client.query(`INSERT INTO fuel_expenses (
             bill_no, expense_date, vehicle_id, vehicle_no, driver_id, driver_name,
             supervisor_id, supervisor_name, trip_id, source_type, meter_reading, amount, rate,
             litres, petrol_bunk, pump_name, bunk_address, remarks, status, ops_status,
             image_data, image_name, image_mime,
             gps_lat, gps_lon, gps_accuracy, gps_captured_at, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'MANUAL',$10,$11,$12,$13,$14,$14,$15,$16,
             'Pending'::approval_status,'Pending Approval'::ops_record_status,$17,$18,$19,
             $21,$22,$23,$24,$20)
           RETURNING *`, [
                    billNo,
                    billDate,
                    data.vehicleId,
                    data.vehicleNo ?? null,
                    data.driverId ?? null,
                    data.driverName ?? null,
                    data.supervisorId ?? null,
                    data.supervisorName ?? null,
                    data.tripId ?? null,
                    data.currentMeter ?? 0,
                    amount,
                    fuelRate,
                    liters,
                    pumpName,
                    data.bunkAddress ?? "",
                    data.remarks ?? null,
                    image.data,
                    image.name,
                    image.mime ?? data.imageMime ?? null,
                    data.createdBy ?? "",
                    gps.lat,
                    gps.lon,
                    gps.accuracy,
                    data.gpsCapturedAt ?? null,
                ]);
                return mapFuelExpense(result.rows[0]);
            }
            catch (err) {
                rethrowIfAppError(err);
                throw err;
            }
        });
    },
    async update(id, body) {
        assertFuelId(id);
        const data = parseBody(fuelExpenseBodySchema.partial(), body);
        return withTransaction(async (client) => {
            try {
                const existing = await client.query(`SELECT source_type, ops_status, vehicle_id, expense_date, created_at
           FROM fuel_expenses WHERE id = $1 AND COALESCE(deleted, FALSE) = FALSE`, [id]);
                if (!existing.rowCount)
                    throw new AppError(404, "Fuel expense not found");
                if (existing.rows[0].source_type === "TRIP") {
                    throw new AppError(409, "Trip-origin fuel records are independent posted financial records and cannot be edited.");
                }
                if (existing.rows[0].ops_status === "Approved") {
                    throw new AppError(409, "Approved fuel expenses cannot be edited.");
                }
                if (existing.rows[0].ops_status !== "Pending Approval" && existing.rows[0].ops_status !== "Draft") {
                    throw new AppError(409, `Fuel expense is already ${existing.rows[0].ops_status}`);
                }
                await assertVehicleExists(data.vehicleId, client);
                await assertEmployeeExists(data.driverId, "Driver", client);
                await assertTripExists(data.tripId, client);
                if (data.currentMeter != null) {
                    const vehicleId = data.vehicleId ?? numOrNull(existing.rows[0].vehicle_id);
                    const eventDate = data.billDate ?? dateOnly(existing.rows[0].expense_date) ?? undefined;
                    if (vehicleId != null && eventDate) {
                        await lockVehicleForMeterWrite(client, vehicleId);
                        await validateVehicleMeter(client, {
                            vehicleId,
                            newMeter: data.currentMeter,
                            eventDate,
                            eventInstant: preciseIsoOrUndefined(existing.rows[0].created_at),
                            exclude: { sourceType: "FUEL", recordId: id },
                            context: "Fuel meter reading",
                        });
                    }
                }
                let amount = null;
                if (data.liters != null || data.fuelRate != null) {
                    const liters = assertFinitePositive(data.liters ??
                        num((await client.query(`SELECT litres FROM fuel_expenses WHERE id = $1`, [id])).rows[0].litres), "Litres", MAX_FUEL_LITRES);
                    const fuelRate = assertFinitePositive(data.fuelRate ??
                        num((await client.query(`SELECT rate FROM fuel_expenses WHERE id = $1`, [id])).rows[0]
                            .rate), "Rate per litre", MAX_FUEL_RATE);
                    amount = await computeAmount(client, liters, fuelRate);
                }
                const gps = data.gpsLat !== undefined || data.gpsLon !== undefined
                    ? parseOptionalGps({
                        gpsLat: data.gpsLat,
                        gpsLon: data.gpsLon,
                        gpsAccuracy: data.gpsAccuracy,
                    })
                    : null;
                const image = data.imageData !== undefined
                    ? validateOptionalFuelImage(data.imageData, data.imageName)
                    : null;
                const billDate = data.billDate ? assertCalendarDate(data.billDate) : null;
                const result = await client.query(`UPDATE fuel_expenses SET
             expense_date = COALESCE($2, expense_date),
             vehicle_id = COALESCE($3, vehicle_id),
             vehicle_no = COALESCE($4, vehicle_no),
             driver_id = COALESCE($5, driver_id),
             driver_name = COALESCE($6, driver_name),
             supervisor_id = COALESCE($7, supervisor_id),
             supervisor_name = COALESCE($8, supervisor_name),
             trip_id = COALESCE($9, trip_id),
             meter_reading = COALESCE($10, meter_reading),
             amount = COALESCE($11, amount),
             rate = COALESCE($12, rate),
             litres = COALESCE($13, litres),
             petrol_bunk = COALESCE($14, petrol_bunk),
             pump_name = COALESCE($14, pump_name),
             bunk_address = COALESCE($15, bunk_address),
             remarks = COALESCE($16, remarks),
             image_data = COALESCE($17, image_data),
             image_name = COALESCE($18, image_name),
             image_mime = COALESCE($19, image_mime),
             gps_lat = COALESCE($21, gps_lat),
             gps_lon = COALESCE($22, gps_lon),
             gps_accuracy = COALESCE($23, gps_accuracy),
             gps_captured_at = COALESCE($24, gps_captured_at),
             created_by = COALESCE($20, created_by)
           WHERE id = $1 AND COALESCE(deleted, FALSE) = FALSE
           RETURNING *`, [
                    id,
                    billDate,
                    data.vehicleId ?? null,
                    data.vehicleNo ?? null,
                    data.driverId ?? null,
                    data.driverName ?? null,
                    data.supervisorId ?? null,
                    data.supervisorName ?? null,
                    data.tripId ?? null,
                    data.currentMeter ?? null,
                    amount,
                    data.fuelRate ?? null,
                    data.liters ?? null,
                    data.pumpName ?? null,
                    data.bunkAddress ?? null,
                    data.remarks ?? null,
                    image?.data ?? null,
                    image?.name ?? null,
                    image?.mime ?? data.imageMime ?? null,
                    data.createdBy ?? null,
                    gps?.lat ?? null,
                    gps?.lon ?? null,
                    gps?.accuracy ?? null,
                    data.gpsCapturedAt ?? null,
                ]);
                if (!result.rowCount)
                    throw new AppError(404, "Fuel expense not found");
                return mapFuelExpense(result.rows[0]);
            }
            catch (err) {
                rethrowIfAppError(err);
                throw err;
            }
        });
    },
    async approve(id, body) {
        assertFuelId(id);
        const data = parseBody(fuelApproveSchema, body);
        return withTransaction(async (client) => {
            const existing = await client.query(`SELECT source_type, ops_status FROM fuel_expenses WHERE id = $1 AND COALESCE(deleted, FALSE) = FALSE FOR UPDATE`, [id]);
            if (!existing.rowCount)
                throw new AppError(404, "Fuel expense not found");
            const row = existing.rows[0];
            if (row.source_type === "TRIP") {
                throw new AppError(409, "Trip-generated fuel is approved automatically on trip completion");
            }
            if (row.ops_status === "Approved") {
                throw new AppError(409, "Fuel expense is already Approved");
            }
            if (row.ops_status !== "Pending Approval" && row.ops_status !== "Draft") {
                throw new AppError(409, `Fuel expense is already ${row.ops_status}`);
            }
            const result = await client.query(`UPDATE fuel_expenses SET
           status = 'Approved'::approval_status,
           ops_status = 'Approved'::ops_record_status,
           approved_by = $2,
           approved_date = NOW(),
           rejected_by = NULL,
           rejected_at = NULL,
           rejected_reason = NULL,
           updated_at = NOW()
         WHERE id = $1
         RETURNING *`, [id, data.approvedBy ?? "system"]);
            return mapFuelExpense(result.rows[0]);
        });
    },
    async reject(id, body) {
        assertFuelId(id);
        const data = parseBody(fuelRejectSchema, body);
        return withTransaction(async (client) => {
            const existing = await client.query(`SELECT source_type, ops_status FROM fuel_expenses WHERE id = $1 AND COALESCE(deleted, FALSE) = FALSE FOR UPDATE`, [id]);
            if (!existing.rowCount)
                throw new AppError(404, "Fuel expense not found");
            const row = existing.rows[0];
            if (row.source_type === "TRIP") {
                throw new AppError(409, "Trip-generated fuel cannot be rejected through this action");
            }
            if (row.ops_status !== "Pending Approval" && row.ops_status !== "Draft") {
                throw new AppError(409, `Fuel expense is already ${row.ops_status}`);
            }
            const result = await client.query(`UPDATE fuel_expenses SET
           status = 'Pending'::approval_status,
           ops_status = 'Rejected'::ops_record_status,
           rejected_by = $2,
           rejected_at = NOW(),
           rejected_reason = $3,
           updated_at = NOW()
         WHERE id = $1
         RETURNING *`, [id, data.rejectedBy ?? "system", data.reason]);
            return mapFuelExpense(result.rows[0]);
        });
    },
    async softDelete(id, reason) {
        assertFuelId(id);
        return withTransaction(async (client) => {
            try {
                const existing = await client.query(`SELECT source_type, ops_status FROM fuel_expenses WHERE id = $1 AND COALESCE(deleted, FALSE) = FALSE`, [id]);
                if (!existing.rowCount)
                    throw new AppError(404, "Fuel expense not found");
                if (existing.rows[0].source_type === "TRIP") {
                    throw new AppError(409, "Trip-generated fuel records cannot be deleted from Fuel Expenses.");
                }
                if (existing.rows[0].ops_status === "Approved") {
                    throw new AppError(409, "Approved fuel expenses cannot be deleted.");
                }
                const result = await client.query(`UPDATE fuel_expenses SET
             deleted = TRUE,
             deleted_reason = $2,
             ops_status = 'Deleted'::ops_record_status,
             status = 'Pending'::approval_status
           WHERE id = $1 AND COALESCE(deleted, FALSE) = FALSE
           RETURNING *`, [id, reason ?? null]);
                if (!result.rowCount)
                    throw new AppError(404, "Fuel expense not found");
                return mapFuelExpense(result.rows[0]);
            }
            catch (err) {
                if (err.code === "42703") {
                    throw new AppError(400, "Fuel expense soft-delete requires migration 004 (deleted column)");
                }
                rethrowIfAppError(err);
                throw err;
            }
        });
    },
};
//# sourceMappingURL=fuelExpensesService.js.map