import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { dateOnly, num, numOrNull, str } from "../utils/coerce.js";
import { paginatedResult, } from "../utils/pagination.js";
import { rethrowIfAppError } from "../utils/pgErrors.js";
import { parseBody, rateEntryLockSchema, rateEntrySaveSchema, } from "../validation/operations.js";
const ELIGIBLE_WHERE = `
  WHERE t.status = 'Completed'
    AND COALESCE(t.deleted, FALSE) = FALSE
    AND COALESCE(t.rate_completed, FALSE) = FALSE
`;
const ELIGIBLE_BY_ID = `
  SELECT t.*
  FROM trips t
  WHERE t.id = $1
    AND t.status = 'Completed'
    AND COALESCE(t.deleted, FALSE) = FALSE
    AND COALESCE(t.rate_completed, FALSE) = FALSE
`;
/** Same shops as Trip List Step 4 cards: captured deliveries only.
 * Pending `[ORDER]` plan stubs (0 birds / 0 kg) stay out of Rate Entry.
 * Captured order-taken shops (`[ORDER]` + birds/weight) are included. */
const RATEABLE_DELIVERY_WHERE = `
  trip_id = $1
  AND COALESCE(shop_id, 0) > 0
  AND COALESCE(birds, 0) > 0
  AND COALESCE(weight, 0) > 0
`;
function marketKey(shopId, birdTypeId) {
    return `${shopId ?? "null"}::${birdTypeId ?? "null"}`;
}
async function loadMarketRates(client, pairs) {
    const out = new Map();
    if (!pairs.length)
        return out;
    const pairSet = new Map();
    for (const p of pairs)
        pairSet.set(marketKey(p.shopId, p.birdTypeId), p);
    const masterResult = await client.query(`SELECT DISTINCT ON (r.shop_id, r.bird_type_id)
       r.shop_id, r.bird_type_id, r.shop_name, r.bird_type, r.rate
     FROM shop_rates r
     INNER JOIN UNNEST($1::int[], $2::int[])
       AS pair(shop_id, bird_type_id)
       ON pair.shop_id IS NOT DISTINCT FROM r.shop_id
      AND pair.bird_type_id IS NOT DISTINCT FROM r.bird_type_id
     WHERE COALESCE(r.deleted, FALSE) = FALSE
     ORDER BY r.shop_id, r.bird_type_id, r.effective_from DESC, r.id DESC`, [
        pairs.map((p) => p.shopId),
        pairs.map((p) => p.birdTypeId),
    ]);
    for (const row of masterResult.rows) {
        const key = marketKey(row.shop_id, row.bird_type_id);
        out.set(key, {
            shopId: numOrNull(row.shop_id),
            shopName: str(row.shop_name),
            birdTypeId: numOrNull(row.bird_type_id),
            birdType: str(row.bird_type),
            masterRate: numOrNull(row.rate),
            lastTripRate: null,
            lastTripDate: null,
            lastTripNo: null,
            avgTripRate: null,
            tripRateSamples: 0,
        });
    }
    const lastResult = await client.query(`
    WITH target AS (
      SELECT shop_id, bird_type_id
      FROM UNNEST($1::int[], $2::int[]) AS pair(shop_id, bird_type_id)
    ),
    matched AS (
      SELECT d.shop_id, d.bird_type_id, d.rate, t.trip_date, t.trip_no, d.id AS delivery_id
      FROM trip_deliveries d
      INNER JOIN trips t ON t.id = d.trip_id
      INNER JOIN target p
        ON p.shop_id IS NOT DISTINCT FROM d.shop_id
       AND p.bird_type_id IS NOT DISTINCT FROM d.bird_type_id
      WHERE t.status = 'Completed'
        AND COALESCE(t.deleted, FALSE) = FALSE
        AND t.rate_completed = TRUE
        AND d.rate IS NOT NULL
    ),
    latest AS (
      SELECT DISTINCT ON (shop_id, bird_type_id)
             shop_id, bird_type_id, rate, trip_date, trip_no
      FROM matched
      ORDER BY shop_id, bird_type_id, trip_date DESC, delivery_id DESC
    ),
    avg AS (
      SELECT shop_id, bird_type_id,
             AVG(rate)::numeric(12,2) AS avg_rate,
             COUNT(*)::int AS samples
      FROM matched
      GROUP BY shop_id, bird_type_id
    )
    SELECT l.shop_id, l.bird_type_id,
           l.rate AS last_trip_rate, l.trip_date AS last_trip_date,
           l.trip_no AS last_trip_no,
           a.avg_rate AS avg_trip_rate, a.samples
    FROM latest l
    LEFT JOIN avg a
      ON a.shop_id IS NOT DISTINCT FROM l.shop_id
     AND a.bird_type_id IS NOT DISTINCT FROM l.bird_type_id
    `, [
        pairs.map((p) => p.shopId),
        pairs.map((p) => p.birdTypeId),
    ]);
    for (const row of lastResult.rows) {
        const key = marketKey(row.shop_id, row.bird_type_id);
        const existing = out.get(key) ?? {
            shopId: numOrNull(row.shop_id),
            shopName: "",
            birdTypeId: numOrNull(row.bird_type_id),
            birdType: "",
            masterRate: null,
            lastTripRate: null,
            lastTripDate: null,
            lastTripNo: null,
            avgTripRate: null,
            tripRateSamples: 0,
        };
        existing.lastTripRate = numOrNull(row.last_trip_rate);
        existing.lastTripDate = dateOnly(row.last_trip_date);
        existing.lastTripNo = row.last_trip_no == null ? null : str(row.last_trip_no);
        existing.avgTripRate = numOrNull(row.avg_trip_rate);
        existing.tripRateSamples = Number(row.samples ?? 0);
        out.set(key, existing);
    }
    return out;
}
async function loadDeliveries(client, tripId) {
    const result = await client.query(`SELECT id, serial_no, box_no, shop_id, shop_name, bird_type_id, bird_type,
            birds, weight, mortality, mort_kg, rate, amount, remarks, delivery_mode,
            auto_capture_time
     FROM trip_deliveries
     WHERE ${RATEABLE_DELIVERY_WHERE}
     ORDER BY auto_capture_time ASC NULLS LAST, serial_no ASC NULLS LAST, id ASC`, [tripId]);
    const pairs = result.rows.map((r) => ({
        shopId: numOrNull(r.shop_id),
        birdTypeId: numOrNull(r.bird_type_id),
    }));
    const market = await loadMarketRates(client, pairs);
    return result.rows.map((r) => {
        const key = marketKey(numOrNull(r.shop_id), numOrNull(r.bird_type_id));
        const rate = numOrNull(r.rate);
        return {
            id: num(r.id),
            serialNo: numOrNull(r.serial_no),
            boxNo: numOrNull(r.box_no),
            shopId: numOrNull(r.shop_id),
            shopName: str(r.shop_name),
            birdTypeId: numOrNull(r.bird_type_id),
            birdType: str(r.bird_type),
            birds: num(r.birds),
            weight: num(r.weight),
            mortality: num(r.mortality),
            mortKg: numOrNull(r.mort_kg),
            rate,
            amount: num(r.amount),
            remarks: str(r.remarks),
            deliveryMode: str(r.delivery_mode) || "box",
            autoCaptureTime: r.auto_capture_time == null
                ? null
                : new Date(r.auto_capture_time).toISOString(),
            marketRate: market.get(key) ?? null,
        };
    });
}
function mapTrip(row, deliveries) {
    const totalAmount = deliveries
        .filter((d) => d.rate != null)
        .reduce((sum, d) => sum + d.amount, 0);
    return {
        id: num(row.id),
        tripNo: str(row.trip_no),
        tripDate: dateOnly(row.trip_date) ?? "",
        status: str(row.status),
        vehicleNo: row.vehicle_no == null ? null : str(row.vehicle_no),
        driverName: row.driver_name == null ? null : str(row.driver_name),
        supervisorName: row.supervisor_name == null ? null : str(row.supervisor_name),
        sourceFarm: row.source_farm == null ? null : str(row.source_farm),
        totalBirds: num(row.total_birds),
        totalWeight: num(row.total_weight),
        // Prefer Step-4 rateable shop count over the trip summary field (which can
        // still include pending `[ORDER]` plan stubs).
        totalShops: deliveries.length > 0 ? deliveries.length : num(row.total_shops),
        rateLocked: Boolean(row.rate_completed),
        rateLockedAt: row.rate_locked_at == null ? null : new Date(str(row.rate_locked_at)).toISOString(),
        rateLockedBy: row.rate_locked_by == null ? null : str(row.rate_locked_by),
        ratesEntered: deliveries.filter((d) => d.rate != null).length,
        deliveriesCount: deliveries.length,
        totalAmount: Number(totalAmount.toFixed(2)),
        deliveries,
    };
}
export const rateEntryService = {
    async list(filters = {}) {
        const clauses = [];
        const params = [];
        if (filters.fromDate) {
            params.push(filters.fromDate);
            clauses.push(`t.trip_date >= $${params.length}`);
        }
        if (filters.toDate) {
            params.push(filters.toDate);
            clauses.push(`t.trip_date <= $${params.length}`);
        }
        if (filters.vehicleId) {
            params.push(filters.vehicleId);
            clauses.push(`t.vehicle_id = $${params.length}`);
        }
        if (filters.supervisorId) {
            params.push(filters.supervisorId);
            clauses.push(`t.supervisor_id = $${params.length}`);
        }
        if (filters.driverId) {
            params.push(filters.driverId);
            clauses.push(`t.driver_id = $${params.length}`);
        }
        if (filters.farmId) {
            params.push(filters.farmId);
            clauses.push(`t.source_farm_id = $${params.length}`);
        }
        if (filters.search) {
            params.push(`%${filters.search}%`);
            clauses.push(`(t.trip_no ILIKE $${params.length}
          OR t.vehicle_no ILIKE $${params.length}
          OR t.driver_name ILIKE $${params.length}
          OR t.supervisor_name ILIKE $${params.length}
          OR t.source_farm ILIKE $${params.length})`);
        }
        const extraWhere = clauses.length ? `AND ${clauses.join(" AND ")}` : "";
        const baseWhere = ELIGIBLE_WHERE.trimEnd() + "\n  " + extraWhere;
        return withTransaction(async (client) => {
            if (filters.pagination) {
                const countResult = await client.query(`SELECT COUNT(*)::text AS c FROM trips t ${baseWhere}`, params);
                const total = Number(countResult.rows[0]?.c ?? 0);
                const pagedParams = [
                    ...params,
                    filters.pagination.limit,
                    filters.pagination.offset,
                ];
                const result = await client.query(`SELECT t.* FROM trips t ${baseWhere}
           ORDER BY t.trip_date DESC, t.id DESC
           LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, pagedParams);
                const items = [];
                for (const row of result.rows) {
                    const deliveries = await loadDeliveries(client, num(row.id));
                    items.push(mapTrip(row, deliveries));
                }
                return paginatedResult(items, total, filters.pagination);
            }
            const result = await client.query(`SELECT t.* FROM trips t ${baseWhere}
         ORDER BY t.trip_date DESC, t.id DESC`, params);
            const items = [];
            for (const row of result.rows) {
                const deliveries = await loadDeliveries(client, num(row.id));
                items.push(mapTrip(row, deliveries));
            }
            return items;
        });
    },
    async getById(id) {
        return withTransaction(async (client) => {
            const result = await client.query(`SELECT t.* FROM trips t
         WHERE t.id = $1
           AND t.status = 'Completed'
           AND COALESCE(t.deleted, FALSE) = FALSE`, [id]);
            if (!result.rowCount) {
                throw new AppError(404, `Trip ${id} is not available for Rate Entry`);
            }
            const deliveries = await loadDeliveries(client, id);
            return mapTrip(result.rows[0], deliveries);
        });
    },
    async save(tripId, body) {
        const data = parseBody(rateEntrySaveSchema, body);
        return withTransaction(async (client) => {
            try {
                const eligible = await client.query(ELIGIBLE_BY_ID, [tripId]);
                if (!eligible.rowCount) {
                    const current = await client.query(`SELECT status, COALESCE(deleted,FALSE) AS deleted,
                    COALESCE(rate_completed,FALSE) AS rate_completed
             FROM trips WHERE id = $1`, [tripId]);
                    if (!current.rowCount) {
                        throw new AppError(404, `Trip ${tripId} not found`);
                    }
                    const c = current.rows[0];
                    if (c.rate_completed) {
                        throw new AppError(409, `Trip ${tripId} is already rate-locked`);
                    }
                    throw new AppError(422, `Trip ${tripId} is not eligible for Rate Entry (must be Completed and not deleted)`);
                }
                const deliveryIds = data.rates.map((r) => r.deliveryId);
                const existing = await client.query(`SELECT id, weight FROM trip_deliveries
           WHERE trip_id = $1 AND id = ANY($2::int[])`, [tripId, deliveryIds]);
                const found = new Set(existing.rows.map((r) => num(r.id)));
                const missing = deliveryIds.filter((id) => !found.has(id));
                if (missing.length) {
                    throw new AppError(422, "Some deliveries do not belong to this trip", {
                        tripId,
                        missingDeliveryIds: missing,
                    });
                }
                const weightById = new Map();
                for (const r of existing.rows)
                    weightById.set(num(r.id), num(r.weight));
                for (const item of data.rates) {
                    const weight = weightById.get(item.deliveryId) ?? 0;
                    const amount = Number((weight * item.rate).toFixed(2));
                    await client.query(`UPDATE trip_deliveries
               SET rate = $2, amount = $3, updated_at = NOW()
             WHERE id = $1 AND trip_id = $4`, [item.deliveryId, item.rate, amount, tripId]);
                }
                const trip = await client.query(`SELECT * FROM trips WHERE id = $1`, [
                    tripId,
                ]);
                const deliveries = await loadDeliveries(client, tripId);
                return mapTrip(trip.rows[0], deliveries);
            }
            catch (err) {
                rethrowIfAppError(err);
                throw err;
            }
        });
    },
    async lock(tripId, body) {
        const data = parseBody(rateEntryLockSchema, body);
        return withTransaction(async (client) => {
            try {
                const eligible = await client.query(`SELECT * FROM trips
           WHERE id = $1
             AND status = 'Completed'
             AND COALESCE(deleted, FALSE) = FALSE
             AND COALESCE(rate_completed, FALSE) = FALSE
           FOR UPDATE`, [tripId]);
                if (!eligible.rowCount) {
                    const current = await client.query(`SELECT status, COALESCE(deleted,FALSE) AS deleted,
                    COALESCE(rate_completed,FALSE) AS rate_completed
             FROM trips WHERE id = $1`, [tripId]);
                    if (!current.rowCount) {
                        throw new AppError(404, `Trip ${tripId} not found`);
                    }
                    const c = current.rows[0];
                    if (c.rate_completed) {
                        throw new AppError(409, `Trip ${tripId} is already rate-locked`);
                    }
                    throw new AppError(422, `Trip ${tripId} is not eligible for Rate Entry (must be Completed and not deleted)`);
                }
                const rateable = await client.query(`SELECT id, shop_name, rate FROM trip_deliveries
           WHERE ${RATEABLE_DELIVERY_WHERE}
           ORDER BY auto_capture_time ASC NULLS LAST, serial_no ASC NULLS LAST, id ASC`, [tripId]);
                if (!rateable.rowCount) {
                    throw new AppError(422, "Every shop delivery must have a rate before locking", {
                        tripId,
                        missingDeliveries: [],
                    });
                }
                const missing = rateable.rows.filter((r) => r.rate == null);
                if (missing.length) {
                    throw new AppError(422, "Every shop delivery must have a rate before locking", {
                        tripId,
                        missingDeliveries: missing.map((r) => ({
                            deliveryId: num(r.id),
                            shopName: str(r.shop_name),
                        })),
                    });
                }
                await client.query(`UPDATE trips
             SET rate_completed = TRUE,
                 rate_locked_at = NOW(),
                 rate_locked_by = COALESCE($2, rate_locked_by, 'system')
           WHERE id = $1`, [tripId, data.lockedBy ?? null]);
                const trip = await client.query(`SELECT * FROM trips WHERE id = $1`, [
                    tripId,
                ]);
                const deliveries = await loadDeliveries(client, tripId);
                return mapTrip(trip.rows[0], deliveries);
            }
            catch (err) {
                rethrowIfAppError(err);
                throw err;
            }
        });
    },
};
export async function countEligible() {
    const r = await query(`SELECT COUNT(*)::text AS c FROM trips t ${ELIGIBLE_WHERE}`);
    return Number(r.rows[0]?.c ?? 0);
}
//# sourceMappingURL=rateEntryService.js.map