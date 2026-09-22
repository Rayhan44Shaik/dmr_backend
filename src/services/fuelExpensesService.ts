import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import type { FuelExpense, FuelSourceType, OpsRecordStatus } from "../types/operations.js";
import { dateOnly, num, numOrNull, str } from "../utils/coerce.js";
import {
  assertEmployeeExists,
  assertTripExists,
  assertVehicleExists,
} from "../utils/fkValidation.js";
import { nextDocNo } from "../utils/operationsHelpers.js";
import {
  paginatedResult,
  type PaginatedResult,
  type PaginationParams,
} from "../utils/pagination.js";
import { rethrowIfAppError } from "../utils/pgErrors.js";
import {
  lockVehicleForMeterWrite,
  preciseIsoOrUndefined,
  validateVehicleMeter,
} from "../utils/vehicleMeterLedger.js";
import {
  fuelApproveSchema,
  fuelExpenseBodySchema,
  fuelRejectSchema,
  parseBody,
} from "../validation/operations.js";

/** ops_status is the canonical 3(+2)-state approval field; legacy `status`
 * (approval_status: Pending/Approved only) is mirrored best-effort for any
 * older code paths still reading it directly. */
function toLegacyApproval(opsStatus: OpsRecordStatus): "Pending" | "Approved" {
  return opsStatus === "Approved" ? "Approved" : "Pending";
}

function mapFuelExpense(row: Record<string, unknown>): FuelExpense {
  const opsStatus = (str(row.ops_status) || "Pending Approval") as OpsRecordStatus;
  return {
    id: str(row.id),
    billNo: str(row.bill_no),
    billDate: dateOnly(row.expense_date) ?? "",
    sourceType: (str(row.source_type) || "MANUAL") as FuelSourceType,
    vehicleId: row.vehicle_id == null ? null : num(row.vehicle_id),
    vehicleNo: row.vehicle_no == null ? null : str(row.vehicle_no),
    driverId: row.driver_id == null ? null : num(row.driver_id),
    driverName: row.driver_name == null ? null : str(row.driver_name),
    supervisorId: row.supervisor_id == null ? null : num(row.supervisor_id),
    supervisorName: row.supervisor_name == null ? null : str(row.supervisor_name),
    tripId: row.trip_id == null ? null : num(row.trip_id),
    tripNo: row.trip_no == null ? null : str(row.trip_no),
    tripFuelEntryIndex: row.trip_fuel_entry_index == null ? null : num(row.trip_fuel_entry_index),
    currentMeter: num(row.meter_reading),
    fuelRate: num(row.rate),
    liters: num(row.litres),
    amount: num(row.amount),
    pumpName: str(row.pump_name || row.petrol_bunk),
    bunkAddress: row.bunk_address == null ? null : str(row.bunk_address),
    gpsLat: row.gps_lat == null ? null : num(row.gps_lat),
    gpsLon: row.gps_lon == null ? null : num(row.gps_lon),
    gpsAccuracy: row.gps_accuracy == null ? null : num(row.gps_accuracy),
    gpsCapturedAt: row.gps_captured_at == null ? null : str(row.gps_captured_at),
    remarks: row.remarks == null ? null : str(row.remarks),
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
  SELECT fe.*, t.trip_no
  FROM fuel_expenses fe
  LEFT JOIN trips t ON t.id = fe.trip_id
`;

function buildFuelWhere(filters: {
  vehicleId?: number;
  driverId?: number;
  fromDate?: string;
  toDate?: string;
  status?: string;
  sourceType?: string;
  fuelType?: string;
  search?: string;
  includeDeleted?: boolean;
}) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (!filters.includeDeleted) {
    clauses.push(`COALESCE(fe.deleted, FALSE) = FALSE`);
  }
  // Trip-generated fuel (source_type = 'TRIP') is hidden until its related
  // trip reaches the Completed status. Manual fuel keeps its own approval
  // workflow and is unaffected. The trip status lives on `trips` (aliased `t`),
  // which both the count and data queries below LEFT JOIN.
  clauses.push(
    `(fe.source_type <> 'TRIP' OR (t.status = 'Completed' AND COALESCE(t.deleted, FALSE) = FALSE))`
  );
  if (filters.vehicleId) {
    params.push(filters.vehicleId);
    clauses.push(`fe.vehicle_id = $${params.length}`);
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
    params.push(filters.status);
    clauses.push(`fe.ops_status = $${params.length}::ops_record_status`);
  }
  if (filters.sourceType && filters.sourceType !== "ALL") {
    params.push(filters.sourceType);
    clauses.push(`fe.source_type = $${params.length}::fuel_source_type`);
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    const p = params.length;
    clauses.push(
      `(fe.bill_no ILIKE $${p} OR fe.vehicle_no ILIKE $${p} OR fe.driver_name ILIKE $${p} OR t.trip_no ILIKE $${p})`
    );
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

export const fuelExpensesService = {
  async list(
    filters: {
      vehicleId?: number;
      driverId?: number;
      fromDate?: string;
      toDate?: string;
      status?: string;
      sourceType?: string;
      search?: string;
      includeDeleted?: boolean;
      pagination?: PaginationParams | null;
    } = {}
  ): Promise<FuelExpense[] | PaginatedResult<FuelExpense>> {
    const { where, params } = buildFuelWhere(filters);

    if (filters.pagination) {
      const countResult = await query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM fuel_expenses fe LEFT JOIN trips t ON t.id = fe.trip_id ${where}`,
        params
      );
      const total = Number(countResult.rows[0]?.c ?? 0);
      const pagedParams = [...params, filters.pagination.limit, filters.pagination.offset];
      const result = await query(
        `${FUEL_SELECT} ${where}
         ORDER BY fe.expense_date DESC, fe.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        pagedParams
      );
      return paginatedResult(result.rows.map(mapFuelExpense), total, filters.pagination);
    }

    const result = await query(
      `${FUEL_SELECT} ${where} ORDER BY fe.expense_date DESC, fe.created_at DESC`,
      params
    );
    return result.rows.map(mapFuelExpense);
  },

  async getById(id: string) {
    const result = await query(
      `${FUEL_SELECT}
       WHERE fe.id = $1
         AND COALESCE(fe.deleted, FALSE) = FALSE
         AND (fe.source_type <> 'TRIP' OR (t.status = 'Completed' AND COALESCE(t.deleted, FALSE) = FALSE))`,
      [id]
    );
    if (!result.rowCount) throw new AppError(404, "Fuel expense not found");
    return mapFuelExpense(result.rows[0]);
  },

  /** Manual fuel entry only — Trip fuel is created exclusively by
   * syncDieselToFuelExpenses (tripFuelSync.ts) during Step 5 submission. */
  async create(body: unknown) {
    const data = parseBody(fuelExpenseBodySchema, body);

    return withTransaction(async (client) => {
      try {
        await assertVehicleExists(data.vehicleId, client);
        await assertEmployeeExists(data.driverId, "Driver", client);
        await assertEmployeeExists(data.supervisorId, "Supervisor", client);
        await assertTripExists(data.tripId, client);

        // Universal vehicle meter validation — manual fuel entry only (trip
        // -generated fuel is validated as part of the Trip Step 5 submission
        // in tripsService.ts, never edited directly here — see update() below).
        if (data.vehicleId != null && data.currentMeter != null) {
          await lockVehicleForMeterWrite(client, data.vehicleId);
          await validateVehicleMeter(client, {
            vehicleId: data.vehicleId,
            newMeter: data.currentMeter,
            eventDate: data.billDate,
            context: "Fuel meter reading",
          });
        }

        const liters = data.liters ?? 0;
        const fuelRate = data.fuelRate ?? 0;
        // Amount is always server-computed — never trust a client-supplied amount.
        const amount = Number((liters * fuelRate).toFixed(2));
        const billNo =
          data.billNo || (await nextDocNo(client, "FUEL", "fuel_expenses", "bill_no"));
        const pumpName = data.pumpName ?? "";

        const result = await client.query(
          `INSERT INTO fuel_expenses (
             bill_no, expense_date, vehicle_id, vehicle_no, driver_id, driver_name,
             supervisor_id, supervisor_name, trip_id, source_type, meter_reading, amount, rate,
             litres, petrol_bunk, pump_name, bunk_address, remarks, status, ops_status,
             image_data, image_name, image_mime, gps_lat, gps_lon, gps_accuracy, gps_captured_at, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'MANUAL',$10,$11,$12,$13,$14,$14,$15,$16,
             'Pending'::approval_status,'Pending Approval'::ops_record_status,$17,$18,$19,$20,$21,$22,$23,$24)
           RETURNING *`,
          [
            billNo,
            data.billDate,
            data.vehicleId ?? null,
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
            data.imageData ?? null,
            data.imageName ?? null,
            data.imageMime ?? null,
            data.gpsLat ?? null,
            data.gpsLon ?? null,
            data.gpsAccuracy ?? null,
            data.gpsCapturedAt ?? null,
            data.createdBy ?? "",
          ]
        );
        return mapFuelExpense(result.rows[0]);
      } catch (err) {
        rethrowIfAppError(err);
        throw err;
      }
    });
  },

  async update(id: string, body: unknown) {
    const data = parseBody(fuelExpenseBodySchema.partial(), body);

    return withTransaction(async (client) => {
      try {
        const existing = await client.query(
          `SELECT source_type, ops_status, vehicle_id, expense_date, created_at
           FROM fuel_expenses WHERE id = $1 AND COALESCE(deleted, FALSE) = FALSE`,
          [id]
        );
        if (!existing.rowCount) throw new AppError(404, "Fuel expense not found");
        if (existing.rows[0].source_type === "TRIP") {
          throw new AppError(
            409,
            "Trip-generated fuel records cannot be edited directly. Edit the Trip's Step 5 diesel entry instead."
          );
        }

        await assertVehicleExists(data.vehicleId, client);
        await assertEmployeeExists(data.driverId, "Driver", client);
        await assertTripExists(data.tripId, client);

        // Universal vehicle meter validation, excluding this record's own
        // previously-persisted reading so an edit never compares against itself.
        if (data.currentMeter != null) {
          const vehicleId = data.vehicleId ?? numOrNull(existing.rows[0].vehicle_id);
          const eventDate = data.billDate ?? dateOnly(existing.rows[0].expense_date) ?? undefined;
          if (vehicleId != null && eventDate) {
            await lockVehicleForMeterWrite(client, vehicleId);
            await validateVehicleMeter(client, {
              vehicleId,
              newMeter: data.currentMeter,
              eventDate,
              // Preserve the record's own original instant rather than
              // defaulting to "now" (see fleetMaintenanceService.update() for
              // the same fix and why it matters).
              eventInstant: preciseIsoOrUndefined(existing.rows[0].created_at),
              exclude: { sourceType: "FUEL", recordId: id },
              context: "Fuel meter reading",
            });
          }
        }

        const liters = data.liters;
        const fuelRate = data.fuelRate;
        const amount =
          liters != null && fuelRate != null ? Number((liters * fuelRate).toFixed(2)) : null;

        const result = await client.query(
          `UPDATE fuel_expenses SET
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
             gps_lat = COALESCE($20, gps_lat),
             gps_lon = COALESCE($21, gps_lon),
             gps_accuracy = COALESCE($22, gps_accuracy),
             gps_captured_at = COALESCE($23, gps_captured_at),
             created_by = COALESCE($24, created_by)
           WHERE id = $1 AND COALESCE(deleted, FALSE) = FALSE
           RETURNING *`,
          [
            id,
            data.billDate ?? null,
            data.vehicleId ?? null,
            data.vehicleNo ?? null,
            data.driverId ?? null,
            data.driverName ?? null,
            data.supervisorId ?? null,
            data.supervisorName ?? null,
            data.tripId ?? null,
            data.currentMeter ?? null,
            amount,
            fuelRate ?? null,
            liters ?? null,
            data.pumpName ?? null,
            data.bunkAddress ?? null,
            data.remarks ?? null,
            data.imageData ?? null,
            data.imageName ?? null,
            data.imageMime ?? null,
            data.gpsLat ?? null,
            data.gpsLon ?? null,
            data.gpsAccuracy ?? null,
            data.gpsCapturedAt ?? null,
            data.createdBy ?? null,
          ]
        );
        if (!result.rowCount) throw new AppError(404, "Fuel expense not found");
        return mapFuelExpense(result.rows[0]);
      } catch (err) {
        rethrowIfAppError(err);
        throw err;
      }
    });
  },

  /** Approve a PENDING manual fuel expense. Trip-generated fuel is
   * auto-approved by tripsService.updateStatus on trip completion and is
   * never approved through this manual action. */
  async approve(id: string, body: unknown) {
    const data = parseBody(fuelApproveSchema, body);

    return withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT source_type, ops_status FROM fuel_expenses WHERE id = $1 AND COALESCE(deleted, FALSE) = FALSE`,
        [id]
      );
      if (!existing.rowCount) throw new AppError(404, "Fuel expense not found");
      const row = existing.rows[0];
      if (row.source_type === "TRIP") {
        throw new AppError(409, "Trip-generated fuel is approved automatically on trip completion");
      }
      if (row.ops_status !== "Pending Approval" && row.ops_status !== "Draft") {
        throw new AppError(409, `Fuel expense is already ${row.ops_status}`);
      }

      const result = await client.query(
        `UPDATE fuel_expenses SET
           status = 'Approved'::approval_status,
           ops_status = 'Approved'::ops_record_status,
           approved_by = $2,
           approved_date = NOW(),
           rejected_by = NULL,
           rejected_at = NULL,
           rejected_reason = NULL,
           updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, data.approvedBy ?? "system"]
      );
      return mapFuelExpense(result.rows[0]);
    });
  },

  /** Reject a PENDING manual fuel expense. A reason is mandatory. */
  async reject(id: string, body: unknown) {
    const data = parseBody(fuelRejectSchema, body);

    return withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT source_type, ops_status FROM fuel_expenses WHERE id = $1 AND COALESCE(deleted, FALSE) = FALSE`,
        [id]
      );
      if (!existing.rowCount) throw new AppError(404, "Fuel expense not found");
      const row = existing.rows[0];
      if (row.source_type === "TRIP") {
        throw new AppError(409, "Trip-generated fuel cannot be rejected through this action");
      }
      if (row.ops_status !== "Pending Approval" && row.ops_status !== "Draft") {
        throw new AppError(409, `Fuel expense is already ${row.ops_status}`);
      }

      const result = await client.query(
        `UPDATE fuel_expenses SET
           status = 'Pending'::approval_status,
           ops_status = 'Rejected'::ops_record_status,
           rejected_by = $2,
           rejected_at = NOW(),
           rejected_reason = $3,
           updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, data.rejectedBy ?? "system", data.reason]
      );
      return mapFuelExpense(result.rows[0]);
    });
  },

  async softDelete(id: string, reason?: string) {
    return withTransaction(async (client) => {
      try {
        const result = await client.query(
          `UPDATE fuel_expenses SET
             deleted = TRUE,
             deleted_reason = $2,
             ops_status = 'Deleted'::ops_record_status,
             status = 'Pending'::approval_status
           WHERE id = $1 AND COALESCE(deleted, FALSE) = FALSE
           RETURNING *`,
          [id, reason ?? null]
        );
        if (!result.rowCount) throw new AppError(404, "Fuel expense not found");
        return mapFuelExpense(result.rows[0]);
      } catch (err) {
        if ((err as { code?: string }).code === "42703") {
          throw new AppError(
            400,
            "Fuel expense soft-delete requires migration 004 (deleted column)"
          );
        }
        rethrowIfAppError(err);
        throw err;
      }
    });
  },
};
