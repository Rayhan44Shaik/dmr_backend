import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { dateOnly, num, str } from "../utils/coerce.js";
import { assertBirdTypeExists, assertTripExists } from "../utils/fkValidation.js";
import { paginatedResult, } from "../utils/pagination.js";
import { rethrowIfAppError } from "../utils/pgErrors.js";
import { parseBody, rateEntryBodySchema, rateEntryLockSchema, rateEntryUpdateSchema, } from "../validation/operations.js";
/** Trip statuses eligible to receive/carry a Rate Entry. Both are treated
 * as "finalized" — Draft/Pending trips are still in progress and must never
 * surface here. */
const RATE_ENTRY_ELIGIBLE_STATUSES = ["Approved", "Completed"];
/**
 * Rejects trips that cannot receive a rate: unknown/deleted trips (via
 * assertTripExists, which already excludes deleted rows) and any trip that
 * hasn't reached a finalized status yet ('Approved' or 'Completed'). Step 5
 * submission only moves a trip to Pending — Pending is not yet finalized,
 * so it is not eligible until the trip is separately approved/completed
 * through the existing status-transition API.
 */
async function assertTripEligibleForRate(tripId, client = null) {
    await assertTripExists(tripId, client);
    const sql = `SELECT status FROM trips WHERE id = $1`;
    const result = client ? await client.query(sql, [tripId]) : await query(sql, [tripId]);
    const status = str(result.rows[0]?.status);
    if (!RATE_ENTRY_ELIGIBLE_STATUSES.includes(status)) {
        throw new AppError(409, `Trip ${tripId} is not eligible for Rate Entry yet (status: ${status}). ` +
            `Rate can only be entered once the trip is approved/completed.`);
    }
}
/** Loads + row-locks the trip for the duration of the transaction, so two
 * concurrent Save/Lock requests for the same trip serialize instead of
 * racing. */
async function lockTripRow(client, tripId) {
    const result = await client.query(`SELECT id, trip_no, status, deleted FROM trips WHERE id = $1 FOR UPDATE`, [tripId]);
    if (!result.rowCount)
        throw new AppError(404, `Trip ${tripId} not found`);
    const row = result.rows[0];
    return {
        id: num(row.id),
        tripNo: str(row.trip_no),
        status: str(row.status),
        deleted: Boolean(row.deleted),
    };
}
function assertTripUsableForRate(trip) {
    if (trip.deleted)
        throw new AppError(409, `Trip ${trip.tripNo} has been deleted`);
    if (!RATE_ENTRY_ELIGIBLE_STATUSES.includes(trip.status)) {
        throw new AppError(409, `Trip ${trip.tripNo} is not eligible for Rate Entry yet (status: ${trip.status}). ` +
            `Rate can only be entered once the trip is approved/completed.`);
    }
}
/** Locks/reads the existing rate_entry row for a trip within the current
 * transaction (FOR UPDATE), so concurrent Save/Lock calls serialize on it. */
async function lockRateEntryRow(client, tripId) {
    const result = await client.query(`SELECT id, locked FROM rate_entry WHERE trip_id = $1 FOR UPDATE`, [tripId]);
    if (!result.rowCount)
        return null;
    return { id: num(result.rows[0].id), locked: Boolean(result.rows[0].locked) };
}
function assertNotLocked(existing, tripNo) {
    if (existing?.locked) {
        throw new AppError(409, `Trip ${tripNo}'s rates are locked and cannot be modified. ` +
            `Locked rates are immutable — use a controlled unlock/reopen workflow if a correction is required.`);
    }
}
/** Validates every delivery line belongs to this trip and is active, then
 * writes its rate (and server-computed amount) to trip_deliveries. */
async function applyDeliveryRates(client, tripId, lines) {
    if (!lines || !lines.length)
        return;
    const ids = lines.map((l) => l.id);
    const existing = await client.query(`SELECT id, weight, deleted FROM trip_deliveries WHERE id = ANY($1::int[]) AND trip_id = $2`, [ids, tripId]);
    const byId = new Map(existing.rows.map((r) => [num(r.id), r]));
    for (const line of lines) {
        const row = byId.get(line.id);
        if (!row) {
            throw new AppError(422, `Delivery ${line.id} does not belong to trip ${tripId}`, {
                deliveryId: line.id,
            });
        }
        if (row.deleted) {
            throw new AppError(409, `Delivery ${line.id} has been deleted and cannot receive a rate`, {
                deliveryId: line.id,
            });
        }
        if (!(line.rate > 0)) {
            throw new AppError(400, `Rate for delivery ${line.id} must be greater than 0`, {
                deliveryId: line.id,
            });
        }
        const weight = num(row.weight);
        const amount = Number((weight * line.rate).toFixed(2));
        await client.query(`UPDATE trip_deliveries SET rate = $2, amount = $3 WHERE id = $1`, [line.id, line.rate, amount]);
    }
}
/** Every active (non-deleted) delivery on the trip must carry a positive
 * rate before the trip's rates can be locked. */
async function assertRatesComplete(client, tripId, tripNo) {
    const result = await client.query(`SELECT COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE rate IS NULL OR rate <= 0)::text AS missing
       FROM trip_deliveries
      WHERE trip_id = $1 AND deleted = FALSE`, [tripId]);
    const total = Number(result.rows[0]?.total ?? 0);
    const missing = Number(result.rows[0]?.missing ?? 0);
    if (total === 0) {
        throw new AppError(409, `Trip ${tripNo} has no shop deliveries to rate`);
    }
    if (missing > 0) {
        throw new AppError(409, `Trip ${tripNo} has ${missing} of ${total} shop${total === 1 ? "" : "s"} still missing a rate. ` +
            `All shops must have a rate before locking.`);
    }
}
function mapRateEntry(row) {
    return {
        id: num(row.id),
        tripId: num(row.trip_id),
        tripNo: row.trip_no == null ? undefined : str(row.trip_no),
        birdTypeId: row.bird_type_id == null ? null : num(row.bird_type_id),
        birdType: str(row.bird_type),
        rate: num(row.rate),
        remarks: str(row.remarks),
        locked: Boolean(row.locked),
        lockedBy: row.locked_by == null ? null : str(row.locked_by),
        lockedAt: row.locked_at == null ? null : str(row.locked_at),
        createdBy: row.created_by == null ? undefined : str(row.created_by),
        updatedBy: row.updated_by == null ? null : str(row.updated_by),
        createdAt: row.created_at == null ? null : str(row.created_at),
        updatedAt: row.updated_at == null ? null : str(row.updated_at),
    };
}
function mapRateEntryTrip(row) {
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
        // A locked trip never reaches this row (excluded by the list query) —
        // false here reflects that invariant rather than re-deriving it.
        locked: false,
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
  WHERE t.deleted = FALSE
    AND t.status IN ('Approved', 'Completed')
    AND (r.id IS NULL OR r.locked = FALSE)
`;
export const rateEntryService = {
    /** Trips eligible for Rate Entry: finalized (Approved/Completed), not
     * deleted, and not yet rate-locked. A trip with a saved-but-unlocked rate
     * still appears here (rateStatus = "Entered") — Rate Entry is only ever
     * permanently excluded once its rate is explicitly LOCKED via lock(). */
    async list(filters = {}) {
        const clauses = [];
        const params = [];
        if (filters.search) {
            params.push(`%${filters.search}%`);
            const p = params.length;
            clauses.push(`(t.trip_no ILIKE $${p} OR t.vehicle_no ILIKE $${p} OR t.driver_name ILIKE $${p} OR t.supervisor_name ILIKE $${p} OR t.source_farm ILIKE $${p})`);
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
        }
        else if (filters.rateStatus === "Pending") {
            clauses.push(`r.id IS NULL`);
        }
        const extraWhere = clauses.length ? `AND ${clauses.join(" AND ")}` : "";
        if (filters.pagination) {
            const countResult = await query(`SELECT COUNT(*)::text AS c
         FROM trips t LEFT JOIN rate_entry r ON r.trip_id = t.id
         WHERE t.deleted = FALSE AND t.status IN ('Approved', 'Completed')
           AND (r.id IS NULL OR r.locked = FALSE) ${extraWhere}`, params);
            const total = Number(countResult.rows[0]?.c ?? 0);
            const pagedParams = [...params, filters.pagination.limit, filters.pagination.offset];
            const result = await query(`${ELIGIBLE_TRIPS_SELECT} ${extraWhere}
         ORDER BY t.trip_date DESC, t.id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, pagedParams);
            return paginatedResult(result.rows.map(mapRateEntryTrip), total, filters.pagination);
        }
        const result = await query(`${ELIGIBLE_TRIPS_SELECT} ${extraWhere} ORDER BY t.trip_date DESC, t.id DESC`, params);
        return result.rows.map(mapRateEntryTrip);
    },
    async getByTripId(tripId, client = null) {
        const sql = `SELECT r.*, t.trip_no FROM rate_entry r JOIN trips t ON t.id = r.trip_id WHERE r.trip_id = $1`;
        const result = client ? await client.query(sql, [tripId]) : await query(sql, [tripId]);
        if (!result.rowCount)
            return null;
        return mapRateEntry(result.rows[0]);
    },
    async getById(id) {
        const result = await query(`SELECT r.*, t.trip_no FROM rate_entry r JOIN trips t ON t.id = r.trip_id WHERE r.id = $1`, [id]);
        if (!result.rowCount)
            throw new AppError(404, "Rate entry not found");
        return mapRateEntry(result.rows[0]);
    },
    /**
     * Save (upsert) a trip's rate entry — the header record plus, optionally,
     * shop-wise rates on the trip's deliveries. Safe to call repeatedly while
     * unlocked (each call overwrites the same row). Rejected once the trip's
     * rate has been locked. Fully transactional: on any validation failure
     * the transaction rolls back and nothing is partially saved.
     */
    async create(body) {
        const data = parseBody(rateEntryBodySchema, body);
        return withTransaction(async (client) => {
            try {
                const trip = await lockTripRow(client, data.tripId);
                assertTripUsableForRate(trip);
                const existing = await lockRateEntryRow(client, data.tripId);
                assertNotLocked(existing, trip.tripNo);
                if (data.birdTypeId != null)
                    await assertBirdTypeExists(data.birdTypeId, client);
                await applyDeliveryRates(client, data.tripId, data.deliveries);
                // Default bird type from the trip's own farm bird type when the
                // caller doesn't specify one — avoids asking the user to re-enter
                // information the trip already carries.
                let birdTypeId = data.birdTypeId ?? null;
                let birdType = data.birdType ?? null;
                if (birdTypeId == null && birdType == null) {
                    const tripRow = await client.query(`SELECT farm_bird_type_id, farm_bird_type FROM trips WHERE id = $1`, [data.tripId]);
                    birdTypeId = tripRow.rows[0]?.farm_bird_type_id ?? null;
                    birdType = tripRow.rows[0]?.farm_bird_type ?? null;
                }
                let id;
                if (existing) {
                    id = existing.id;
                    await client.query(`UPDATE rate_entry SET
               rate = $2,
               bird_type_id = COALESCE($3, bird_type_id),
               bird_type = COALESCE($4, bird_type),
               remarks = COALESCE($5, remarks),
               updated_by = COALESCE($6, updated_by),
               updated_at = NOW()
             WHERE id = $1`, [id, data.rate, birdTypeId, birdType, data.remarks ?? null, data.updatedBy ?? data.createdBy ?? null]);
                }
                else {
                    const result = await client.query(`INSERT INTO rate_entry (trip_id, bird_type_id, bird_type, rate, remarks, created_by, locked)
             VALUES ($1,$2,$3,$4,$5,$6,FALSE)
             RETURNING id`, [data.tripId, birdTypeId, birdType ?? "", data.rate, data.remarks ?? "", data.createdBy ?? ""]);
                    id = num(result.rows[0].id);
                }
                const row = await client.query(`SELECT r.*, t.trip_no FROM rate_entry r JOIN trips t ON t.id = r.trip_id WHERE r.id = $1`, [id]);
                return mapRateEntry(row.rows[0]);
            }
            catch (err) {
                rethrowIfAppError(err);
                throw err;
            }
        });
    },
    /** Edits the same rate record — never creates a second row for the trip.
     * Rejected once the rate has been locked (409). */
    async update(id, body) {
        const data = parseBody(rateEntryUpdateSchema, body);
        return withTransaction(async (client) => {
            try {
                const current = await client.query(`SELECT trip_id, locked FROM rate_entry WHERE id = $1 FOR UPDATE`, [id]);
                if (!current.rowCount)
                    throw new AppError(404, "Rate entry not found");
                const tripId = num(current.rows[0].trip_id);
                if (current.rows[0].locked) {
                    throw new AppError(409, `This rate entry is locked and cannot be modified. ` +
                        `Locked rates are immutable — use a controlled unlock/reopen workflow if a correction is required.`);
                }
                const trip = await lockTripRow(client, tripId);
                assertTripUsableForRate(trip);
                if (data.birdTypeId != null)
                    await assertBirdTypeExists(data.birdTypeId, client);
                await applyDeliveryRates(client, tripId, data.deliveries);
                const result = await client.query(`UPDATE rate_entry SET
             rate = COALESCE($2, rate),
             bird_type_id = COALESCE($3, bird_type_id),
             bird_type = COALESCE($4, bird_type),
             remarks = COALESCE($5, remarks),
             updated_by = COALESCE($6, updated_by),
             updated_at = NOW()
           WHERE id = $1
           RETURNING id`, [
                    id,
                    data.rate ?? null,
                    data.birdTypeId ?? null,
                    data.birdType ?? null,
                    data.remarks ?? null,
                    data.updatedBy ?? null,
                ]);
                if (!result.rowCount)
                    throw new AppError(404, "Rate entry not found");
                const row = await client.query(`SELECT r.*, t.trip_no FROM rate_entry r JOIN trips t ON t.id = r.trip_id WHERE r.id = $1`, [id]);
                return mapRateEntry(row.rows[0]);
            }
            catch (err) {
                rethrowIfAppError(err);
                throw err;
            }
        });
    },
    /**
     * Explicit lock — the only backend-controlled way a trip's rate becomes
     * immutable and eligible for Shop Sales. After a successful commit the
     * trip no longer satisfies the Rate Entry eligibility query.
     *
     * Concurrency: both the trip row and (if present) the rate_entry row are
     * SELECT ... FOR UPDATE inside this transaction, so two simultaneous lock
     * (or lock + save) requests for the same trip serialize — the second to
     * reach the row sees the first's committed state (already locked, or the
     * up-to-date rate) rather than racing.
     */
    async lock(tripId, body) {
        const data = parseBody(rateEntryLockSchema, body);
        return withTransaction(async (client) => {
            try {
                const trip = await lockTripRow(client, tripId);
                assertTripUsableForRate(trip);
                const existing = await lockRateEntryRow(client, tripId);
                if (!existing) {
                    throw new AppError(409, `Trip ${trip.tripNo} has no saved rates yet — save rates before locking.`);
                }
                if (existing.locked) {
                    throw new AppError(409, `Trip ${trip.tripNo}'s rates are already locked.`);
                }
                await assertRatesComplete(client, tripId, trip.tripNo);
                await client.query(`UPDATE rate_entry SET
             locked = TRUE,
             locked_by = $2,
             locked_at = NOW(),
             updated_by = COALESCE($2, updated_by),
             updated_at = NOW()
           WHERE id = $1`, [existing.id, data.lockedBy ?? "system"]);
                const row = await client.query(`SELECT r.*, t.trip_no FROM rate_entry r JOIN trips t ON t.id = r.trip_id WHERE r.id = $1`, [existing.id]);
                return mapRateEntry(row.rows[0]);
            }
            catch (err) {
                rethrowIfAppError(err);
                throw err;
            }
        });
    },
};
//# sourceMappingURL=rateEntryService.js.map