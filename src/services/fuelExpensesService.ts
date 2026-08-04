import { query } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import type { FuelExpense } from "../types/operations.js";
import { dateOnly, num, str } from "../utils/coerce.js";
import { nextDocNo } from "../utils/operationsHelpers.js";
import {
  approvalFields,
  assertOpsStatus,
  fuelExpenseBodySchema,
  parseBody,
} from "../validation/operations.js";

function mapFuelExpense(row: Record<string, unknown>): FuelExpense {
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
    pumpName: str(row.pump_name || row.petrol_bunk),
    remarks: row.remarks == null ? null : str(row.remarks),
    status: str(row.ops_status || row.status) as FuelExpense["status"],
    imageData: row.image_data == null ? null : str(row.image_data),
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

export const fuelExpensesService = {
  async list(filters: {
    vehicleId?: number;
    fromDate?: string;
    toDate?: string;
    status?: string;
    includeDeleted?: boolean;
  } = {}) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (!filters.includeDeleted) clauses.push(`deleted = FALSE`);
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
    if (filters.status) {
      params.push(filters.status);
      clauses.push(`ops_status = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await query(
      `SELECT * FROM fuel_expenses ${where} ORDER BY expense_date DESC, created_at DESC`,
      params
    );
    return result.rows.map(mapFuelExpense);
  },

  async getById(id: string) {
    const result = await query(`SELECT * FROM fuel_expenses WHERE id = $1`, [id]);
    if (!result.rowCount) throw new AppError(404, "Fuel expense not found");
    return mapFuelExpense(result.rows[0]);
  },

  async create(body: unknown) {
    const data = parseBody(fuelExpenseBodySchema, body);
    const liters = data.liters ?? 0;
    const fuelRate = data.fuelRate ?? 0;
    const amount = data.amount ?? Number((liters * fuelRate).toFixed(2));
    const billNo =
      data.billNo || (await nextDocNo(null, "FUEL", "fuel_expenses", "bill_no"));
    const pumpName = data.pumpName ?? "";

    const result = await query(
      `INSERT INTO fuel_expenses (
         bill_no, expense_date, vehicle_id, vehicle_no, driver_id, driver_name,
         supervisor_id, supervisor_name, trip_id, meter_reading, amount, rate,
         litres, petrol_bunk, pump_name, remarks, status, ops_status, image_data, created_by
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
         CASE WHEN $17 = 'Approved' THEN 'Approved'::approval_status ELSE 'Pending'::approval_status END,
         $17::ops_record_status, $18, $19
       ) RETURNING *`,
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
        pumpName,
        data.remarks ?? null,
        data.status ?? "Draft",
        data.imageData ?? null,
        data.createdBy ?? "",
      ]
    );
    return mapFuelExpense(result.rows[0]);
  },

  async update(id: string, body: unknown) {
    const data = parseBody(fuelExpenseBodySchema.partial(), body);
    const pumpName = data.pumpName;
    const result = await query(
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
         remarks = COALESCE($15, remarks),
         ops_status = COALESCE($16::ops_record_status, ops_status),
         image_data = COALESCE($17, image_data),
         created_by = COALESCE($18, created_by)
       WHERE id = $1 AND deleted = FALSE
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
        pumpName ?? null,
        data.remarks ?? null,
        data.status ?? null,
        data.imageData ?? null,
        data.createdBy ?? null,
      ]
    );
    if (!result.rowCount) throw new AppError(404, "Fuel expense not found");
    return mapFuelExpense(result.rows[0]);
  },

  async updateStatus(id: string, body: unknown) {
    const status = String((body as { status?: string })?.status ?? "");
    assertOpsStatus(status);
    const patch = body as {
      approvedBy?: string;
      rejectedBy?: string;
      rejectedReason?: string;
      reason?: string;
    };
    const fields = approvalFields(status, patch);
    const legacyStatus =
      status === "Approved" ? "Approved" : status === "Deleted" ? "Pending" : "Pending";

    const result = await query(
      `UPDATE fuel_expenses SET
         ops_status = $2::ops_record_status,
         status = $3::approval_status,
         approved_by = COALESCE($4, approved_by),
         approved_date = COALESCE($5::timestamptz, approved_date),
         rejected_by = COALESCE($6, rejected_by),
         rejected_at = COALESCE($7::timestamptz, rejected_at),
         rejected_reason = COALESCE($8, rejected_reason),
         deleted = COALESCE($9, deleted),
         deleted_reason = COALESCE($10, deleted_reason)
       WHERE id = $1
       RETURNING *`,
      [
        id,
        status,
        legacyStatus,
        "approved_by" in fields ? fields.approved_by : null,
        "approved_at" in fields ? fields.approved_at : null,
        "rejected_by" in fields ? fields.rejected_by : null,
        "rejected_at" in fields ? fields.rejected_at : null,
        "rejected_reason" in fields ? fields.rejected_reason : null,
        "deleted" in fields ? fields.deleted : null,
        "deleted_reason" in fields ? fields.deleted_reason : null,
      ]
    );
    if (!result.rowCount) throw new AppError(404, "Fuel expense not found");
    return mapFuelExpense(result.rows[0]);
  },

  async softDelete(id: string, reason?: string) {
    return this.updateStatus(id, { status: "Deleted", reason });
  },
};
