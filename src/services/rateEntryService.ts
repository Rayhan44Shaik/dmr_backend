import type pg from "pg";
import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import type {
  RateEntryDelivery,
  RateEntryMarketRate,
  RateEntryMarketRateMaster,
  RateEntryMarketRateWindowRow,
  RateEntryTrip,
} from "../types/operations.js";
import { dateOnly, num, numOrNull, str } from "../utils/coerce.js";
import {
  paginatedResult,
  type PaginatedResult,
  type PaginationParams,
} from "../utils/pagination.js";
import { rethrowIfAppError } from "../utils/pgErrors.js";
import {
  MAX_SHOP_SALE_RATE,
  MIN_SHOP_SALE_RATE,
  parseBody,
  rateEntryLockSchema,
  rateEntrySaveSchema,
} from "../validation/operations.js";

type Client = pg.PoolClient;

const ELIGIBLE_WHERE = `
  WHERE t.status = 'Completed'
    AND COALESCE(t.deleted, FALSE) = FALSE
    AND COALESCE(t.rate_completed, FALSE) = FALSE
`;

interface DeliveryRow extends Record<string, unknown> {
  id: number;
  serial_no: number | null;
  box_no: number | null;
  shop_id: number | null;
  shop_name: string;
  bird_type_id: number | null;
  bird_type: string;
  birds: number;
  weight: number;
  mortality: number;
  mort_kg: number | null;
  rate: number | null;
  amount: number;
  remarks: string;
  delivery_mode: "box" | "weight";
}

function addDays(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const dt = new Date(y, m - 1, d + days);
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function sizeColumnKeysFromFields(fields: Array<{ name: string }>): string[] {
  return fields
    .map((f) => f.name)
    .filter((name) => /^c\d+$/i.test(name))
    .sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)));
}

function emptySizeColumns(keys: string[]): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const key of keys) out[key] = null;
  return out;
}

function mapEnteredWindowRow(
  row: Record<string, unknown>,
  sizeKeys: string[]
): RateEntryMarketRateWindowRow {
  const sizeColumns: Record<string, number | null> = {};
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

function emptyWindowRow(date: string, sizeKeys: string[]): RateEntryMarketRateWindowRow {
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

function toMarketRateMaster(
  tripDate: string,
  fromDate: string,
  toDate: string,
  slots: RateEntryMarketRateWindowRow[],
  sizeColumnKeys: string[]
): RateEntryMarketRateMaster {
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
async function loadMarketRatesWindow(
  client: Client,
  tripDate: string
): Promise<{
  slots: RateEntryMarketRateWindowRow[];
  master: RateEntryMarketRateMaster;
}> {
  const fromDate = addDays(tripDate, -1);
  const toDate = addDays(tripDate, 1);
  const dates = [fromDate, tripDate, toDate];
  const result = await client.query(
    `SELECT * FROM market_rates
     WHERE business_date >= $1::date AND business_date <= $2::date
     ORDER BY business_date`,
    [fromDate, toDate]
  );
  const sizeKeys = sizeColumnKeysFromFields(result.fields);
  const byDate = new Map<string, RateEntryMarketRateWindowRow>();
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

function tripDateMasterRate(
  window: RateEntryMarketRateWindowRow[],
  tripDate: string
): number | null {
  const row = window.find((r) => r.businessDate === tripDate);
  if (!row || !row.entered) return null;
  return row.vencobRate;
}

async function loadDeliveries(
  client: Client,
  tripId: number,
  tripDate: string,
  includeMarket: boolean
): Promise<{
  deliveries: RateEntryDelivery[];
  marketRatesWindow: RateEntryMarketRateWindowRow[];
  marketRateMaster: RateEntryMarketRateMaster | null;
}> {
  const result = await client.query<DeliveryRow>(
    `SELECT id, serial_no, box_no, shop_id, shop_name, bird_type_id, bird_type,
            birds, weight, mortality, mort_kg, rate, amount, remarks, delivery_mode
     FROM trip_deliveries
     WHERE trip_id = $1
     ORDER BY serial_no NULLS LAST, id`,
    [tripId]
  );

  let marketRatesWindow: RateEntryMarketRateWindowRow[] = [];
  let marketRateMaster: RateEntryMarketRateMaster | null = null;
  if (includeMarket && tripDate) {
    const loaded = await loadMarketRatesWindow(client, tripDate);
    marketRatesWindow = loaded.slots;
    marketRateMaster = loaded.master;
  }
  const masterRate = includeMarket
    ? tripDateMasterRate(marketRatesWindow, tripDate)
    : null;

  const deliveries = result.rows.map((r) => {
    const market: RateEntryMarketRate | null = includeMarket
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
      deliveryMode: (str(r.delivery_mode) as "box" | "weight") || "box",
      marketRate: market,
    };
  });

  return { deliveries, marketRatesWindow, marketRateMaster };
}

function mapTrip(
  row: Record<string, unknown>,
  deliveries: RateEntryDelivery[],
  marketRatesWindow: RateEntryMarketRateWindowRow[] = [],
  marketRateMaster: RateEntryMarketRateMaster | null = null
): RateEntryTrip {
  const totalAmount = deliveries
    .filter((d) => d.rate != null)
    .reduce((sum, d) => sum + d.amount, 0);

  return {
    id: num(row.id),
    tripNo: str(row.trip_no),
    tripDate: dateOnly(row.trip_date) ?? "",
    status: str(row.status) as RateEntryTrip["status"],
    vehicleNo: row.vehicle_no == null ? null : str(row.vehicle_no),
    driverName: row.driver_name == null ? null : str(row.driver_name),
    supervisorName: row.supervisor_name == null ? null : str(row.supervisor_name),
    sourceFarm: row.source_farm == null ? null : str(row.source_farm),
    totalBirds: num(row.total_birds),
    totalWeight: num(row.total_weight),
    totalShops: num(row.total_shops),
    rateLocked: Boolean(row.rate_completed),
    rateLockedAt:
      row.rate_locked_at == null ? null : new Date(str(row.rate_locked_at)).toISOString(),
    rateLockedBy: row.rate_locked_by == null ? null : str(row.rate_locked_by),
    ratesEntered: deliveries.filter((d) => d.rate != null).length,
    deliveriesCount: deliveries.length,
    totalAmount: Number(totalAmount.toFixed(2)),
    deliveries,
    marketRatesWindow,
    marketRateMaster,
  };
}

async function rejectIfIneligible(
  client: Client,
  tripId: number,
  row: {
    status: string;
    deleted: boolean;
    rate_completed: boolean;
  } | undefined
): Promise<void> {
  if (!row) {
    throw new AppError(404, `Trip ${tripId} not found`);
  }
  if (row.rate_completed) {
    throw new AppError(409, `Trip ${tripId} is already rate-locked`);
  }
  throw new AppError(
    422,
    `Trip ${tripId} is not eligible for Rate Entry (must be Completed and not deleted)`
  );
}

async function persistRates(
  client: Client,
  tripId: number,
  rates: Array<{ deliveryId: number; rate: number }>
): Promise<void> {
  if (!rates.length) return;

  const deliveryIds = rates.map((r) => r.deliveryId);
  const existing = await client.query<{ id: number }>(
    `SELECT id FROM trip_deliveries WHERE trip_id = $1 AND id = ANY($2::int[])`,
    [tripId, deliveryIds]
  );
  const found = new Set(existing.rows.map((r) => num(r.id)));
  const missing = deliveryIds.filter((id) => !found.has(id));
  if (missing.length) {
    throw new AppError(422, "Some deliveries do not belong to this trip", {
      tripId,
      missingDeliveryIds: missing,
    });
  }

  for (const item of rates) {
    await client.query(
      `UPDATE trip_deliveries
          SET rate = $2,
              amount = ROUND(weight::numeric * $2::numeric, 2),
              updated_at = NOW()
        WHERE id = $1 AND trip_id = $3`,
      [item.deliveryId, item.rate, tripId]
    );
  }
}

async function assertAllShopsHaveValidRates(client: Client, tripId: number): Promise<void> {
  const count = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM trip_deliveries WHERE trip_id = $1`,
    [tripId]
  );
  if (Number(count.rows[0]?.c ?? 0) === 0) {
    throw new AppError(422, "Every shop delivery must have a rate before locking", {
      tripId,
      missingDeliveries: [],
    });
  }

  const missing = await client.query<{ id: number; shop_name: string; rate: number | null }>(
    `SELECT id, shop_name, rate FROM trip_deliveries
     WHERE trip_id = $1
       AND (rate IS NULL
            OR rate < $2::numeric
            OR rate > $3::numeric)
     ORDER BY serial_no NULLS LAST, id`,
    [tripId, MIN_SHOP_SALE_RATE, MAX_SHOP_SALE_RATE]
  );
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

async function stampLock(client: Client, tripId: number, lockedBy: string | null): Promise<void> {
  await client.query(
    `UPDATE trips
        SET rate_completed = TRUE,
            rate_locked_at = NOW(),
            rate_locked_by = COALESCE($2, rate_locked_by, 'system')
      WHERE id = $1`,
    [tripId, lockedBy]
  );

  await client.query(
    `INSERT INTO rate_entry (
       trip_id, bird_type, rate, locked, locked_by, locked_at, created_by
     ) VALUES ($1, '', 0, TRUE, COALESCE($2, 'system'), NOW(), COALESCE($2, 'system'))
     ON CONFLICT (trip_id) DO UPDATE SET
       locked = TRUE,
       locked_by = COALESCE(EXCLUDED.locked_by, rate_entry.locked_by),
       locked_at = COALESCE(rate_entry.locked_at, NOW()),
       updated_at = NOW()`,
    [tripId, lockedBy]
  );
}

async function loadMappedTrip(client: Client, tripId: number, includeMarket: boolean): Promise<RateEntryTrip> {
  const trip = await client.query(`SELECT * FROM trips WHERE id = $1`, [tripId]);
  const tripDate = dateOnly(trip.rows[0].trip_date) ?? "";
  const { deliveries, marketRatesWindow, marketRateMaster } = await loadDeliveries(
    client,
    tripId,
    tripDate,
    includeMarket
  );
  return mapTrip(trip.rows[0], deliveries, marketRatesWindow, marketRateMaster);
}

export const rateEntryService = {
  async list(
    filters: {
      fromDate?: string;
      toDate?: string;
      vehicleId?: number;
      supervisorId?: number;
      driverId?: number;
      farmId?: number;
      search?: string;
      pagination?: PaginationParams | null;
    } = {}
  ): Promise<RateEntryTrip[] | PaginatedResult<RateEntryTrip>> {
    const clauses: string[] = [];
    const params: unknown[] = [];

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
      clauses.push(
        `(t.trip_no ILIKE $${params.length}
          OR t.vehicle_no ILIKE $${params.length}
          OR t.driver_name ILIKE $${params.length}
          OR t.supervisor_name ILIKE $${params.length}
          OR t.source_farm ILIKE $${params.length})`
      );
    }

    const extraWhere = clauses.length ? `AND ${clauses.join(" AND ")}` : "";
    const baseWhere = ELIGIBLE_WHERE.trimEnd() + "\n  " + extraWhere;

    return withTransaction(async (client) => {
      if (filters.pagination) {
        const countResult = await client.query<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM trips t ${baseWhere}`,
          params
        );
        const total = Number(countResult.rows[0]?.c ?? 0);
        const pagedParams = [
          ...params,
          filters.pagination.limit,
          filters.pagination.offset,
        ];
        const result = await client.query(
          `SELECT t.* FROM trips t ${baseWhere}
           ORDER BY t.trip_date DESC, t.id DESC
           LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          pagedParams
        );

        const items: RateEntryTrip[] = [];
        for (const row of result.rows) {
          const tripDate = dateOnly(row.trip_date) ?? "";
          const { deliveries } = await loadDeliveries(client, num(row.id), tripDate, false);
          items.push(mapTrip(row, deliveries, []));
        }
        return paginatedResult(items, total, filters.pagination);
      }

      const result = await client.query(
        `SELECT t.* FROM trips t ${baseWhere}
         ORDER BY t.trip_date DESC, t.id DESC`,
        params
      );
      const items: RateEntryTrip[] = [];
      for (const row of result.rows) {
        const tripDate = dateOnly(row.trip_date) ?? "";
        const { deliveries } = await loadDeliveries(client, num(row.id), tripDate, false);
        items.push(mapTrip(row, deliveries, []));
      }
      return items;
    });
  },

  async getById(id: number): Promise<RateEntryTrip> {
    return withTransaction(async (client) => {
      const result = await client.query(
        `SELECT t.* FROM trips t
         WHERE t.id = $1
           AND t.status = 'Completed'
           AND COALESCE(t.deleted, FALSE) = FALSE`,
        [id]
      );
      if (!result.rowCount) {
        throw new AppError(404, `Trip ${id} is not available for Rate Entry`);
      }
      const tripDate = dateOnly(result.rows[0].trip_date) ?? "";
      const { deliveries, marketRatesWindow, marketRateMaster } = await loadDeliveries(
        client,
        id,
        tripDate,
        true
      );
      return mapTrip(result.rows[0], deliveries, marketRatesWindow, marketRateMaster);
    });
  },

  async save(tripId: number, body: unknown): Promise<RateEntryTrip> {
    const data = parseBody(rateEntrySaveSchema, body);

    return withTransaction(async (client) => {
      try {
        const locked = await client.query<{
          status: string;
          deleted: boolean;
          rate_completed: boolean;
        }>(
          `SELECT status, COALESCE(deleted,FALSE) AS deleted,
                  COALESCE(rate_completed,FALSE) AS rate_completed
             FROM trips WHERE id = $1 FOR UPDATE`,
          [tripId]
        );
        const row = locked.rows[0];
        const eligible =
          row &&
          row.status === "Completed" &&
          !row.deleted &&
          !row.rate_completed;
        if (!eligible) {
          await rejectIfIneligible(client, tripId, row);
        }

        await persistRates(client, tripId, data.rates ?? []);
        return loadMappedTrip(client, tripId, true);
      } catch (err) {
        rethrowIfAppError(err);
        throw err;
      }
    });
  },

  async lock(tripId: number, body: unknown): Promise<RateEntryTrip> {
    const data = parseBody(rateEntryLockSchema, body);

    return withTransaction(async (client) => {
      try {
        const locked = await client.query<{
          status: string;
          deleted: boolean;
          rate_completed: boolean;
        }>(
          `SELECT status, COALESCE(deleted,FALSE) AS deleted,
                  COALESCE(rate_completed,FALSE) AS rate_completed
             FROM trips WHERE id = $1 FOR UPDATE`,
          [tripId]
        );
        const row = locked.rows[0];
        if (!row) {
          throw new AppError(404, `Trip ${tripId} not found`);
        }
        if (row.rate_completed) {
          return loadMappedTrip(client, tripId, true);
        }
        if (row.status !== "Completed" || row.deleted) {
          throw new AppError(
            422,
            `Trip ${tripId} is not eligible for Rate Entry (must be Completed and not deleted)`
          );
        }

        if (data.rates?.length) {
          await persistRates(client, tripId, data.rates);
        }

        await assertAllShopsHaveValidRates(client, tripId);
        await stampLock(client, tripId, data.lockedBy ?? null);
        return loadMappedTrip(client, tripId, true);
      } catch (err) {
        rethrowIfAppError(err);
        throw err;
      }
    });
  },
};

export async function countEligible(): Promise<number> {
  const r = await query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM trips t ${ELIGIBLE_WHERE}`
  );
  return Number(r.rows[0]?.c ?? 0);
}
