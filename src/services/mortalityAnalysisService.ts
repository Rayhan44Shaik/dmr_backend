/**
 * Mortality & Weight Loss Analysis — read-only aggregate service.
 *
 * WHY THIS EXISTS
 * ---------------
 * The mortality page previously downloaded every trip (`GET /api/trips`,
 * unpaginated) and then issued one detail request per completed trip purely to
 * count shops. That is an N+1 fan-out, and the detail endpoint inlines base64
 * DC photos, so the page pulled multiple megabytes to render a table.
 *
 * Every figure this page needs is already denormalised onto `trips`, so this
 * service answers the whole screen in ONE round trip:
 *   - server-side filtering, sorting and pagination
 *   - KPI aggregates computed over the entire filtered set (never just the page)
 *   - the distinct farm/supervisor values for the filter dropdowns
 *
 * SCOPE
 * -----
 * Completed trips only (`status = 'Completed' AND deleted = FALSE`). Draft,
 * Pending and soft-deleted trips are not finished business data and must never
 * appear in loss analysis.
 *
 * FORMULA PARITY
 * --------------
 * The farm-capacity precedence below is copied verbatim from
 * `src/utils/tripCalculations.ts` / `src/utils/tripDeliverySync.ts` so this
 * endpoint can never disagree with the rest of the application:
 *   farmWeight = farm_load_weight > 0 ? farm_load_weight : dc_weight
 *   farmBirds  = farm_bird_count  > 0 ? farm_bird_count  : total_birds
 */

import { query } from "../config/db.js";
import { num, str, dateOnly } from "../utils/coerce.js";
import { paginatedResult, type PaginationParams } from "../utils/pagination.js";
import {
  MORTALITY_SORT_COLUMNS,
  type MortalityAnalysisQuery,
} from "../validation/mortality.js";

// ── Shared SQL fragments ────────────────────────────────────────────────────
// Defined once so the row query, the ORDER BY and the KPI aggregate can never
// drift apart. Mirrors tripCalculations.ts exactly.

/** Farm birds actually loaded — falls back to the DC count. */
const FARM_BIRDS_SQL = `(CASE WHEN trips.farm_bird_count > 0 THEN trips.farm_bird_count ELSE trips.total_birds END)`;

/** Farm weight actually loaded — falls back to the DC weight. */
const FARM_WEIGHT_SQL = `(CASE WHEN trips.farm_load_weight > 0 THEN trips.farm_load_weight ELSE trips.dc_weight END)`;

/**
 * Mortality %.
 * Primary source is the trip's own `survival_rate`, which the backend stores as
 * a 0–1 fraction (see tripCalculations.ts). Clamped to [0,1] before use so a
 * bad legacy row cannot produce a negative or >100 percentage.
 * Falls back to count/farm-birds when survival_rate was never computed.
 */
const MORTALITY_PCT_SQL = `(CASE
  WHEN trips.survival_rate > 0
    THEN ROUND((1 - LEAST(GREATEST(trips.survival_rate, 0), 1)) * 100, 2)
  WHEN ${FARM_BIRDS_SQL} > 0
    THEN ROUND((trips.total_mortality_count::numeric / ${FARM_BIRDS_SQL}) * 100, 2)
  ELSE 0 END)`;

/** Weight loss as a percentage of the farm weight loaded. */
const WEIGHT_LOSS_PCT_SQL = `(CASE
  WHEN ${FARM_WEIGHT_SQL} > 0
    THEN ROUND((trips.weight_loss / ${FARM_WEIGHT_SQL}) * 100, 2)
  ELSE 0 END)`;

/** Always restrict to finished, non-deleted business data. */
const BASE_WHERE = `trips.status = 'Completed' AND trips.deleted = FALSE`;

// ── Row mapping ─────────────────────────────────────────────────────────────

export interface MortalityRow {
  tripId: number;
  tripNo: string;
  /** Local calendar date, `YYYY-MM-DD` — never a UTC-shifted timestamp. */
  tripDate: string;
  sourceFarm: string;
  supervisorName: string;
  vehicleNo: string;
  driverName: string;
  /** Always "Completed" — the endpoint is restricted to finished trips. */
  status: string;
  farmBirds: number;
  farmWeight: number;
  deliveryShops: number;
  deliveredBirds: number;
  deliveredWeight: number;
  mortalityCount: number;
  mortalityWeight: number;
  weightLoss: number;
  weightLossPercentage: number;
  mortalityPercentage: number;
  survivalRate: number;
}

export interface MortalityKpis {
  totalTrips: number;
  farmBirds: number;
  farmWeight: number;
  deliveryShops: number;
  deliveredBirds: number;
  deliveredWeight: number;
  mortalityCount: number;
  mortalityWeight: number;
  mortalityPercentage: number;
  weightLoss: number;
  weightLossPercentage: number;
}

export interface MortalityFilterOptions {
  farms: string[];
  supervisors: string[];
}

export interface MortalityAnalysisResult {
  data: MortalityRow[];
  meta: { total: number; page: number; limit: number; totalPages: number };
  /** Aggregates over the whole filtered set — never just the current page. */
  kpis: MortalityKpis;
  /** Dropdown values across ALL completed trips, unaffected by current filters. */
  filterOptions: MortalityFilterOptions;
}

/** Percentages — two decimals is well past display precision. */
function round2(value: unknown): number {
  const n = num(value, 0);
  return Math.round(n * 100) / 100;
}

/**
 * Weights — three decimals, matching the NUMERIC(12,3) column precision, so no
 * information is lost in transit. The presentation layer still rounds for
 * display, but any client-side re-aggregation stays exact.
 */
function round3(value: unknown): number {
  const n = num(value, 0);
  return Math.round(n * 1000) / 1000;
}

type RowRecord = Record<string, unknown>;

function toMortalityRow(row: RowRecord): MortalityRow {
  return {
    tripId: num(row.id),
    tripNo: str(row.trip_no),
    tripDate: dateOnly(row.trip_date) ?? "",
    sourceFarm: str(row.source_farm),
    supervisorName: str(row.supervisor_name),
    vehicleNo: str(row.vehicle_no),
    driverName: str(row.driver_name),
    status: str(row.status),
    farmBirds: num(row.farm_birds),
    farmWeight: round3(row.farm_weight),
    deliveryShops: num(row.delivery_shops),
    deliveredBirds: num(row.delivered_birds),
    deliveredWeight: round3(row.delivered_weight),
    mortalityCount: num(row.mortality_count),
    mortalityWeight: round3(row.mortality_weight),
    weightLoss: round3(row.weight_loss),
    weightLossPercentage: round2(row.weight_loss_percentage),
    mortalityPercentage: round2(row.mortality_percentage),
    survivalRate: num(row.survival_rate),
  };
}

// ── WHERE construction ──────────────────────────────────────────────────────

interface WhereClause {
  sql: string;
  params: unknown[];
}

/**
 * Escape the wildcards a user could otherwise smuggle into ILIKE.
 * Without this, searching for "50%" or "A_B" silently changes the query.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function buildWhere(filters: MortalityAnalysisQuery): WhereClause {
  const clauses: string[] = [BASE_WHERE];
  const params: unknown[] = [];

  // `trip_date` is a DATE column, so comparing against a bound date is exact
  // and completely free of timezone drift (no ::text, no AT TIME ZONE).
  if (filters.fromDate) {
    params.push(filters.fromDate);
    clauses.push(`trips.trip_date >= $${params.length}::date`);
  }
  if (filters.toDate) {
    params.push(filters.toDate);
    clauses.push(`trips.trip_date <= $${params.length}::date`);
  }
  if (filters.farm) {
    params.push(filters.farm);
    clauses.push(`trips.source_farm = $${params.length}`);
  }
  if (filters.supervisor) {
    params.push(filters.supervisor);
    clauses.push(`trips.supervisor_name = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${escapeLike(filters.search)}%`);
    const p = `$${params.length}`;
    clauses.push(`(
      trips.trip_no        ILIKE ${p} ESCAPE '\\' OR
      trips.vehicle_no     ILIKE ${p} ESCAPE '\\' OR
      trips.driver_name    ILIKE ${p} ESCAPE '\\' OR
      trips.supervisor_name ILIKE ${p} ESCAPE '\\' OR
      trips.source_farm    ILIKE ${p} ESCAPE '\\'
    )`);
  }

  return { sql: clauses.join(" AND "), params };
}

// ── SELECT list ─────────────────────────────────────────────────────────────

const ROW_SELECT = `SELECT
  trips.id,
  trips.trip_no,
  trips.trip_date,
  trips.source_farm,
  trips.supervisor_name,
  trips.vehicle_no,
  trips.driver_name,
  trips.status,
  ${FARM_BIRDS_SQL}          AS farm_birds,
  ${FARM_WEIGHT_SQL}         AS farm_weight,
  trips.total_shops          AS delivery_shops,
  trips.total_birds_delivered AS delivered_birds,
  trips.total_delivered_weight AS delivered_weight,
  trips.total_mortality_count  AS mortality_count,
  trips.total_mortality_weight AS mortality_weight,
  trips.weight_loss,
  trips.survival_rate,
  ${MORTALITY_PCT_SQL}    AS mortality_percentage,
  ${WEIGHT_LOSS_PCT_SQL}  AS weight_loss_percentage
FROM trips`;

// ── Service ─────────────────────────────────────────────────────────────────

async function loadKpis(where: WhereClause): Promise<MortalityKpis> {
  const result = await query<RowRecord>(
    `SELECT
       COUNT(*)::text                              AS total_trips,
       COALESCE(SUM(${FARM_BIRDS_SQL}), 0)::text   AS farm_birds,
       COALESCE(SUM(${FARM_WEIGHT_SQL}), 0)::text  AS farm_weight,
       COALESCE(SUM(trips.total_shops), 0)::text   AS delivery_shops,
       COALESCE(SUM(trips.total_birds_delivered), 0)::text AS delivered_birds,
       COALESCE(SUM(trips.total_delivered_weight), 0)::text AS delivered_weight,
       COALESCE(SUM(trips.total_mortality_count), 0)::text  AS mortality_count,
       COALESCE(SUM(trips.total_mortality_weight), 0)::text AS mortality_weight,
       COALESCE(SUM(trips.weight_loss), 0)::text   AS weight_loss
     FROM trips
     WHERE ${where.sql}`,
    where.params
  );

  const row = result.rows[0] ?? {};
  const farmBirds = num(row.farm_birds);
  const farmWeight = num(row.farm_weight);
  const deliveredWeight = num(row.delivered_weight);
  const mortalityCount = num(row.mortality_count);
  const mortalityWeight = num(row.mortality_weight);
  const weightLoss = num(row.weight_loss);

  return {
    totalTrips: num(row.total_trips),
    farmBirds,
    farmWeight: round3(farmWeight),
    deliveryShops: num(row.delivery_shops),
    deliveredBirds: num(row.delivered_birds),
    deliveredWeight: round3(deliveredWeight),
    mortalityCount,
    mortalityWeight: round3(mortalityWeight),
    // Weighted by the whole filtered set, not an average of per-trip rates —
    // an average of averages would over-weight tiny trips.
    mortalityPercentage: farmBirds > 0 ? round2((mortalityCount / farmBirds) * 100) : 0,
    weightLoss: round2(weightLoss),
    weightLossPercentage: farmWeight > 0 ? round2((weightLoss / farmWeight) * 100) : 0,
  };
}

/**
 * Dropdown options are drawn from every completed trip and deliberately ignore
 * the active filters, so a user who narrows to one farm can still switch to
 * another without resetting first.
 */
async function loadFilterOptions(): Promise<MortalityFilterOptions> {
  const result = await query<{ source_farm: string | null; supervisor_name: string | null }>(
    `SELECT DISTINCT source_farm, supervisor_name
     FROM trips
     WHERE ${BASE_WHERE}`,
    []
  );

  const farms = new Set<string>();
  const supervisors = new Set<string>();
  for (const row of result.rows) {
    const farm = str(row.source_farm).trim();
    const supervisor = str(row.supervisor_name).trim();
    if (farm) farms.add(farm);
    if (supervisor) supervisors.add(supervisor);
  }

  return {
    farms: Array.from(farms).sort((a, b) => a.localeCompare(b)),
    supervisors: Array.from(supervisors).sort((a, b) => a.localeCompare(b)),
  };
}

export const mortalityAnalysisService = {
  /**
   * One round trip for the whole screen: rows + KPIs + dropdown options.
   * The page size is capped at 100 by the zod schema.
   */
  async list(
    filters: MortalityAnalysisQuery,
    pagination: PaginationParams
  ): Promise<MortalityAnalysisResult> {
    const where = buildWhere(filters);

    // Whitelisted column name — user input never reaches the SQL text.
    const sortColumn = MORTALITY_SORT_COLUMNS[filters.sortBy];
    const sortDir = filters.sortDir === "asc" ? "ASC" : "DESC";

    const [countResult, rowsResult, kpis, filterOptions] = await Promise.all([
      query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM trips WHERE ${where.sql}`,
        where.params
      ),
      query<RowRecord>(
        `${ROW_SELECT}
         WHERE ${where.sql}
         ORDER BY ${sortColumn} ${sortDir} NULLS LAST, trips.id DESC
         LIMIT $${where.params.length + 1} OFFSET $${where.params.length + 2}`,
        [...where.params, pagination.limit, pagination.offset]
      ),
      loadKpis(where),
      loadFilterOptions(),
    ]);

    const total = num(countResult.rows[0]?.c, 0);
    const data = rowsResult.rows.map(toMortalityRow);

    return {
      data,
      meta: {
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.max(1, Math.ceil(total / pagination.limit)),
      },
      kpis,
      filterOptions,
    };
  },

  /**
   * Shop-level detail for ONE expanded row.
   *
   * Deliberately a separate, lazy call: the table itself only needs the shop
   * COUNT (already on `trips.total_shops`), so fetching names for every row
   * upfront would be wasted payload. Soft-deleted deliveries are excluded so
   * these lines can never disagree with the stored trip totals.
   */
  async deliveriesForTrip(tripId: number): Promise<
    Array<{
      id: number;
      serialNo: number | null;
      shopName: string;
      birdType: string;
      birds: number;
      weight: number;
      mortality: number;
      mortalityWeight: number;
      rate: number | null;
      amount: number;
      remarks: string;
    }>
  > {
    const result = await query<RowRecord>(
      `SELECT id, serial_no, shop_name, bird_type, birds, weight,
              mortality, mort_kg, rate, amount, remarks
       FROM trip_deliveries
       WHERE trip_id = $1 AND COALESCE(deleted, FALSE) = FALSE
       ORDER BY serial_no NULLS LAST, id`,
      [tripId]
    );

    return result.rows.map((row) => ({
      id: num(row.id),
      serialNo: num(row.serial_no) || null,
      shopName: str(row.shop_name),
      birdType: str(row.bird_type),
      birds: num(row.birds),
      weight: round3(row.weight),
      mortality: num(row.mortality),
      mortalityWeight: round3(row.mort_kg),
      rate: row.rate == null ? null : round2(row.rate),
      amount: round2(row.amount),
      remarks: str(row.remarks),
    }));
  },
};
