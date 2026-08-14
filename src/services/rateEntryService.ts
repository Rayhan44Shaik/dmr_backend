import type pg from "pg";
import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import type { RateEntry, RateEntryTrip } from "../types/operations.js";
import { dateOnly, num, str } from "../utils/coerce.js";
import { assertBirdTypeExists, assertTripExists } from "../utils/fkValidation.js";
import {
  paginatedResult,
  type PaginatedResult,
  type PaginationParams,
} from "../utils/pagination.js";
import { rethrowIfAppError } from "../utils/pgErrors.js";
import {
  parseBody,
  rateEntryBodySchema,
  rateEntryUpdateSchema,
} from "../validation/operations.js";

type Client = pg.PoolClient;

/**
 * Rejects trips that cannot receive a rate: unknown/deleted trips (via
 * assertTripExists, which already excludes deleted rows) and any trip that
 * hasn't reached the existing finalized "Completed" status yet. Step 5
 * submission only moves a trip to Pending — Pending is not yet finalized,
 * so it is not eligible until the trip is separately approved/completed
 * through the existing status-transition API. No new trip status is
 * introduced; this only reads the existing `status` column.
 */
async function assertTripEligibleForRate(tripId: number, client: Client | null = null) {
  await assertTripExists(tripId, client);
  const sql = `SELECT status FROM trips WHERE id = $1`;
  const result = client ? await client.query(sql, [tripId]) : await query(sql, [tripId]);
  const status = str(result.rows[0]?.status);
  if (status !== "Completed") {
    throw new AppError(
      409,
      `Trip ${tripId} is not eligible for Rate Entry yet (status: ${status}). ` +
        `Rate can only be entered once the trip is approved/completed.`
    );
  }
}

function mapRateEntry(row: Record<string, unknown>): RateEntry {
  return {
    id: num(row.id),
    tripId: num(row.trip_id),
    tripNo: row.trip_no == null ? undefined : str(row.trip_no),
    birdTypeId: row.bird_type_id == null ? null : num(row.bird_type_id),
    birdType: str(row.bird_type),
    rate: num(row.rate),
    remarks: str(row.remarks),
    createdBy: row.created_by == null ? undefined : str(row.created_by),
    updatedBy: row.updated_by == null ? null : str(row.updated_by),
    createdAt: row.created_at == null ? null : str(row.created_at),
    updatedAt: row.updated_at == null ? null : str(row.updated_at),
  };
}

function mapRateEntryTrip(row: Record<string, unknown>): RateEntryTrip {
  const hasRate = row.rate_entry_id != null;
  return {
    tripId: num(row.id),
    tripNo: str(row.trip_no),
    tripDate: dateOnly(row.trip_date) ?? "",
    tripStatus: str(row.status),
    vehicleId: row.vehicle_id == null ? null : num(row.vehicle_id),
    vehicleNo: row.vehicle_no == null ? null : str(row.vehicle_no),
    driverId: row.driver_id == null ? null : num(row.driver_id),
    driverName: row.driver_name == null ? null : str(row.driver_name),
    supervisorId: row.supervisor_id == null ? null : num(row.supervisor_id),
    supervisorName: row.supervisor_name == null ? null : str(row.supervisor_name),
    sourceFarmId: row.source_farm_id == null ? null : num(row.source_farm_id),
    sourceFarm: row.source_farm == null ? null : str(row.source_farm),
    totalBirds: num(row.total_birds),
    totalWeight: num(row.total_weight),
    totalShops: num(row.total_shops),
    birdTypeId: hasRate
      ? row.re_bird_type_id == null ? null : num(row.re_bird_type_id)
      : row.farm_bird_type_id == null ? null : num(row.farm_bird_type_id),
    birdType: hasRate ? str(row.re_bird_type) : row.farm_bird_type == null ? null : str(row.farm_bird_type),
    rateStatus: hasRate ? "Entered" : "Pending",
    rateEntryId: hasRate ? num(row.rate_entry_id) : null,
    rate: hasRate ? num(row.rate) : null,
    remarks: hasRate ? str(row.re_remarks) : null,
    createdBy: hasRate ? (row.re_created_by == null ? null : str(row.re_created_by)) : null,
    createdAt: hasRate ? (row.re_created_at == null ? null : str(row.re_created_at)) : null,
    updatedAt: hasRate ? (row.re_updated_at == null ? null : str(row.re_updated_at)) : null,
  };
}

const ELIGIBLE_TRIPS_SELECT = `
  SELECT
    t.id, t.trip_no, t.trip_date, t.status,
    t.vehicle_id, t.vehicle_no, t.driver_id, t.driver_name,
    t.supervisor_id, t.supervisor_name,
    t.source_farm_id, t.source_farm,
    t.total_birds, t.total_weight, t.total_shops,
    t.farm_bird_type_id, t.farm_bird_type,
    r.id AS rate_entry_id, r.bird_type_id AS re_bird_type_id, r.bird_type AS re_bird_type,
    r.rate, r.remarks AS re_remarks,
    r.created_by AS re_created_by, r.created_at AS re_created_at, r.updated_at AS re_updated_at
  FROM trips t
  LEFT JOIN rate_entry r ON r.trip_id = t.id
  WHERE t.deleted = FALSE AND t.status = 'Completed' AND r.id IS NULL
`;

export const rateEntryService = {
  /** Trips still waiting for their FIRST rate entry — finalized
   * (status = Completed), not deleted, AND with no rate_entry row yet.
   * Rate Entry is not an editable history page: once a trip has a
   * rate_entry row it is permanently excluded from this list (the row
   * itself is never deleted — Shop Sales/accounting still read it via
   * trip_id — only this listing stops surfacing it). */
  async list(
    filters: {
      search?: string;
      rateStatus?: "Pending" | "Entered";
      fromDate?: string;
      toDate?: string;
      vehicleNo?: string;
      supervisorName?: string;
      pagination?: PaginationParams | null;
    } = {}
  ): Promise<RateEntryTrip[] | PaginatedResult<RateEntryTrip>> {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filters.search) {
      params.push(`%${filters.search}%`);
      const p = params.length;
      clauses.push(
        `(t.trip_no ILIKE $${p} OR t.vehicle_no ILIKE $${p} OR t.driver_name ILIKE $${p} OR t.supervisor_name ILIKE $${p} OR t.source_farm ILIKE $${p})`
      );
    }
    // Business date filter — trip_date, not any created_at/rate_entry timestamp.
    if (filters.fromDate) {
      params.push(filters.fromDate);
      clauses.push(`t.trip_date >= $${params.length}`);
    }
    if (filters.toDate) {
      params.push(filters.toDate);
      clauses.push(`t.trip_date <= $${params.length}`);
    }
    if (filters.vehicleNo) {
      params.push(filters.vehicleNo);
      clauses.push(`t.vehicle_no = $${params.length}`);
    }
    if (filters.supervisorName) {
      params.push(filters.supervisorName);
      clauses.push(`t.supervisor_name = $${params.length}`);
    }
    if (filters.rateStatus === "Entered") {
      clauses.push(`r.id IS NOT NULL`);
    } else if (filters.rateStatus === "Pending") {
      clauses.push(`r.id IS NULL`);
    }

    const extraWhere = clauses.length ? `AND ${clauses.join(" AND ")}` : "";

    if (filters.pagination) {
      const countResult = await query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM trips t LEFT JOIN rate_entry r ON r.trip_id = t.id
         WHERE t.deleted = FALSE AND t.status = 'Completed' ${extraWhere}`,
        params
      );
      const total = Number(countResult.rows[0]?.c ?? 0);
      const pagedParams = [...params, filters.pagination.limit, filters.pagination.offset];
      const result = await query(
        `${ELIGIBLE_TRIPS_SELECT} ${extraWhere}
         ORDER BY t.trip_date DESC, t.id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        pagedParams
      );
      return paginatedResult(result.rows.map(mapRateEntryTrip), total, filters.pagination);
    }

    const result = await query(
      `${ELIGIBLE_TRIPS_SELECT} ${extraWhere} ORDER BY t.trip_date DESC, t.id DESC`,
      params
    );
    return result.rows.map(mapRateEntryTrip);
  },

  async getByTripId(tripId: number, client: Client | null = null) {
    const sql = `SELECT r.*, t.trip_no FROM rate_entry r JOIN trips t ON t.id = r.trip_id WHERE r.trip_id = $1`;
    const result = client ? await client.query(sql, [tripId]) : await query(sql, [tripId]);
    if (!result.rowCount) return null;
    return mapRateEntry(result.rows[0]);
  },

  async getById(id: number) {
    const result = await query(
      `SELECT r.*, t.trip_no FROM rate_entry r JOIN trips t ON t.id = r.trip_id WHERE r.id = $1`,
      [id]
    );
    if (!result.rowCount) throw new AppError(404, "Rate entry not found");
    return mapRateEntry(result.rows[0]);
  },

  /** Create-only. A second create for the same trip is rejected with a 409
   * (via the trip_id UNIQUE constraint) rather than silently duplicating —
   * use update() to edit an already-entered rate. */
  async create(body: unknown) {
    const data = parseBody(rateEntryBodySchema, body);

    return withTransaction(async (client) => {
      try {
        await assertTripEligibleForRate(data.tripId, client);
        if (data.birdTypeId != null) await assertBirdTypeExists(data.birdTypeId, client);

        // Default bird type from the trip's own farm bird type when the
        // caller doesn't specify one — avoids asking the user to re-enter
        // information the trip already carries.
        let birdTypeId = data.birdTypeId ?? null;
        let birdType = data.birdType ?? null;
        if (birdTypeId == null && birdType == null) {
          const tripRow = await client.query(
            `SELECT farm_bird_type_id, farm_bird_type FROM trips WHERE id = $1`,
            [data.tripId]
          );
          birdTypeId = tripRow.rows[0]?.farm_bird_type_id ?? null;
          birdType = tripRow.rows[0]?.farm_bird_type ?? null;
        }

        const result = await client.query(
          `INSERT INTO rate_entry (trip_id, bird_type_id, bird_type, rate, remarks, created_by)
           VALUES ($1,$2,$3,$4,$5,$6)
           RETURNING id`,
          [data.tripId, birdTypeId, birdType ?? "", data.rate, data.remarks ?? "", data.createdBy ?? ""]
        );
        const id = num(result.rows[0].id);
        const row = await client.query(
          `SELECT r.*, t.trip_no FROM rate_entry r JOIN trips t ON t.id = r.trip_id WHERE r.id = $1`,
          [id]
        );
        return mapRateEntry(row.rows[0]);
      } catch (err) {
        rethrowIfAppError(err);
        throw err;
      }
    });
  },

  /** Edits the same rate record — never creates a second row for the trip. */
  async update(id: number, body: unknown) {
    const data = parseBody(rateEntryUpdateSchema, body);

    return withTransaction(async (client) => {
      try {
        if (data.birdTypeId != null) await assertBirdTypeExists(data.birdTypeId, client);

        const result = await client.query(
          `UPDATE rate_entry SET
             rate = COALESCE($2, rate),
             bird_type_id = COALESCE($3, bird_type_id),
             bird_type = COALESCE($4, bird_type),
             remarks = COALESCE($5, remarks),
             updated_by = COALESCE($6, updated_by),
             updated_at = NOW()
           WHERE id = $1
           RETURNING id`,
          [
            id,
            data.rate ?? null,
            data.birdTypeId ?? null,
            data.birdType ?? null,
            data.remarks ?? null,
            data.updatedBy ?? null,
          ]
        );
        if (!result.rowCount) throw new AppError(404, "Rate entry not found");
        const row = await client.query(
          `SELECT r.*, t.trip_no FROM rate_entry r JOIN trips t ON t.id = r.trip_id WHERE r.id = $1`,
          [id]
        );
        return mapRateEntry(row.rows[0]);
      } catch (err) {
        rethrowIfAppError(err);
        throw err;
      }
    });
  },
};
