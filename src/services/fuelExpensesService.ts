import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import type { FuelExpense, OpsRecordStatus } from "../types/operations.js";
import { dateOnly, num, str } from "../utils/coerce.js";
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
  assertOpsStatus,
  fuelExpenseBodySchema,
  parseBody,
} from "../validation/operations.js";

function toOpsStatus(approvalStatus: string): OpsRecordStatus {
  return approvalStatus === "Approved" ? "Approved" : "Pending Approval";
}

function toApprovalStatus(opsStatus: string): "Pending" | "Approved" {
  return opsStatus === "Approved" ? "Approved" : "Pending";
}

function mapFuelExpense(row: Record<string, unknown>): FuelExpense {
  const approval = str(row.status);
  return {
    id: str(row.id),
    billNo: str(row.bill_no),
    billDate: dateOnly(row.expense_date) ?? "",
    vehicleId: row.vehicle_id == null ? null : num(row.vehicle_id),
    vehicleNo: row.vehicle_no == null ? null : str(row.vehicle_no),
    driverId: row.driver_id == null ? null : num(row.driver_id),
    driverName: row.driver_name == null ? null : str(row.driver_name),
    supervisorId: row.supervisor_id == null ? null : num(row.supervisor_id),
    supervisorName: row.supervisor_name == null ? null : str(row.supervisor_name),
    tripId: row.trip_id == null ? null : num(row.trip_id),
    currentMeter: num(row.meter_reading),
    fuelRate: num(row.rate),
    liters: num(row.litres),
    amount: num(row.amount),
    pumpName: str(row.petrol_bunk || row.pump_name),
    remarks: row.remarks == null ? null : str(row.remarks),
    status: toOpsStatus(approval),
    imageData: row.image_data == null ? null : str(row.image_data),
    deleted: Boolean(row.deleted),
    approvedBy: row.approved_by == null ? null : str(row.approved_by),
    approvedAt: row.approved_date == null ? null : str(row.approved_date),
    createdBy: str(row.created_by),
    createdAt: row.created_at == null ? null : str(row.created_at),
    updatedAt: row.updated_at == null ? null : str(row.updated_at),
  };
}

function buildFuelWhere(filters: {
  vehicleId?: number;
  fromDate?: string;
  toDate?: string;
  status?: string;
  includeDeleted?: boolean;
}) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (!filters.includeDeleted) {
    clauses.push(`COALESCE(deleted, FALSE) = FALSE`);
  }
  if (filters.vehicleId) {
    params.push(filters.vehicleId);
    clauses.push(`vehicle_id = $${params.length}`);
  }
  if (filters.fromDate) {
    params.push(filters.fromDate);
    clauses.push(`expense_date >= $${params.length}`);
  }
  if (filters.toDate) {
    params.push(filters.toDate);
    clauses.push(`expense_date <= $${params.length}`);
  }
  if (filters.status === "Approved") {
    clauses.push(`status = 'Approved'`);
  } else if (
    filters.status === "Pending Approval" ||
    filters.status === "Draft" ||
    filters.status === "Rejected"
  ) {
    clauses.push(`status = 'Pending'`);
  } else if (filters.status === "Deleted") {
    clauses.push(`COALESCE(deleted, FALSE) = TRUE`);
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
      fromDate?: string;
      toDate?: string;
      status?: string;
      includeDeleted?: boolean;
      pagination?: PaginationParams | null;
    } = {}
  ): Promise<FuelExpense[] | PaginatedResult<FuelExpense>> {
    const { where, params } = buildFuelWhere(filters);

    if (filters.pagination) {
      const countResult = await query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM fuel_expenses ${where}`,
        params
      );
      const total = Number(countResult.rows[0]?.c ?? 0);
      const pagedParams = [...params, filters.pagination.limit, filters.pagination.offset];
      const result = await query(
        `SELECT * FROM fuel_expenses ${where}
         ORDER BY expense_date DESC, created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        pagedParams
      );
      return paginatedResult(result.rows.map(mapFuelExpense), total, filters.pagination);
    }

    const result = await query(
      `SELECT * FROM fuel_expenses ${where} ORDER BY expense_date DESC, created_at DESC`,
      params
    );
    return result.rows.map(mapFuelExpense);
  },

  async getById(id: string) {
    const result = await query(
      `SELECT * FROM fuel_expenses WHERE id = $1 AND COALESCE(deleted, FALSE) = FALSE`,
      [id]
    );
    if (!result.rowCount) throw new AppError(404, "Fuel expense not found");
    return mapFuelExpense(result.rows[0]);
  },

  async create(body: unknown) {
    const data = parseBody(fuelExpenseBodySchema, body);

    return withTransaction(async (client) => {
      try {
        await assertVehicleExists(data.vehicleId, client);
        await assertEmployeeExists(data.driverId, "Driver", client);
        await assertEmployeeExists(data.supervisorId, "Supervisor", client);
        await assertTripExists(data.tripId, client);

        const liters = data.liters ?? 0;
        const fuelRate = data.fuelRate ?? 0;
        const amount = data.amount ?? Number((liters * fuelRate).toFixed(2));
        const billNo =
          data.billNo || (await nextDocNo(client, "FUEL", "fuel_expenses", "bill_no"));
        const pumpName = data.pumpName ?? "";
        const approval = toApprovalStatus(data.status ?? "Draft");

        const result = await client.query(
          `INSERT INTO fuel_expenses (
             bill_no, expense_date, vehicle_id, vehicle_no, driver_id, driver_name,
             supervisor_id, supervisor_name, trip_id, meter_reading, amount, rate,
             litres, petrol_bunk, remarks, status, image_data, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::approval_status,$17,$18)
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
            data.remarks ?? null,
            approval,
            data.imageData ?? null,
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
    const approval = data.status != null ? toApprovalStatus(data.status) : null;

    return withTransaction(async (client) => {
      try {
        await assertVehicleExists(data.vehicleId, client);
        await assertEmployeeExists(data.driverId, "Driver", client);
        await assertTripExists(data.tripId, client);

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
             remarks = COALESCE($15, remarks),
             status = COALESCE($16::approval_status, status),
             image_data = COALESCE($17, image_data),
             created_by = COALESCE($18, created_by)
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
            data.amount ?? null,
            data.fuelRate ?? null,
            data.liters ?? null,
            data.pumpName ?? null,
            data.remarks ?? null,
            approval,
            data.imageData ?? null,
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

  async updateStatus(id: string, body: unknown) {
    const status = String((body as { status?: string })?.status ?? "");
    assertOpsStatus(status);
    const patch = body as { approvedBy?: string; reason?: string };

    if (status === "Deleted") {
      return this.softDelete(id, patch.reason);
    }

    const approval = toApprovalStatus(status);
    return withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE fuel_expenses SET
           status = $2::approval_status,
           approved_by = CASE WHEN $2 = 'Approved' THEN COALESCE($3, approved_by) ELSE approved_by END,
           approved_date = CASE WHEN $2 = 'Approved' THEN NOW() ELSE approved_date END
         WHERE id = $1 AND COALESCE(deleted, FALSE) = FALSE
         RETURNING *`,
        [id, approval, patch.approvedBy ?? "system"]
      );
      if (!result.rowCount) throw new AppError(404, "Fuel expense not found");
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
