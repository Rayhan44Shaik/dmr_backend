/**
 * Accounts → Farm Payments (Farmer Payments register).
 *
 * One PARENT row per completed, non-deleted trip. Rate/amount live on trips
 * (farm_rate / farm_amount); settlement fields were added in
 * 044_trip_farm_payment_fields.sql (farm_paid_*).
 *
 * Multi-load support: `loads` carries one entry per pickup-submitted leg
 * (trip_legs) with that leg's own farm/rate/amount; the parent aggregates
 * (totalBirds/dcWeight/amount = sums, rate = uniform-or-weighted-average)
 * stay the authoritative trip-level figures for Account Analysis.
 * Pagination counts parent TRIPS, not displayed load rows — the Farm Payment
 * table/export layer flattens a page of parents into load display rows.
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

export interface FarmPaymentLoadRow {
  /** trip_legs primary key. 0 when the parent trip has no usable trip_legs row (legacy). */
  legId: number;
  load: number;
  farmName: string | null;
  birdType: string | null;
  totalBirds: number;
  dcWeight: number;
  /** Effective load rate: the leg's own farm_rate, or the parent trip rate fallback. */
  rate: number;
  /** Load payable: the leg's own farm_amount, or rate × load DC weight fallback. */
  amount: number;
}

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
  /**
   * Parent aggregate rate (backward compatibility for trip-level consumers
   * such as Account Analysis summaries). The single effective rate when every
   * submitted load shares one rate; otherwise the payable-weighted average
   * (amount ÷ dcWeight, two-decimal money rounding). Authoritative money is
   * always `amount` (the exact sum of load amounts) — never
   * `dcWeight × rate` when rates differ.
   */
  rate: number;
  /** Parent aggregate payable: exact sum of submitted load amounts. */
  amount: number;
  paidAmount: number;
  balance: number;
  status: FarmPaymentStatus;
  paymentDate: string | null;
  paymentMode: string | null;
  referenceNo: string | null;
  vehicleNo: string | null;
  isRentedVehicle: boolean;
  supervisorName: string | null;
  /** One entry per pickup-submitted leg, sorted by load. Empty for legacy trips. */
  loads: FarmPaymentLoadRow[];
}

export interface FarmPaymentUpsertInput {
  tripId: number;
  /** Load-level update identity: trip_legs.id. Authoritative when present. */
  legId?: number;
  /** Optional display/validation aid (leg_index). Never trusted as identity when legId is present. */
  load?: number;
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
    CASE WHEN COALESCE(la.load_count, 0) > 0 THEN la.farm_names ELSE t.source_farm END AS source_farm,
    CASE WHEN COALESCE(la.load_count, 0) > 0 THEN la.bird_types ELSE t.farm_bird_type END AS farm_bird_type,
    CASE WHEN COALESCE(la.load_count, 0) > 0 THEN la.total_birds ELSE t.total_birds END AS total_birds,
    CASE WHEN COALESCE(la.load_count, 0) > 0 THEN la.dc_weight ELSE t.dc_weight END AS dc_weight,
    COALESCE(la.loads, '[]'::jsonb) AS loads,
    t.farm_rate,
    t.farm_amount,
    COALESCE(t.farm_paid_amount, 0) AS farm_paid_amount,
    t.farm_payment_date,
    COALESCE(t.farm_payment_mode, '') AS farm_payment_mode,
    COALESCE(t.farm_payment_reference, '') AS farm_payment_reference,
    t.vehicle_no,
    t.is_rented_vehicle,
    t.supervisor_name
  FROM trips t
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS load_count,
           COALESCE(SUM(l.total_birds), 0)::numeric AS total_birds,
           COALESCE(SUM(l.dc_weight), 0)::numeric AS dc_weight,
           STRING_AGG(DISTINCT NULLIF(BTRIM(l.source_farm), ''), ', ' ORDER BY NULLIF(BTRIM(l.source_farm), '')) AS farm_names,
           STRING_AGG(DISTINCT NULLIF(BTRIM(l.farm_bird_type), ''), ', ' ORDER BY NULLIF(BTRIM(l.farm_bird_type), '')) AS bird_types,
           JSONB_AGG(JSONB_BUILD_OBJECT(
             'legId', l.id,
             'load', l.leg_index,
             'farmName', l.source_farm,
             'birdType', l.farm_bird_type,
             'totalBirds', COALESCE(l.total_birds, 0),
             'dcWeight', COALESCE(l.dc_weight, 0),
             'rate', l.farm_rate,
             'amount', l.farm_amount
           ) ORDER BY l.leg_index) AS loads
      FROM trip_legs l
     WHERE l.trip_id = t.id
       AND l.pickup_step_submitted = TRUE
  ) la ON TRUE
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
  const parentRate = num(row.farm_rate);
  const storedAmount = num(row.farm_amount);
  const paidAmount = num(row.farm_paid_amount);
  const mode = str(row.farm_payment_mode);
  const reference = str(row.farm_payment_reference);
  let rawLoads: unknown[] = [];
  if (Array.isArray(row.loads)) {
    rawLoads = row.loads;
  } else if (typeof row.loads === "string") {
    try {
      const parsed: unknown = JSON.parse(row.loads);
      rawLoads = Array.isArray(parsed) ? parsed : [];
    } catch {
      rawLoads = [];
    }
  }

  // Each pickup-submitted leg becomes a load with its own rate/amount.
  // A leg without its own rate falls back to the parent trip rate for
  // display/calculation only — the read never writes back to the database.
  const loads: FarmPaymentLoadRow[] = rawLoads.map((value) => {
    const load = value as Record<string, unknown>;
    const loadDcWeight = num(load.dcWeight);
    const legRate = load.rate == null || load.rate === "" ? NaN : Number(load.rate);
    const rate = Number.isFinite(legRate) && legRate >= 0 ? legRate : parentRate;
    const legAmount = load.amount == null || load.amount === "" ? NaN : Number(load.amount);
    const amount =
      Number.isFinite(legAmount) && legAmount >= 0
        ? roundMoney(legAmount)
        : roundMoney(loadDcWeight * rate);
    return {
      legId: load.legId == null ? 0 : num(load.legId),
      load: num(load.load),
      farmName: load.farmName == null ? null : str(load.farmName),
      birdType: load.birdType == null ? null : str(load.birdType),
      totalBirds: num(load.totalBirds),
      dcWeight: loadDcWeight,
      rate,
      amount,
    };
  });

  // Parent stays the authoritative trip-level record. With submitted legs the
  // aggregates are derived from the loads so Account Analysis (which sums
  // `amount` per parent trip) can never double-count or use a stale figure.
  // Without usable legs the legacy trip-level columns are preserved as-is.
  let totalBirds = num(row.total_birds);
  let dcWeight = num(row.dc_weight);
  let rate = parentRate;
  let amount = parentRate > 0 ? roundMoney(dcWeight * parentRate) : storedAmount;
  if (loads.length > 0) {
    totalBirds = loads.reduce((sum, load) => sum + load.totalBirds, 0);
    dcWeight = roundMoney(loads.reduce((sum, load) => sum + load.dcWeight, 0));
    amount = roundMoney(loads.reduce((sum, load) => sum + load.amount, 0));
    const firstRate = loads[0].rate;
    rate =
      loads.every((load) => load.rate === firstRate)
        ? firstRate
        : dcWeight > 0
          ? roundMoney(amount / dcWeight)
          : parentRate;
  }
  const balance = Math.max(0, roundMoney(amount - paidAmount));

  return {
    id: tripId,
    tripId,
    tripNo: str(row.trip_no),
    tripDate: dateOnly(row.trip_date) ?? "",
    farmId: row.source_farm_id == null ? null : num(row.source_farm_id),
    farmName: row.source_farm == null ? null : str(row.source_farm),
    birdType: row.farm_bird_type == null ? null : str(row.farm_bird_type),
    totalBirds,
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
    isRentedVehicle: Boolean(row.is_rented_vehicle),
    supervisorName: row.supervisor_name == null ? null : str(row.supervisor_name),
    loads,
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

  if (row.legId !== undefined && row.legId !== null && row.legId !== "") {
    const legId = Number(row.legId);
    if (!Number.isInteger(legId) || legId <= 0) {
      throw new AppError(400, `payments[${index}].legId must be a positive integer`);
    }
    out.legId = legId;
  }

  if (row.load !== undefined && row.load !== null && row.load !== "") {
    const load = Number(row.load);
    if (!Number.isInteger(load) || load < 1 || load > 4) {
      throw new AppError(400, `payments[${index}].load must be an integer from 1 to 4`);
    }
    out.load = load;
  }

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
          `SELECT id,
                  CASE WHEN EXISTS (
                    SELECT 1 FROM trip_legs l WHERE l.trip_id = trips.id AND l.pickup_step_submitted = TRUE
                  ) THEN (
                    SELECT COALESCE(SUM(l.dc_weight), 0) FROM trip_legs l
                     WHERE l.trip_id = trips.id AND l.pickup_step_submitted = TRUE
                  ) ELSE dc_weight END AS dc_weight,
                  farm_rate, farm_amount,
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
        const parentRateBefore = num(current.farm_rate);

        // All pickup-submitted legs, locked for this transaction. Empty for
        // legacy trips without usable trip_legs rows.
        const legRows = (
          await client.query(
            `SELECT id, trip_id, leg_index,
                    COALESCE(dc_weight, 0) AS dc_weight,
                    farm_rate, farm_amount, pickup_step_submitted
               FROM trip_legs
              WHERE trip_id = $1 AND pickup_step_submitted = TRUE
              ORDER BY leg_index
              FOR UPDATE`,
            [input.tripId]
          )
        ).rows as Record<string, unknown>[];

        const effectiveLegFigures = (
          legs: Record<string, unknown>[],
          fallbackRate: number,
          overrideRate?: number
        ) =>
          legs.map((leg) => {
            const weight = num(leg.dc_weight);
            const ownRate =
              leg.farm_rate == null || leg.farm_rate === "" ? NaN : Number(leg.farm_rate);
            const rate =
              overrideRate !== undefined
                ? overrideRate
                : Number.isFinite(ownRate) && ownRate >= 0
                  ? ownRate
                  : fallbackRate;
            return { weight, rate, amount: roundMoney(weight * rate) };
          });

        const aggregateFromLegs = (figs: Array<{ weight: number; rate: number; amount: number }>) => {
          const weight = roundMoney(figs.reduce((sum, fig) => sum + fig.weight, 0));
          const total = roundMoney(figs.reduce((sum, fig) => sum + fig.amount, 0));
          const first = figs.length > 0 ? figs[0].rate : 0;
          const aggRate =
            figs.length === 0
              ? 0
              : figs.every((fig) => fig.rate === first)
                ? first
                : weight > 0
                  ? roundMoney(total / weight)
                  : first;
          return { weight, total, aggRate };
        };

        // ---- Load-level update: legId is the authoritative identity. ----
        if (input.legId !== undefined) {
          const leg = legRows.find((candidate) => num(candidate.id) === input.legId);
          if (!leg) {
            // The leg may exist under another trip (cross-trip) or not at all.
            const anywhere = await client.query(
              `SELECT trip_id, leg_index, pickup_step_submitted FROM trip_legs WHERE id = $1`,
              [input.legId]
            );
            if (!anywhere.rowCount) {
              throw new AppError(404, `payments[${input.tripId}].legId ${input.legId} not found`);
            }
            throw new AppError(
              400,
              `payments[${input.tripId}].legId ${input.legId} does not belong to trip ${input.tripId}`
            );
          }
          if (input.load !== undefined && num(leg.leg_index) !== input.load) {
            throw new AppError(
              400,
              `payments[${input.tripId}].load ${input.load} does not match leg ${input.legId}`
            );
          }
          if (!leg.pickup_step_submitted) {
            throw new AppError(
              422,
              `payments[${input.tripId}].legId ${input.legId} is not pickup-submitted`
            );
          }
          const legWeight = num(leg.dc_weight);
          const ownRate =
            leg.farm_rate == null || leg.farm_rate === "" ? NaN : Number(leg.farm_rate);
          const nextLegRate =
            input.rate !== undefined
              ? input.rate
              : Number.isFinite(ownRate) && ownRate >= 0
                ? ownRate
                : parentRateBefore;
          const nextLegAmount = roundMoney(legWeight * nextLegRate);
          await client.query(
            `UPDATE trip_legs SET farm_rate = $2, farm_amount = $3, updated_at = NOW() WHERE id = $1`,
            [input.legId, nextLegRate, nextLegAmount]
          );
          const figs = effectiveLegFigures(legRows, parentRateBefore).map((fig, index) =>
            num(legRows[index].id) === input.legId
              ? { weight: legWeight, rate: nextLegRate, amount: nextLegAmount }
              : fig
          );
          const agg = aggregateFromLegs(figs);
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
            [input.tripId, agg.aggRate, agg.total, nextPaid, nextDate, nextMode, nextRef]
          );
          ids.push(input.tripId);
          continue;
        }

        // ---- Trip-level update ----
        // With submitted legs the parent aggregates are recomputed from the
        // legs so the stored parent can never drift from the load breakdown.
        // A trip-level rate keeps the legacy one-rate semantics by applying
        // to every submitted leg.
        if (legRows.length > 0) {
          if (input.rate !== undefined) {
            for (const leg of legRows) {
              const weight = num(leg.dc_weight);
              await client.query(
                `UPDATE trip_legs SET farm_rate = $2, farm_amount = $3, updated_at = NOW() WHERE id = $1`,
                [num(leg.id), input.rate, roundMoney(weight * input.rate)]
              );
            }
          }
          const figs = effectiveLegFigures(
            legRows,
            parentRateBefore,
            input.rate !== undefined ? input.rate : undefined
          );
          const agg = aggregateFromLegs(figs);
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
            [input.tripId, agg.aggRate, agg.total, nextPaid, nextDate, nextMode, nextRef]
          );
          ids.push(input.tripId);
          continue;
        }

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
