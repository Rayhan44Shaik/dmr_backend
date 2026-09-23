/**
 * Accounts → Farm Payments (Farmer Payments register).
 *
 * One row per completed, non-deleted trip. Rate/amount live on trips
 * (farm_rate / farm_amount); settlement fields were added in
 * 044_trip_farm_payment_fields.sql (farm_paid_*).
 */
import type pg from "pg";
import { query, withTransaction } from "../config/db.js";
import {
  paginatedResult,
  type PaginatedResult,
  type PaginationParams,
} from "../utils/pagination.js";
import { AppError } from "../middleware/errorHandler.js";
import { dateOnly, num, str } from "../utils/coerce.js";

type Client = pg.PoolClient;

export type FarmPaymentStatus = "Paid" | "Partially Paid" | "Pending";

export interface TripFarmPaymentRow {
  id: number;
  tripId: number;
  tripNo: string;
  tripDate: string;
  farmId: number | null;
  farmName: string | null;
  birdType: string | null;
  totalBirds: number;
  dcWeight: number;
  rate: number;
  amount: number;
  paidAmount: number;
  balance: number;
  status: FarmPaymentStatus;
  paymentDate: string | null;
  paymentMode: string | null;
  referenceNo: string | null;
  vehicleNo: string | null;
  supervisorName: string | null;
}

export interface FarmPaymentUpsertInput {
  tripId: number;
  rate?: number;
  paidAmount?: number;
  paymentDate?: string | null;
  paymentMode?: string | null;
  referenceNo?: string | null;
}

const LIST_SELECT = `
  SELECT
    t.id,
    t.trip_no,
    t.trip_date,
    t.source_farm_id,
    t.source_farm,
    t.farm_bird_type,
    t.total_birds,
    t.dc_weight,
    t.farm_rate,
    t.farm_amount,
    COALESCE(t.farm_paid_amount, 0) AS farm_paid_amount,
    t.farm_payment_date,
    COALESCE(t.farm_payment_mode, '') AS farm_payment_mode,
    COALESCE(t.farm_payment_reference, '') AS farm_payment_reference,
    t.vehicle_no,
    t.supervisor_name
  FROM trips t
`;

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function deriveStatus(amount: number, paidAmount: number): FarmPaymentStatus {
  if (paidAmount <= 0) return "Pending";
  if (paidAmount < amount) return "Partially Paid";
  return "Paid";
}

function mapRow(row: Record<string, unknown>): TripFarmPaymentRow {
  const tripId = num(row.id);
  const rate = num(row.farm_rate);
  const dcWeight = num(row.dc_weight);
  const storedAmount = num(row.farm_amount);
  const amount = storedAmount > 0 ? storedAmount : roundMoney(dcWeight * rate);
  const paidAmount = num(row.farm_paid_amount);
  const balance = Math.max(0, roundMoney(amount - paidAmount));
  const mode = str(row.farm_payment_mode);
  const reference = str(row.farm_payment_reference);

  return {
    id: tripId,
    tripId,
    tripNo: str(row.trip_no),
    tripDate: dateOnly(row.trip_date) ?? "",
    farmId: row.source_farm_id == null ? null : num(row.source_farm_id),
    farmName: row.source_farm == null ? null : str(row.source_farm),
    birdType: row.farm_bird_type == null ? null : str(row.farm_bird_type),
    totalBirds: num(row.total_birds),
    dcWeight,
    rate,
    amount,
    paidAmount,
    balance,
    status: deriveStatus(amount, paidAmount),
    paymentDate: dateOnly(row.farm_payment_date),
    paymentMode: mode || null,
    referenceNo: reference || null,
    vehicleNo: row.vehicle_no == null ? null : str(row.vehicle_no),
    supervisorName: row.supervisor_name == null ? null : str(row.supervisor_name),
  };
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function parseUpsertRow(raw: unknown, index: number): FarmPaymentUpsertInput {
  if (!raw || typeof raw !== "object") {
    throw new AppError(400, `payments[${index}] must be an object`);
  }
  const row = raw as Record<string, unknown>;
  const tripId = Number(row.tripId);
  if (!Number.isInteger(tripId) || tripId <= 0) {
    throw new AppError(400, `payments[${index}].tripId must be a positive integer`);
  }

  const out: FarmPaymentUpsertInput = { tripId };

  if (row.rate !== undefined) {
    const rate = Number(row.rate);
    if (!Number.isFinite(rate) || rate < 0) {
      throw new AppError(400, `payments[${index}].rate must be a non-negative number`);
    }
    out.rate = rate;
  }

  if (row.paidAmount !== undefined) {
    const paidAmount = Number(row.paidAmount);
    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      throw new AppError(400, `payments[${index}].paidAmount must be a non-negative number`);
    }
    out.paidAmount = paidAmount;
  }

  if (row.paymentDate !== undefined) {
    if (row.paymentDate === null || row.paymentDate === "") {
      out.paymentDate = null;
    } else {
      const paymentDate = String(row.paymentDate).trim();
      if (!isValidDate(paymentDate)) {
        throw new AppError(400, `payments[${index}].paymentDate must be YYYY-MM-DD or null`);
      }
      out.paymentDate = paymentDate;
    }
  }

  if (row.paymentMode !== undefined) {
    out.paymentMode =
      row.paymentMode == null ? null : String(row.paymentMode).trim().slice(0, 50);
  }

  if (row.referenceNo !== undefined) {
    out.referenceNo =
      row.referenceNo == null ? null : String(row.referenceNo).trim().slice(0, 100);
  }

  return out;
}

/** Accept `{ payments: [...] }` or a bare array. */
export function parseFarmPaymentUpsertBody(body: unknown): FarmPaymentUpsertInput[] {
  const rawList = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray((body as { payments?: unknown }).payments)
      ? (body as { payments: unknown[] }).payments
      : null;

  if (!rawList) {
    throw new AppError(400, "Body must be an array or { payments: [...] }");
  }

  return rawList.map((row, index) => parseUpsertRow(row, index));
}

async function fetchMappedByIds(
  client: Client | null,
  tripIds: number[]
): Promise<TripFarmPaymentRow[]> {
  if (tripIds.length === 0) return [];
  const sql = `${LIST_SELECT}
    WHERE t.id = ANY($1::int[])
      AND COALESCE(t.deleted, FALSE) = FALSE
      AND t.status = 'Completed'
    ORDER BY t.trip_date DESC, t.id DESC`;
  const result = client
    ? await client.query(sql, [tripIds])
    : await query(sql, [tripIds]);
  return result.rows.map((row) => mapRow(row as Record<string, unknown>));
}

export const farmPaymentsService = {
  async list(filters: {
    pagination?: PaginationParams | null;
  } = {}): Promise<TripFarmPaymentRow[] | PaginatedResult<TripFarmPaymentRow>> {
    const where = `WHERE COALESCE(t.deleted, FALSE) = FALSE
        AND t.status = 'Completed'`;
    if (filters.pagination) {
      const countResult = await query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM trips t ${where}`
      );
      const total = Number(countResult.rows[0]?.c ?? 0);
      const result = await query(
        `${LIST_SELECT}
         ${where}
         ORDER BY t.trip_date DESC, t.id DESC
         LIMIT $1 OFFSET $2`,
        [filters.pagination.limit, filters.pagination.offset]
      );
      return paginatedResult(
        result.rows.map((row) => mapRow(row as Record<string, unknown>)),
        total,
        filters.pagination
      );
    }
    const result = await query(
      `${LIST_SELECT}
       ${where}

       ORDER BY t.trip_date DESC, t.id DESC`
    );
    return result.rows.map((row) => mapRow(row as Record<string, unknown>));
  },

  async upsertMany(rows: FarmPaymentUpsertInput[]): Promise<TripFarmPaymentRow[]> {
    if (rows.length === 0) return [];

    const updatedIds = await withTransaction(async (client) => {
      const ids: number[] = [];

      for (const input of rows) {
        const locked = await client.query(
          `SELECT id, dc_weight, farm_rate, farm_amount,
                  COALESCE(farm_paid_amount, 0) AS farm_paid_amount,
                  farm_payment_date,
                  COALESCE(farm_payment_mode, '') AS farm_payment_mode,
                  COALESCE(farm_payment_reference, '') AS farm_payment_reference
           FROM trips
           WHERE id = $1
             AND COALESCE(deleted, FALSE) = FALSE
             AND status = 'Completed'
           FOR UPDATE`,
          [input.tripId]
        );
        if (!locked.rowCount) continue;

        const current = locked.rows[0] as Record<string, unknown>;
        const dcWeight = num(current.dc_weight);
        const nextRate = input.rate !== undefined ? input.rate : num(current.farm_rate);
        const nextAmount =
          input.rate !== undefined
            ? roundMoney(dcWeight * nextRate)
            : num(current.farm_amount) > 0
              ? num(current.farm_amount)
              : roundMoney(dcWeight * nextRate);
        const nextPaid =
          input.paidAmount !== undefined ? input.paidAmount : num(current.farm_paid_amount);
        const nextDate =
          input.paymentDate !== undefined
            ? input.paymentDate
            : dateOnly(current.farm_payment_date);
        const nextMode =
          input.paymentMode !== undefined
            ? input.paymentMode ?? ""
            : str(current.farm_payment_mode);
        const nextRef =
          input.referenceNo !== undefined
            ? input.referenceNo ?? ""
            : str(current.farm_payment_reference);

        await client.query(
          `UPDATE trips SET
             farm_rate = $2,
             farm_amount = $3,
             farm_paid_amount = $4,
             farm_payment_date = $5::date,
             farm_payment_mode = $6,
             farm_payment_reference = $7,
             updated_at = NOW()
           WHERE id = $1`,
          [
            input.tripId,
            nextRate,
            nextAmount,
            nextPaid,
            nextDate,
            nextMode,
            nextRef,
          ]
        );
        ids.push(input.tripId);
      }

      return ids;
    });

    return fetchMappedByIds(null, updatedIds);
  },
};
