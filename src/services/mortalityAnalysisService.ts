/**
 * Completed-trip mortality / weight-loss analysis for dashboard Operational Trends
 * and the Mortality Analysis page.
 *
 * One row per completed trip. Every total is derived from the trip's ELIGIBLE
 * LOADS (submitted trip_legs, pickup_step_submitted = TRUE) plus eligible
 * deliveries (non-deleted, and either leg-less or on a submitted leg):
 *
 *   trip X = SUM(load X)            for every additive measure
 *   trip weightLoss = SUM(load weightLoss)   (per-load residual, then summed)
 *   trip percentages derive from the trip totals (never averaged)
 *
 * Load identity is the stable trip_legs.id; trip_legs.leg_index is the display
 * number. Leg-less (legacy) deliveries attach to Load 1 when the trip has a
 * single submitted leg, or form one synthetic Load 1 when the trip has no
 * usable legs at all. Nothing is ever split, averaged or double-counted.
 */
import { query } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { dateOnly, num } from "../utils/coerce.js";
import {
  paginatedResult,
  type PaginationParams,
} from "../utils/pagination.js";

export interface MortalityLoad {
  legId: number | null;
  load: number;
  farmName: string | null;
  farmBirds: number;
  farmWeight: number;
  deliveryShops: number;
  deliveredBirds: number;
  deliveredWeight: number;
  boxMortalityCount: number;
  boxMortalityWeight: number;
  weightModeMortalityCount: number;
  weightModeMortalityWeight: number;
  mortalityCount: number;
  mortalityWeight: number;
  weightLoss: number;
  mortalityPercentage: number;
  weightLossPercentage: number;
  survivalRate: number;
}

export interface MortalityAnalysisRow {
  tripId: number;
  tripNo: string;
  tripDate: string;
  vehicleNo: string | null;
  isRentedVehicle: boolean;
  supervisorName: string | null;
  sourceFarm: string | null;
  farmBirds: number;
  farmWeight: number;
  deliveredBirds: number;
  deliveredWeight: number;
  mortalityCount: number;
  mortalityWeight: number;
  boxMortalityCount: number;
  boxMortalityWeight: number;
  weightModeMortalityCount: number;
  weightModeMortalityWeight: number;
  weightLoss: number;
  driverName: string;
  loaders: string[];
  helpers: string[];
  status: string;
  deliveryShops: number;
  mortalityPercentage: number;
  weightLossPercentage: number;
  survivalRate: number;
  /** Per-load actuals in leg_index order. Exactly one entry for single-load
   *  and legacy trips — the frontend shows a tooltip only when length > 1. */
  loads: MortalityLoad[];
}

export interface MortalityAnalysisQuery {
  fromDate?: string;
  toDate?: string;
  farm?: string;
  supervisor?: string;
  search?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  pagination?: PaginationParams | null;
}

/**
 * Shared grain: one row per (trip, effective load) with canonical delivery
 * aggregates, the authoritative farm figures for that load, and the per-load
 * weight-loss residual. Trip totals below always SUM these rows, so the
 * invariant `trip weightLoss = SUM(load weightLoss)` holds by construction.
 *
 * Effective load = the delivery's own leg when it sits on a submitted leg,
 * otherwise Load 1 (or the trip's first submitted leg) as the documented
 * legacy fallback, or NULL when the trip has no usable legs at all (the
 * caller then renders one synthetic Load 1).
 */
const GRAIN_CTE = `
  usable_legs AS (
    SELECT l.trip_id, l.id AS leg_id, l.leg_index,
           COALESCE(NULLIF(TRIM(l.source_farm), ''), e.source_farm) AS farm_name,
           COALESCE(NULLIF(l.farm_bird_count, 0), l.total_birds, 0) AS leg_farm_birds,
           COALESCE(NULLIF(l.farm_load_weight, 0), l.dc_weight, 0) AS leg_farm_weight
      FROM trip_legs l
      JOIN eligible e ON e.id = l.trip_id
     WHERE l.pickup_step_submitted = TRUE
  ),
  leg1 AS (
    SELECT trip_id, leg_id AS leg1_id FROM usable_legs WHERE leg_index = 1
  ),
  first_leg AS (
    SELECT DISTINCT ON (trip_id) trip_id, leg_id AS first_leg_id
      FROM usable_legs ORDER BY trip_id, leg_index
  ),
  legsums AS (
    SELECT trip_id, COUNT(*)::int AS n,
           COALESCE(SUM(leg_farm_birds), 0)::float AS b,
           COALESCE(SUM(leg_farm_weight), 0)::float AS w
      FROM usable_legs GROUP BY trip_id
  ),
  grain AS (
    SELECT e.id AS trip_id,
           COALESCE(d.leg_id, l1.leg1_id, fl.first_leg_id) AS eff_leg_id,
           COALESCE(SUM(d.birds), 0)::float AS delivered_birds,
           COALESCE(SUM(d.weight), 0)::float AS delivered_weight,
           COALESCE(SUM(CASE WHEN COALESCE(d.delivery_mode, 'box') <> 'weight' THEN d.mortality ELSE 0 END), 0)::int AS box_mortality_count,
           COALESCE(SUM(CASE WHEN COALESCE(d.delivery_mode, 'box') <> 'weight' THEN COALESCE(d.mort_kg, 0) ELSE 0 END), 0)::float AS box_mortality_weight,
           COALESCE(SUM(CASE WHEN d.delivery_mode = 'weight' THEN d.mortality ELSE 0 END), 0)::int AS weight_mode_mortality_count,
           -- Canonical Weight-mode rule (matches computeTripKpis and Shop Ledger):
           -- Weight mode records mortality as birds only, so it never contributes mortality kg.
           0::float AS weight_mode_mortality_weight,
           COUNT(DISTINCT d.shop_id)::int AS delivery_shops
      FROM eligible e
      JOIN trip_deliveries d ON d.trip_id = e.id AND COALESCE(d.deleted, FALSE) = FALSE
      LEFT JOIN trip_legs tl ON tl.id = d.leg_id
      LEFT JOIN leg1 l1 ON l1.trip_id = e.id
      LEFT JOIN first_leg fl ON fl.trip_id = e.id
     WHERE (d.leg_id IS NULL OR tl.id IS NULL OR tl.pickup_step_submitted = TRUE)
     GROUP BY e.id, COALESCE(d.leg_id, l1.leg1_id, fl.first_leg_id)
  ),
  grainsums AS (
    SELECT trip_id,
           COALESCE(SUM(delivered_birds), 0)::float AS delivered_birds,
           COALESCE(SUM(delivered_weight), 0)::float AS delivered_weight,
           COALESCE(SUM(box_mortality_count), 0)::int AS box_mortality_count,
           COALESCE(SUM(box_mortality_weight), 0)::float AS box_mortality_weight,
           COALESCE(SUM(weight_mode_mortality_count), 0)::int AS weight_mode_mortality_count,
           0::float AS weight_mode_mortality_weight
      FROM grain GROUP BY trip_id
  ),
  grain_loss AS (
    SELECT g.trip_id,
           COALESCE(SUM(
             GREATEST(0,
               CASE WHEN ul.leg_id IS NULL THEN e.parent_farm_weight
                    WHEN COALESCE(ls.n, 0) = 1 AND COALESCE(ul.leg_farm_birds, 0) = 0 AND COALESCE(ul.leg_farm_weight, 0) = 0 THEN e.parent_farm_weight
                    ELSE COALESCE(ul.leg_farm_weight, 0) END
               - g.delivered_weight
               - (g.box_mortality_weight + g.weight_mode_mortality_weight))
           ), 0)::float AS weight_loss
      FROM grain g
      JOIN eligible e ON e.id = g.trip_id
      LEFT JOIN usable_legs ul ON ul.leg_id = g.eff_leg_id
      LEFT JOIN legsums ls ON ls.trip_id = g.trip_id
     GROUP BY g.trip_id
  ),
  trip_shops AS (
    SELECT e.id AS trip_id, COUNT(DISTINCT d.shop_id)::int AS n
      FROM eligible e
      JOIN trip_deliveries d ON d.trip_id = e.id AND COALESCE(d.deleted, FALSE) = FALSE
      LEFT JOIN trip_legs tl ON tl.id = d.leg_id
     WHERE (d.leg_id IS NULL OR tl.id IS NULL OR tl.pickup_step_submitted = TRUE)
     GROUP BY e.id
  ),
  trip_calc AS (
    SELECT e.id, e.trip_no, e.trip_date, e.vehicle_no, e.driver_name, e.supervisor_name,
           e.source_farm, e.is_rented_vehicle,
           CASE WHEN COALESCE(ls.n, 0) = 0 THEN e.parent_farm_birds
                WHEN ls.n = 1 AND COALESCE(ls.b, 0) = 0 AND COALESCE(ls.w, 0) = 0 THEN e.parent_farm_birds
                ELSE COALESCE(ls.b, 0) END AS farm_birds,
           CASE WHEN COALESCE(ls.n, 0) = 0 THEN e.parent_farm_weight
                WHEN ls.n = 1 AND COALESCE(ls.b, 0) = 0 AND COALESCE(ls.w, 0) = 0 THEN e.parent_farm_weight
                ELSE COALESCE(ls.w, 0) END AS farm_weight,
           COALESCE(gs.delivered_birds, 0) AS delivered_birds,
           COALESCE(gs.delivered_weight, 0) AS delivered_weight,
           COALESCE(gs.box_mortality_count, 0) AS box_mortality_count,
           COALESCE(gs.box_mortality_weight, 0) AS box_mortality_weight,
           COALESCE(gs.weight_mode_mortality_count, 0) AS weight_mode_mortality_count,
           COALESCE(gs.weight_mode_mortality_weight, 0) AS weight_mode_mortality_weight,
           COALESCE(gl.weight_loss, 0) AS weight_loss,
           COALESCE(ts.n, 0) AS delivery_shops
      FROM eligible e
      LEFT JOIN legsums ls ON ls.trip_id = e.id
      LEFT JOIN grainsums gs ON gs.trip_id = e.id
      LEFT JOIN grain_loss gl ON gl.trip_id = e.id
      LEFT JOIN trip_shops ts ON ts.trip_id = e.id
  )`;

const SORT_COLUMNS: Record<string, string> = {
  tripDate: "trip_date",
  tripNo: "trip_no",
  farmBirds: "farm_birds",
  farmWeight: "farm_weight",
  weightLoss: "weight_loss",
  mortalityCount: "(box_mortality_count + weight_mode_mortality_count)",
  sourceFarm: "source_farm",
  supervisorName: "supervisor_name",
  deliveryShops: "delivery_shops",
  deliveredBirds: "delivered_birds",
  deliveredWeight: "delivered_weight",
  mortalityWeight: "(box_mortality_weight + weight_mode_mortality_weight)",
  mortalityPercentage:
    "CASE WHEN farm_birds > 0 THEN ((box_mortality_count + weight_mode_mortality_count) * 100.0 / farm_birds) ELSE 0 END",
  weightLossPercentage:
    "CASE WHEN farm_weight > 0 THEN (weight_loss * 100.0 / farm_weight) ELSE 0 END",
  survivalRate:
    "CASE WHEN farm_birds > 0 THEN ((farm_birds - (box_mortality_count + weight_mode_mortality_count)) / farm_birds) ELSE 0 END",
};

interface EligibleParams {
  clauses: string[];
  params: unknown[];
}

function baseClauses(): EligibleParams {
  return {
    clauses: [
      `COALESCE(t.deleted, FALSE) = FALSE`,
      `t.status = 'Completed'`,
      `t.expenses_step_submitted = TRUE`,
    ],
    params: [],
  };
}

function applyFilters(
  base: EligibleParams,
  filters: MortalityAnalysisQuery,
  opts: { includeFarm: boolean }
): void {
  const { clauses, params } = base;
  if (filters.fromDate) {
    params.push(filters.fromDate);
    clauses.push(`t.trip_date >= $${params.length}::date`);
  }
  if (filters.toDate) {
    params.push(filters.toDate);
    clauses.push(`t.trip_date <= $${params.length}::date`);
  }
  if (opts.includeFarm && filters.farm) {
    params.push(filters.farm);
    const idx = params.length;
    clauses.push(
      `(t.source_farm = $${idx} OR EXISTS (SELECT 1 FROM trip_legs l WHERE l.trip_id = t.id AND l.pickup_step_submitted = TRUE AND NULLIF(TRIM(l.source_farm), '') = $${idx}))`
    );
  }
  if (filters.supervisor) {
    params.push(filters.supervisor);
    clauses.push(`t.supervisor_name = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    const idx = params.length;
    clauses.push(
      `(t.trip_no ILIKE $${idx} OR t.vehicle_no ILIKE $${idx} OR t.driver_name ILIKE $${idx} OR EXISTS (SELECT 1 FROM trip_legs l WHERE l.trip_id = t.id AND l.pickup_step_submitted = TRUE AND l.source_farm ILIKE $${idx}))`
    );
  }
}

function eligibleCte(base: EligibleParams): string {
  return `eligible AS (
    SELECT t.id, t.trip_no, t.trip_date, t.vehicle_no, t.driver_name, t.supervisor_name,
           t.source_farm, t.is_rented_vehicle,
           COALESCE(NULLIF(t.farm_bird_count, 0), t.total_birds, 0) AS parent_farm_birds,
           COALESCE(NULLIF(t.farm_load_weight, 0), t.dc_weight, 0) AS parent_farm_weight
      FROM trips t
     WHERE ${base.clauses.join(" AND ")}
  )`;
}

function loadPercents(load: {
  farmBirds: number;
  farmWeight: number;
  mortalityCount: number;
  weightLoss: number;
}): { mortalityPercentage: number; weightLossPercentage: number; survivalRate: number } {
  const { farmBirds, farmWeight, mortalityCount, weightLoss } = load;
  return {
    mortalityPercentage:
      farmBirds > 0 ? Number(((mortalityCount / farmBirds) * 100).toFixed(2)) : 0,
    weightLossPercentage:
      farmWeight > 0 ? Number(((weightLoss / farmWeight) * 100).toFixed(2)) : 0,
    survivalRate: farmBirds > 0 ? Math.max(0, (farmBirds - mortalityCount) / farmBirds) : 0,
  };
}

function mapRow(
  row: Record<string, unknown>,
  loadsByTrip: Map<number, MortalityLoad[]>
): MortalityAnalysisRow {
  const farmBirds = num(row.farm_birds);
  const farmWeight = num(row.farm_weight);
  const boxMortalityCount = num(row.box_mortality_count);
  const weightModeMortalityCount = num(row.weight_mode_mortality_count);
  const mortalityCount = boxMortalityCount + weightModeMortalityCount;
  const boxMortalityWeight = num(row.box_mortality_weight);
  const weightModeMortalityWeight = num(row.weight_mode_mortality_weight);
  const mortalityWeight = boxMortalityWeight + weightModeMortalityWeight;
  const weightLoss = num(row.weight_loss);
  const tripId = num(row.id);
  return {
    tripId,
    tripNo: String(row.trip_no ?? ""),
    tripDate: dateOnly(row.trip_date) ?? "",
    vehicleNo: row.vehicle_no == null ? null : String(row.vehicle_no),
    isRentedVehicle: Boolean(row.is_rented_vehicle),
    supervisorName: row.supervisor_name == null ? null : String(row.supervisor_name),
    sourceFarm: row.source_farm == null ? null : String(row.source_farm),
    farmBirds,
    farmWeight,
    deliveredBirds: num(row.delivered_birds),
    deliveredWeight: num(row.delivered_weight),
    mortalityCount,
    mortalityWeight,
    boxMortalityCount,
    boxMortalityWeight,
    weightModeMortalityCount,
    weightModeMortalityWeight,
    weightLoss,
    driverName: String(row.driver_name ?? ""),
    loaders: Array.isArray(row.loaders) ? row.loaders.map(String) : [],
    helpers: Array.isArray(row.helpers) ? row.helpers.map(String) : [],
    status: "Completed",
    deliveryShops: num(row.delivery_shops),
    ...loadPercents({ farmBirds, farmWeight, mortalityCount, weightLoss }),
    loads: loadsByTrip.get(tripId) ?? [],
  };
}

interface GrainLoadRow {
  trip_id: string | number;
  leg_id: string | number | null;
  load: string | number | null;
  farm_name: string | null;
  leg_farm_birds: string | number | null;
  leg_farm_weight: string | number | null;
  delivered_birds: string | number | null;
  delivered_weight: string | number | null;
  box_mortality_count: string | number | null;
  box_mortality_weight: string | number | null;
  weight_mode_mortality_count: string | number | null;
  weight_mode_mortality_weight: string | number | null;
  delivery_shops: string | number | null;
}

function toLoad(
  input: {
    legId: number | null;
    load: number;
    farmName: string | null;
    farmBirds: number;
    farmWeight: number;
    deliveryShops: number;
    deliveredBirds: number;
    deliveredWeight: number;
    boxMortalityCount: number;
    boxMortalityWeight: number;
    weightModeMortalityCount: number;
    weightModeMortalityWeight: number;
  }
): MortalityLoad {
  const mortalityCount = input.boxMortalityCount + input.weightModeMortalityCount;
  const mortalityWeight = input.boxMortalityWeight + input.weightModeMortalityWeight;
  const weightLoss = Math.max(0, input.farmWeight - input.deliveredWeight - mortalityWeight);
  return {
    ...input,
    mortalityCount,
    mortalityWeight,
    weightLoss,
    ...loadPercents({
      farmBirds: input.farmBirds,
      farmWeight: input.farmWeight,
      mortalityCount,
      weightLoss,
    }),
  };
}

/**
 * Assemble per-trip loads from one bounded loads query. `parents` carries the
 * trip-level parent farm figures for the single-load fallback. NULL-eff grain
 * (legacy deliveries with no Load 1) merges into the lowest load so trip
 * totals never leak out of the breakdown.
 */
function assembleLoads(
  tripId: number,
  parent: { sourceFarm: string | null; farmBirds: number; farmWeight: number },
  rows: GrainLoadRow[]
): MortalityLoad[] {
  void tripId;
  const legRows = rows
    .filter((row) => row.leg_id != null)
    .sort((a, b) => num(a.load, 1) - num(b.load, 1));
  const nullRows = rows.filter((row) => row.leg_id == null);

  const mergeNullInto = (
    target: GrainLoadRow & { [key: string]: unknown }
  ): void => {
    for (const source of nullRows) {
      for (const key of [
        "delivered_birds",
        "delivered_weight",
        "box_mortality_count",
        "box_mortality_weight",
        "weight_mode_mortality_count",
        "weight_mode_mortality_weight",
      ] as const) {
        target[key] = num(target[key]) + num(source[key]);
      }
      target.delivery_shops = Math.max(num(target.delivery_shops), num(source.delivery_shops));
    }
  };

  if (legRows.length === 0) {
    // The loads query LEFT JOINs the leg shells, so a leg-less trip yields a
    // zeroed shell row alongside the real NULL-eff grain row. The grain row
    // (the one carrying delivery volume) wins; pure shells contribute zeros.
    const volume = (row: GrainLoadRow): number =>
      num(row.delivered_birds) +
      num(row.delivered_weight) +
      num(row.box_mortality_count) +
      num(row.box_mortality_weight) +
      num(row.weight_mode_mortality_count) +
      num(row.weight_mode_mortality_weight);
    const grain = nullRows.reduce<GrainLoadRow | undefined>(
      (best, row) => (!best || volume(row) > volume(best) ? row : best),
      undefined
    );
    return [
      toLoad({
        legId: null,
        load: 1,
        farmName: parent.sourceFarm,
        farmBirds: parent.farmBirds,
        farmWeight: parent.farmWeight,
        deliveryShops: num(grain?.delivery_shops),
        deliveredBirds: num(grain?.delivered_birds),
        deliveredWeight: num(grain?.delivered_weight),
        boxMortalityCount: num(grain?.box_mortality_count),
        boxMortalityWeight: num(grain?.box_mortality_weight),
        weightModeMortalityCount: num(grain?.weight_mode_mortality_count),
        weightModeMortalityWeight: num(grain?.weight_mode_mortality_weight),
      }),
    ];
  }

  if (nullRows.length > 0) {
    const first = legRows.reduce((best, row) =>
      num(row.load, 1) < num(best.load, 1) ? row : best
    );
    mergeNullInto(first as GrainLoadRow & { [key: string]: unknown });
  }

  const singleFallback =
    legRows.length === 1 &&
    num(legRows[0].leg_farm_birds) === 0 &&
    num(legRows[0].leg_farm_weight) === 0;

  return legRows.map((row) =>
    toLoad({
      legId: num(row.leg_id),
      load: Math.max(1, num(row.load, 1)),
      farmName:
        row.farm_name == null || String(row.farm_name).trim() === ""
          ? parent.sourceFarm
          : String(row.farm_name),
      farmBirds: singleFallback ? parent.farmBirds : num(row.leg_farm_birds),
      farmWeight: singleFallback ? parent.farmWeight : num(row.leg_farm_weight),
      deliveryShops: num(row.delivery_shops),
      deliveredBirds: num(row.delivered_birds),
      deliveredWeight: num(row.delivered_weight),
      boxMortalityCount: num(row.box_mortality_count),
      boxMortalityWeight: num(row.box_mortality_weight),
      weightModeMortalityCount: num(row.weight_mode_mortality_count),
      weightModeMortalityWeight: num(row.weight_mode_mortality_weight),
    })
  );
}

/** One bounded query returning every per-load grain row for the page's trips. */
async function fetchLoads(
  base: EligibleParams,
  tripIds: number[],
  parents: Map<number, { sourceFarm: string | null; farmBirds: number; farmWeight: number }>
): Promise<Map<number, MortalityLoad[]>> {
  const out = new Map<number, MortalityLoad[]>();
  if (tripIds.length === 0) return out;
  const params: unknown[] = [...base.params, tripIds];
  const idParam = params.length;
  const result = await query<GrainLoadRow>(
    `WITH ${eligibleCte(base)}, ${GRAIN_CTE},
    page_trips AS (SELECT * FROM eligible WHERE id = ANY($${idParam}::int[]))
    SELECT e.id AS trip_id, ul.leg_id, ul.leg_index AS load, ul.farm_name,
           ul.leg_farm_birds, ul.leg_farm_weight,
           COALESCE(g.delivered_birds, 0) AS delivered_birds,
           COALESCE(g.delivered_weight, 0) AS delivered_weight,
           COALESCE(g.box_mortality_count, 0) AS box_mortality_count,
           COALESCE(g.box_mortality_weight, 0) AS box_mortality_weight,
           COALESCE(g.weight_mode_mortality_count, 0) AS weight_mode_mortality_count,
           COALESCE(g.weight_mode_mortality_weight, 0) AS weight_mode_mortality_weight,
           COALESCE(g.delivery_shops, 0) AS delivery_shops
      FROM page_trips e
      LEFT JOIN usable_legs ul ON ul.trip_id = e.id
      LEFT JOIN grain g ON g.trip_id = e.id AND g.eff_leg_id = ul.leg_id
    UNION ALL
    SELECT e.id AS trip_id, NULL::int AS leg_id, NULL::int AS load, e.source_farm AS farm_name,
           e.parent_farm_birds AS leg_farm_birds, e.parent_farm_weight AS leg_farm_weight,
           g.delivered_birds, g.delivered_weight,
           g.box_mortality_count, g.box_mortality_weight,
           g.weight_mode_mortality_count, g.weight_mode_mortality_weight,
           g.delivery_shops
      FROM page_trips e
      JOIN grain g ON g.trip_id = e.id AND g.eff_leg_id IS NULL
     ORDER BY trip_id, load NULLS LAST`,
    params
  );
  const byTrip = new Map<number, GrainLoadRow[]>();
  for (const row of result.rows) {
    const id = num(row.trip_id);
    const list = byTrip.get(id) ?? [];
    list.push(row);
    byTrip.set(id, list);
  }
  for (const [id, rows] of byTrip) {
    const parent = parents.get(id) ?? { sourceFarm: null, farmBirds: 0, farmWeight: 0 };
    out.set(id, assembleLoads(id, parent, rows));
  }
  // Trips with usable legs but zero deliveries (or no grain at all) still
  // need their load shells so Load 2 never silently disappears.
  for (const id of tripIds) {
    if (!out.has(id)) {
      const parent = parents.get(id) ?? { sourceFarm: null, farmBirds: 0, farmWeight: 0 };
      out.set(id, assembleLoads(id, parent, []));
    }
  }
  return out;
}

export const mortalityAnalysisService = {
  async deliveries(tripId: number) {
    if (!Number.isInteger(tripId) || tripId <= 0) {
      throw new AppError(400, "Invalid trip id");
    }
    const result = await query(
      `SELECT id, serial_no, shop_name, bird_type, birds, weight, mortality, mort_kg, rate, amount, remarks
         FROM trip_deliveries
        WHERE trip_id = $1 AND COALESCE(deleted, FALSE) = FALSE
        ORDER BY serial_no NULLS LAST, id`,
      [tripId]
    );
    return result.rows.map((row) => ({
      id: num(row.id), serialNo: row.serial_no == null ? null : num(row.serial_no),
      shopName: String(row.shop_name ?? ""), birdType: String(row.bird_type ?? ""),
      birds: num(row.birds), weight: num(row.weight), mortality: num(row.mortality),
      mortalityWeight: num(row.mort_kg), rate: row.rate == null ? null : num(row.rate),
      amount: num(row.amount), remarks: String(row.remarks ?? ""),
    }));
  },

  async list(filters: MortalityAnalysisQuery = {}) {
    const base = baseClauses();
    applyFilters(base, filters, { includeFarm: true });

    const sortCol = SORT_COLUMNS[filters.sortBy ?? "tripDate"] ?? SORT_COLUMNS.tripDate;
    const sortDir = filters.sortDir === "desc" ? "DESC" : "ASC";

    const kpiResult = await query(
      `WITH ${eligibleCte(base)}, ${GRAIN_CTE}
       SELECT COUNT(*)::int AS total_trips,
              COALESCE(SUM(farm_birds), 0)::float AS farm_birds,
              COALESCE(SUM(delivered_birds), 0)::float AS delivered_birds,
              COALESCE(SUM(box_mortality_count + weight_mode_mortality_count), 0)::float AS mortality_count,
              COALESCE(SUM(farm_weight), 0)::float AS farm_weight,
              COALESCE(SUM(delivered_weight), 0)::float AS delivered_weight,
              COALESCE(SUM(box_mortality_weight + weight_mode_mortality_weight), 0)::float AS mortality_weight,
              COALESCE(SUM(weight_loss), 0)::float AS weight_loss,
              COALESCE(SUM(delivery_shops), 0)::int AS delivery_shops
         FROM trip_calc`,
      base.params
    );
    const kpi = kpiResult.rows[0] ?? {};
    const kpis = {
      totalTrips: num(kpi.total_trips),
      farmBirds: num(kpi.farm_birds),
      deliveredBirds: num(kpi.delivered_birds),
      mortalityCount: num(kpi.mortality_count),
      farmWeight: num(kpi.farm_weight),
      deliveredWeight: num(kpi.delivered_weight),
      mortalityWeight: num(kpi.mortality_weight),
      weightLoss: num(kpi.weight_loss),
      deliveryShops: num(kpi.delivery_shops),
      mortalityPercentage: num(kpi.farm_birds) > 0 ? Number(((num(kpi.mortality_count) / num(kpi.farm_birds)) * 100).toFixed(2)) : 0,
      weightLossPercentage: num(kpi.farm_weight) > 0 ? Number(((num(kpi.weight_loss) / num(kpi.farm_weight)) * 100).toFixed(2)) : 0,
    };

    const optionRows = await query(
      `SELECT DISTINCT farm FROM (
         SELECT t.source_farm AS farm
           FROM trips t
          WHERE COALESCE(t.deleted, FALSE) = FALSE AND t.status = 'Completed' AND t.expenses_step_submitted = TRUE
         UNION
         SELECT NULLIF(TRIM(l.source_farm), '') AS farm
           FROM trip_legs l
           JOIN trips t ON t.id = l.trip_id
          WHERE COALESCE(t.deleted, FALSE) = FALSE AND t.status = 'Completed' AND t.expenses_step_submitted = TRUE
            AND l.pickup_step_submitted = TRUE
       ) farms WHERE farm IS NOT NULL AND farm <> '' ORDER BY farm`
    );
    const supervisorRows = await query(
      `SELECT DISTINCT supervisor_name FROM trips WHERE COALESCE(deleted,FALSE)=FALSE AND status='Completed' AND expenses_step_submitted=TRUE`
    );
    const filterOptions = {
      farms: optionRows.rows.map((row) => String(row.farm ?? "")).filter(Boolean),
      supervisors: [...new Set(supervisorRows.rows.map((row) => String(row.supervisor_name ?? "")).filter(Boolean))].sort(),
    };

    const selectSql = `
      SELECT
        t.id, t.trip_no, t.trip_date, t.vehicle_no, t.driver_name, t.supervisor_name, t.source_farm,
        t.is_rented_vehicle, t.farm_birds, t.farm_weight,
        t.delivered_birds, t.delivered_weight,
        t.box_mortality_count, t.box_mortality_weight,
        t.weight_mode_mortality_count, t.weight_mode_mortality_weight,
        t.weight_loss, t.delivery_shops,
        (SELECT COALESCE(ARRAY_AGG(tc.employee_name ORDER BY tc.id) FILTER (WHERE tc.role='loader'), ARRAY[]::text[]) FROM trip_crew tc WHERE tc.trip_id=t.id) AS loaders,
        (SELECT COALESCE(ARRAY_AGG(tc.employee_name ORDER BY tc.id) FILTER (WHERE tc.role='helper'), ARRAY[]::text[]) FROM trip_crew tc WHERE tc.trip_id=t.id) AS helpers
      FROM (WITH ${eligibleCte(base)}, ${GRAIN_CTE} SELECT * FROM trip_calc) t
      ORDER BY ${sortCol} ${sortDir}, t.id ASC`;

    const attachLoads = async (rows: Record<string, unknown>[]) => {
      const ids = rows.map((row) => num(row.id));
      const parents = new Map(
        rows.map((row) => [
          num(row.id),
          {
            sourceFarm: row.source_farm == null ? null : String(row.source_farm),
            farmBirds: num(row.farm_birds),
            farmWeight: num(row.farm_weight),
          },
        ])
      );
      const loadsByTrip = await fetchLoads(base, ids, parents);
      return rows.map((row) => mapRow(row, loadsByTrip));
    };

    if (!filters.pagination) {
      const all = await query(selectSql, base.params);
      const data = await attachLoads(all.rows);
      return {
        data,
        meta: {
          total: kpis.totalTrips,
          page: 1,
          limit: data.length || 1,
          totalPages: 1,
        },
        kpis,
        filterOptions,
      };
    }

    const countResult = await query(
      `WITH ${eligibleCte(base)} SELECT COUNT(*)::int AS c FROM eligible`,
      base.params
    );
    const total = num(countResult.rows[0]?.c);
    const pageParams = filters.pagination;
    const pageSql = `${selectSql} LIMIT ${pageParams.limit} OFFSET ${pageParams.offset}`;
    const pageRows = await query(pageSql, base.params);
    const page = paginatedResult(await attachLoads(pageRows.rows), total, pageParams);

    return { ...page, kpis, filterOptions };
  },
};
