import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { dateOnly, num, numOrNull, str } from "../utils/coerce.js";
import { paginatedResult, } from "../utils/pagination.js";
import { rethrowIfAppError } from "../utils/pgErrors.js";
import { MAX_SHOP_SALE_RATE, MIN_SHOP_SALE_RATE, parseBody, rateEntryLockSchema, rateEntrySaveSchema, } from "../validation/operations.js";
const ELIGIBLE_WHERE = `
  WHERE t.status = 'Completed'
    AND COALESCE(t.deleted, FALSE) = FALSE
    AND COALESCE(t.rate_completed, FALSE) = FALSE
`;
function addDays(isoDate, days) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
    if (!match)
        return isoDate;
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    const dt = new Date(y, m - 1, d + days);
    const pad = (n) => (n < 10 ? `0${n}` : String(n));
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
function sizeColumnKeysFromFields(fields) {
    return fields
        .map((f) => f.name)
        .filter((name) => /^c\d+$/i.test(name))
        .sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)));
}
function emptySizeColumns(keys) {
    const out = {};
    for (const key of keys)
        out[key] = null;
    return out;
}
function mapEnteredWindowRow(row, sizeKeys) {
    const sizeColumns = {};
    for (const key of sizeKeys) {
        sizeColumns[key] = numOrNull(row[key]);
    }
    return {
        businessDate: dateOnly(row.business_date) ?? "",
        entered: true,
        vij: numOrNull(row.vij),
        gun: numOrNull(row.gun),
        rp: numOrNull(row.rp),
        sneha: numOrNull(row.sneha),
        vencobRate: numOrNull(row.vencob_rate),
        vencobVii: numOrNull(row.vencob_vii),
        vencobGun: numOrNull(row.vencob_gun),
        associationVii: numOrNull(row.association_vii),
        sizeColumns,
    };
}
function emptyWindowRow(date, sizeKeys) {
    return {
        businessDate: date,
        entered: false,
        vij: null,
        gun: null,
        rp: null,
        sneha: null,
        vencobRate: null,
        vencobVii: null,
        vencobGun: null,
        associationVii: null,
        sizeColumns: emptySizeColumns(sizeKeys),
    };
}
function toMarketRateMaster(tripDate, fromDate, toDate, slots, sizeColumnKeys) {
    return {
        tripDate,
        fromDate,
        toDate,
        additionalMetrics: slots.map((r) => ({
            date: r.businessDate,
            entered: r.entered,
            vij: r.vij,
            gun: r.gun,
            rp: r.rp,
        })),
        companyRates: slots.map((r) => ({
            date: r.businessDate,
            entered: r.entered,
            sneha: r.sneha,
            vencobRate: r.vencobRate,
            vencobVii: r.vencobVii,
            vencobGun: r.vencobGun,
            associationVii: r.associationVii,
        })),
        sizeCategoryBreakdown: slots.map((r) => ({
            date: r.businessDate,
            entered: r.entered,
            columns: r.sizeColumns,
        })),
        sizeColumnKeys,
    };
}
/**
 * Market Rate Master rows for tripDate-1, tripDate, tripDate+1 only.
 * Reads the existing `market_rates` table. Missing dates stay null (not 0).
 */
async function loadMarketRatesWindow(client, tripDate) {
    const fromDate = addDays(tripDate, -1);
    const toDate = addDays(tripDate, 1);
    const dates = [fromDate, tripDate, toDate];
    const result = await client.query(`SELECT * FROM market_rates
     WHERE business_date >= $1::date AND business_date <= $2::date
     ORDER BY business_date`, [fromDate, toDate]);
    const sizeKeys = sizeColumnKeysFromFields(result.fields);
    const byDate = new Map();
    for (const row of result.rows) {
        const mapped = mapEnteredWindowRow(row, sizeKeys);
        byDate.set(mapped.businessDate, mapped);
    }
    const slots = dates.map((date) => byDate.get(date) ?? emptyWindowRow(date, sizeKeys));
    return {
        slots,
        master: toMarketRateMaster(tripDate, fromDate, toDate, slots, sizeKeys),
    };
}
function tripDateMasterRate(window, tripDate) {
    const row = window.find((r) => r.businessDate === tripDate);
    if (!row || !row.entered)
        return null;
    return row.vencobRate;
}
async function loadDeliveries(client, tripId, tripDate, includeMarket) {
    const result = await client.query(`SELECT id, serial_no, box_no, shop_id, shop_name, bird_type_id, bird_type,
            birds, weight, mortality, mort_kg, rate, amount, remarks, delivery_mode
     FROM trip_deliveries
     WHERE trip_id = $1
     ORDER BY serial_no NULLS LAST, id`, [tripId]);
    let marketRatesWindow = [];
    let marketRateMaster = null;
    if (includeMarket && tripDate) {
        const loaded = await loadMarketRatesWindow(client, tripDate);
        marketRatesWindow = loaded.slots;
        marketRateMaster = loaded.master;
    }
    const masterRate = includeMarket
        ? tripDateMasterRate(marketRatesWindow, tripDate)
        : null;
    const deliveries = result.rows.map((r) => {
        const market = includeMarket
            ? {
                shopId: numOrNull(r.shop_id),
                shopName: str(r.shop_name),
                birdTypeId: numOrNull(r.bird_type_id),
                birdType: str(r.bird_type),
                masterRate,
                lastTripRate: null,
                lastTripDate: null,
                lastTripNo: null,
                avgTripRate: null,
                tripRateSamples: 0,
            }
            : null;
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
            rate: numOrNull(r.rate),
            amount: num(r.amount),
            remarks: str(r.remarks),
            deliveryMode: str(r.delivery_mode) || "box",
            marketRate: market,
        };
    });
    return { deliveries, marketRatesWindow, marketRateMaster };
}
function mapTrip(row, deliveries, marketRatesWindow = [], marketRateMaster = null) {
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
        totalShops: num(row.total_shops),
        rateLocked: Boolean(row.rate_completed),
        rateLockedAt: row.rate_locked_at == null ? null : new Date(str(row.rate_locked_at)).toISOString(),
        rateLockedBy: row.rate_locked_by == null ? null : str(row.rate_locked_by),
        ratesEntered: deliveries.filter((d) => d.rate != null).length,
        deliveriesCount: deliveries.length,
        totalAmount: Number(totalAmount.toFixed(2)),
        deliveries,
        marketRatesWindow,
        marketRateMaster,
    };
}
async function rejectIfIneligible(client, tripId, row) {
    if (!row) {
        throw new AppError(404, `Trip ${tripId} not found`);
    }
    if (row.rate_completed) {
        throw new AppError(409, `Trip ${tripId} is already rate-locked`);
    }
    throw new AppError(422, `Trip ${tripId} is not eligible for Rate Entry (must be Completed and not deleted)`);
}
async function persistRates(client, tripId, rates) {
    if (!rates.length)
        return;
    const deliveryIds = rates.map((r) => r.deliveryId);
    const existing = await client.query(`SELECT id FROM trip_deliveries WHERE trip_id = $1 AND id = ANY($2::int[])`, [tripId, deliveryIds]);
    const found = new Set(existing.rows.map((r) => num(r.id)));
    const missing = deliveryIds.filter((id) => !found.has(id));
    if (missing.length) {
        throw new AppError(422, "Some deliveries do not belong to this trip", {
            tripId,
            missingDeliveryIds: missing,
        });
    }
    for (const item of rates) {
        await client.query(`UPDATE trip_deliveries
          SET rate = $2,
              amount = ROUND(weight::numeric * $2::numeric, 2),
              updated_at = NOW()
        WHERE id = $1 AND trip_id = $3`, [item.deliveryId, item.rate, tripId]);
    }
}
async function assertAllShopsHaveValidRates(client, tripId) {
    const count = await client.query(`SELECT COUNT(*)::text AS c FROM trip_deliveries WHERE trip_id = $1`, [tripId]);
    if (Number(count.rows[0]?.c ?? 0) === 0) {
        throw new AppError(422, "Every shop delivery must have a rate before locking", {
            tripId,
            missingDeliveries: [],
        });
    }
    const missing = await client.query(`SELECT id, shop_name, rate FROM trip_deliveries
     WHERE trip_id = $1
       AND (rate IS NULL
            OR rate < $2::numeric
            OR rate > $3::numeric)
     ORDER BY serial_no NULLS LAST, id`, [tripId, MIN_SHOP_SALE_RATE, MAX_SHOP_SALE_RATE]);
    if (missing.rowCount) {
        throw new AppError(422, "Every shop delivery must have a rate before locking", {
            tripId,
            missingDeliveries: missing.rows.map((r) => ({
                deliveryId: num(r.id),
                shopName: str(r.shop_name),
                rate: numOrNull(r.rate),
            })),
        });
    }
}
async function stampLock(client, tripId, lockedBy) {
    await client.query(`UPDATE trips
        SET rate_completed = TRUE,
            rate_locked_at = NOW(),
            rate_locked_by = COALESCE($2, rate_locked_by, 'system')
      WHERE id = $1`, [tripId, lockedBy]);
    await client.query(`INSERT INTO rate_entry (
       trip_id, bird_type, rate, locked, locked_by, locked_at, created_by
     ) VALUES ($1, '', 0, TRUE, COALESCE($2, 'system'), NOW(), COALESCE($2, 'system'))
     ON CONFLICT (trip_id) DO UPDATE SET
       locked = TRUE,
       locked_by = COALESCE(EXCLUDED.locked_by, rate_entry.locked_by),
       locked_at = COALESCE(rate_entry.locked_at, NOW()),
       updated_at = NOW()`, [tripId, lockedBy]);
}
async function loadMappedTrip(client, tripId, includeMarket) {
    const trip = await client.query(`SELECT * FROM trips WHERE id = $1`, [tripId]);
    const tripDate = dateOnly(trip.rows[0].trip_date) ?? "";
    const { deliveries, marketRatesWindow, marketRateMaster } = await loadDeliveries(client, tripId, tripDate, includeMarket);
    return mapTrip(trip.rows[0], deliveries, marketRatesWindow, marketRateMaster);
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
                    const tripDate = dateOnly(row.trip_date) ?? "";
                    const { deliveries } = await loadDeliveries(client, num(row.id), tripDate, false);
                    items.push(mapTrip(row, deliveries, []));
                }
                return paginatedResult(items, total, filters.pagination);
            }
            const result = await client.query(`SELECT t.* FROM trips t ${baseWhere}
         ORDER BY t.trip_date DESC, t.id DESC`, params);
            const items = [];
            for (const row of result.rows) {
                const tripDate = dateOnly(row.trip_date) ?? "";
                const { deliveries } = await loadDeliveries(client, num(row.id), tripDate, false);
                items.push(mapTrip(row, deliveries, []));
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
            const tripDate = dateOnly(result.rows[0].trip_date) ?? "";
            const { deliveries, marketRatesWindow, marketRateMaster } = await loadDeliveries(client, id, tripDate, true);
            return mapTrip(result.rows[0], deliveries, marketRatesWindow, marketRateMaster);
        });
    },
    async save(tripId, body) {
        const data = parseBody(rateEntrySaveSchema, body);
        return withTransaction(async (client) => {
            try {
                const locked = await client.query(`SELECT status, COALESCE(deleted,FALSE) AS deleted,
                  COALESCE(rate_completed,FALSE) AS rate_completed
             FROM trips WHERE id = $1 FOR UPDATE`, [tripId]);
                const row = locked.rows[0];
                const eligible = row &&
                    row.status === "Completed" &&
                    !row.deleted &&
                    !row.rate_completed;
                if (!eligible) {
                    await rejectIfIneligible(client, tripId, row);
                }
                await persistRates(client, tripId, data.rates ?? []);
                return loadMappedTrip(client, tripId, true);
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
                const locked = await client.query(`SELECT status, COALESCE(deleted,FALSE) AS deleted,
                  COALESCE(rate_completed,FALSE) AS rate_completed
             FROM trips WHERE id = $1 FOR UPDATE`, [tripId]);
                const row = locked.rows[0];
                if (!row) {
                    throw new AppError(404, `Trip ${tripId} not found`);
                }
                if (row.rate_completed) {
                    return loadMappedTrip(client, tripId, true);
                }
                if (row.status !== "Completed" || row.deleted) {
                    throw new AppError(422, `Trip ${tripId} is not eligible for Rate Entry (must be Completed and not deleted)`);
                }
                if (data.rates?.length) {
                    await persistRates(client, tripId, data.rates);
                }
                await assertAllShopsHaveValidRates(client, tripId);
                await stampLock(client, tripId, data.lockedBy ?? null);
                return loadMappedTrip(client, tripId, true);
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