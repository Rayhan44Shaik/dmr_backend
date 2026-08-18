import { query } from "../config/db.js";
import { assertVehicleExists } from "../utils/fkValidation.js";
import { num, str } from "../utils/coerce.js";
import type { AnalyticsQuery } from "../validation/analytics.js";
import type {
  AnalyticsCostCenter,
  AnalyticsHighestExpense,
  AnalyticsKpis,
  AnalyticsTopPerformer,
  AnalyticsVehicleStat,
  AnalyticsWeeklyPoint,
  FleetAnalyticsResponse,
} from "../types/analytics.js";

/**
 * Fleet Analytics — a READ-ONLY aggregation layer over the existing
 * authoritative Fleet sources (trips, fuel_expenses, fleet_maintenance,
 * vehicle_emis, vehicles). Nothing is written; every figure is computed inside
 * PostgreSQL. The browser must render exactly what this endpoint returns.
 *
 * Cost-centre separation guarantees every rupee appears exactly once:
 * fuel <> other, trip tolls <> other, maintenance counted once, EMI counted
 * once, no duplicate trip-generated fuel.
 *
 * Business rules (kept identical to the verified Analytics page):
 *  - Distance/Trips→ completed, non-deleted trips (trip_date business date).
 *  - Fuel       → non-deleted fuel_expenses (bill date). Eligibility follows
 *                 the AUTHORITATIVE Fuel list endpoint exactly:
 *                 `(source_type <> 'TRIP' OR ops_status = 'Approved')`.
 *                 Trip-origin fuel is approved automatically on trip completion,
 *                 so this is the same posted/eligible gate the Fuel page shows.
 *  - Maintenance→ fleet_maintenance with status = 'Approved', not deleted.
 *  - Toll       → trip pickup + delivery + destination tolls (the authoritative
 *                 FASTag ledger is browser-local, so it is NOT double-counted
 *                 here and no fake expense source is invented).
 *  - Other      → the non-diesel, non-toll trip cash items (driver bata, meals,
 *                 meals/tiffin, loading, on-road maintenance, others1–5, RC).
 *  - EMI        → non-paid EMI records (status <> 'paid'; the data model only
 *                 has active/paid/overdue, so this selects active + overdue)
 *                 whose next_emi_date falls inside the report window (or is
 *                 NULL). Sum of emi_amount. This is the exact rule the legacy
 *                 page applied (`status !== 'paid' && nextEmiDate in range`).
 */

const completedTripsCte = `completed_trips AS (
  SELECT
    t.id,
    t.vehicle_id,
    t.trip_date,
    COALESCE(t.total_km, 0) AS total_km,
    COALESCE(t.pickup_tolls, 0) + COALESCE(t.delivery_tolls, 0) + COALESCE(t.destination_tolls, 0) AS toll_expense,
    COALESCE(t.driver_bata, 0) + COALESCE(t.meals, 0) + COALESCE(t.meals_tiffin, 0)
      + COALESCE(t.loading, 0) + COALESCE(t.vehicle_maintenance, 0) + COALESCE(t.others_rc, 0)
      + COALESCE(t.others1_amt, 0) + COALESCE(t.others2_amt, 0) + COALESCE(t.others3_amt, 0)
      + COALESCE(t.others4_amt, 0) + COALESCE(t.others5_amt, 0) AS other_expense
  FROM trips t
  WHERE t.status = 'Completed'
    AND COALESCE(t.deleted, FALSE) = FALSE
    AND t.trip_date BETWEEN $1::date AND $2::date
    AND ($3::int IS NULL OR t.vehicle_id = $3::int)
)`;

/**
 * Fuel eligibility mirrors fuelExpensesService.buildFuelWhere() exactly, so
 * Analytics can never disagree with the Fuel page about what is posted/eligible.
 */
const filteredFuelCte = `filtered_fuel AS (
  SELECT
    fe.vehicle_id,
    fe.expense_date,
    COALESCE(fe.litres, 0) AS litres,
    COALESCE(fe.amount, 0) AS amount
  FROM fuel_expenses fe
  WHERE COALESCE(fe.deleted, FALSE) = FALSE
    AND (fe.source_type <> 'TRIP' OR fe.ops_status = 'Approved'::ops_record_status)
    AND fe.expense_date BETWEEN $1::date AND $2::date
    AND ($3::int IS NULL OR fe.vehicle_id = $3::int)
)`;

const filteredMaintCte = `filtered_maint AS (
  SELECT
    fm.vehicle_id,
    COALESCE(fm.total_cost, 0) AS total_cost
  FROM fleet_maintenance fm
  WHERE fm.status = 'Approved'
    AND COALESCE(fm.deleted, FALSE) = FALSE
    AND fm.maintenance_date BETWEEN $1::date AND $2::date
    AND ($3::int IS NULL OR fm.vehicle_id = $3::int)
)`;

const emiCte = `emi AS (
  SELECT
    ve.vehicle_id,
    COALESCE(ve.emi_amount, 0) AS emi_amount
  FROM vehicle_emis ve
  WHERE ve.status <> 'paid'
    AND (ve.next_emi_date IS NULL OR ve.next_emi_date BETWEEN $1::date AND $2::date)
    AND ($3::int IS NULL OR ve.vehicle_id = $3::int)
)`;

/** Compose a WITH clause from the shared filter CTEs plus an optional lead CTE. */
function ctes(lead: string): string {
  const parts = [
    lead,
    completedTripsCte,
    filteredFuelCte,
    filteredMaintCte,
    emiCte,
  ].filter((s) => s.trim() !== "");
  return `WITH ${parts.join(",\n")}`;
}

const KPI_SQL = `
${ctes("")}
SELECT
  COALESCE((SELECT COUNT(*) FROM completed_trips t), 0) AS total_trips,
  COALESCE((SELECT SUM(t.total_km) FROM completed_trips t), 0) AS total_distance,
  COALESCE((SELECT SUM(f.litres) FROM filtered_fuel f), 0) AS fuel_litres,
  COALESCE((SELECT SUM(f.amount) FROM filtered_fuel f), 0) AS fuel_cost,
  COALESCE((SELECT SUM(m.total_cost) FROM filtered_maint m), 0) AS maint_cost,
  COALESCE((SELECT SUM(e.emi_amount) FROM emi e), 0) AS emi_cost,
  COALESCE((SELECT SUM(t.toll_expense) FROM completed_trips t), 0) AS toll_cost,
  COALESCE((SELECT SUM(t.other_expense) FROM completed_trips t), 0) AS other_cost`;

/**
 * Weekly buckets replicate the page's exact convention:
 *  - each week starts Sunday (date-fns eachWeekOfInterval default weekStartsOn=0),
 *  - label = "W" + ISO week number of the bucket's Sunday (date-fns getWeek
 *    default options == ISO week == Postgres EXTRACT(WEEK)),
 *  - records are bucketed by their business date into [sunday, sunday+7),
 *    bounded by the caller's date range (records outside it were filtered out
 *    in the CTEs before bucketing).
 */
const WEEKLY_SQL = `
${ctes(`week_series AS (
  SELECT (s.sunday_from + (n - 1) * 7)::date AS week_start,
         'W' || EXTRACT(WEEK FROM (s.sunday_from + (n - 1) * 7)::date)::int AS week
  FROM generate_series(1, $4::int) AS n
  CROSS JOIN (SELECT ($1::date - EXTRACT(DOW FROM $1::date)::int)::date AS sunday_from) s
)`)}
SELECT
  ws.week,
  COALESCE((SELECT SUM(t.total_km) FROM completed_trips t
             WHERE t.trip_date >= ws.week_start AND t.trip_date < ws.week_start + 7), 0) AS distance,
  COALESCE((SELECT SUM(f.litres) FROM filtered_fuel f
             WHERE f.expense_date >= ws.week_start AND f.expense_date < ws.week_start + 7), 0) AS litres
FROM week_series ws
ORDER BY ws.week_start`;

/**
 * One per-vehicle aggregation pass over the shared CTEs. Top performers and
 * highest-expense are derived from this in JS with deterministic tie-breaks, so
 * the same numbers feed KPIs, the tables and the vehicle-level statistics.
 */
const VEHICLE_STATS_SQL = `
${ctes("")}
SELECT
  v.id AS vehicle_id,
  v.vehicle_number AS vehicle_number,
  COALESCE(d.trips, 0) AS trips,
  COALESCE(d.total_km, 0) AS distance,
  COALESCE(f.litres, 0) AS fuel_litres,
  COALESCE(f.fuel_cost, 0) AS fuel_cost,
  COALESCE(m.maint_cost, 0) AS maint_cost,
  COALESCE(e.emi_cost, 0) AS emi_cost,
  COALESCE(t.toll_cost, 0) AS toll_cost,
  COALESCE(t.other_cost, 0) AS other_cost
FROM vehicles v
LEFT JOIN (
  SELECT vehicle_id, COUNT(*) AS trips, SUM(total_km) AS total_km
  FROM completed_trips
  GROUP BY vehicle_id
) d ON d.vehicle_id = v.id
LEFT JOIN (
  SELECT vehicle_id, SUM(litres) AS litres, SUM(amount) AS fuel_cost
  FROM filtered_fuel
  GROUP BY vehicle_id
) f ON f.vehicle_id = v.id
LEFT JOIN (
  SELECT vehicle_id, SUM(total_cost) AS maint_cost
  FROM filtered_maint
  GROUP BY vehicle_id
) m ON m.vehicle_id = v.id
LEFT JOIN (
  SELECT vehicle_id, SUM(emi_amount) AS emi_cost
  FROM emi
  GROUP BY vehicle_id
) e ON e.vehicle_id = v.id
LEFT JOIN (
  SELECT vehicle_id, SUM(toll_expense) AS toll_cost, SUM(other_expense) AS other_cost
  FROM completed_trips
  GROUP BY vehicle_id
) t ON t.vehicle_id = v.id
WHERE ($3::int IS NULL OR v.id = $3::int)
ORDER BY v.vehicle_number ASC`;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return round2((part / total) * 100);
}

/** Number of Sunday-started weeks date-fns eachWeekOfInterval would emit. */
function weekCount(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T00:00:00Z`);
  const to = new Date(`${toDate}T00:00:00Z`);
  const sundayFrom = new Date(from);
  sundayFrom.setUTCDate(from.getUTCDate() - from.getUTCDay());
  const saturdayTo = new Date(to);
  saturdayTo.setUTCDate(to.getUTCDate() + (6 - to.getUTCDay()));
  const days = Math.round((saturdayTo.getTime() - sundayFrom.getTime()) / 86_400_000);
  return Math.floor(days / 7) + 1;
}

export const analyticsService = {
  /** Aggregate fleet analytics for a date range (and optional vehicle). Read-only. */
  async get(analyticQuery: AnalyticsQuery): Promise<FleetAnalyticsResponse> {
    const { fromDate, toDate, vehicleId } = analyticQuery;

    if (vehicleId != null) {
      await assertVehicleExists(vehicleId);
    }

    const params: unknown[] = [fromDate, toDate, vehicleId];

    // ---- KPIs ----------------------------------------------------------
    const kpiResult = await query<Record<string, unknown>>(KPI_SQL, params);
    const kpiRow = kpiResult.rows[0] ?? {};
    const totalTrips = num(kpiRow.total_trips);
    const fuelCost = num(kpiRow.fuel_cost);
    const maintenanceCost = num(kpiRow.maint_cost);
    const emiDue = num(kpiRow.emi_cost);
    const tollCost = num(kpiRow.toll_cost);
    const otherCost = num(kpiRow.other_cost);
    const totalDistance = num(kpiRow.total_distance);
    const totalFuelLitres = num(kpiRow.fuel_litres);
    const totalExpense = fuelCost + maintenanceCost + emiDue + tollCost + otherCost;
    const averageMileage =
      totalDistance > 0 && totalFuelLitres > 0 ? round2(totalDistance / totalFuelLitres) : 0;
    const costPerKm = totalDistance > 0 ? round2(totalExpense / totalDistance) : 0;

    const kpis: AnalyticsKpis = {
      totalTrips,
      totalDistance,
      averageMileage,
      totalFuelLitres,
      fuelCost,
      maintenanceCost,
      emiDue,
      tollCost,
      otherCost,
      totalExpense,
      costPerKm,
    };

    // ---- Weekly fuel + mileage ------------------------------------------
    const weeklyParams = [...params, weekCount(fromDate, toDate)];
    const weeklyResult = await query<Record<string, unknown>>(WEEKLY_SQL, weeklyParams);

    const weekly: AnalyticsWeeklyPoint[] = weeklyResult.rows.map((row) => {
      const weekLabel = str(row.week);
      const distance = num(row.distance);
      const litres = num(row.litres);
      return {
        week: weekLabel,
        weekLabel,
        fuel: litres,
        distance,
        mileage: distance > 0 && litres > 0 ? round2(distance / litres) : 0,
      };
    });

    // ---- Vehicle stats (single authoritative pass) ----------------------
    const statsResult = await query<Record<string, unknown>>(VEHICLE_STATS_SQL, params);
    const vehicleStats: AnalyticsVehicleStat[] = statsResult.rows.map((row) => {
      const distance = num(row.distance);
      const fuelLitres = num(row.fuel_litres);
      const fuelCostV = num(row.fuel_cost);
      const maintenanceCostV = num(row.maint_cost);
      const emiCostV = num(row.emi_cost);
      const tollCostV = num(row.toll_cost);
      const otherCostV = num(row.other_cost);
      return {
        vehicleId: num(row.vehicle_id),
        vehicleNumber: str(row.vehicle_number),
        trips: num(row.trips),
        distance,
        fuelLitres,
        fuelCost: fuelCostV,
        maintenanceCost: maintenanceCostV,
        emiCost: emiCostV,
        tollCost: tollCostV,
        otherCost: otherCostV,
        totalExpense: fuelCostV + maintenanceCostV + emiCostV + tollCostV + otherCostV,
        mileage: distance > 0 && fuelLitres > 0 ? round2(distance / fuelLitres) : 0,
      };
    });

    // ---- Cost centres (expense breakdown; sum == kpis.totalExpense) ------
    const costCenters: AnalyticsCostCenter[] = [
      { name: "Fuel", amount: fuelCost, percentage: percent(fuelCost, totalExpense), value: fuelCost },
      {
        name: "Maintenance",
        amount: maintenanceCost,
        percentage: percent(maintenanceCost, totalExpense),
        value: maintenanceCost,
      },
      { name: "EMI", amount: emiDue, percentage: percent(emiDue, totalExpense), value: emiDue },
      { name: "Toll", amount: tollCost, percentage: percent(tollCost, totalExpense), value: tollCost },
      { name: "Other", amount: otherCost, percentage: percent(otherCost, totalExpense), value: otherCost },
    ];

    // ---- Top performers: deterministic (mileage DESC, vehicle_number ASC) --
    const topPerformers: AnalyticsTopPerformer[] = [...vehicleStats]
      .sort((a, b) => b.mileage - a.mileage || a.vehicleNumber.localeCompare(b.vehicleNumber))
      .slice(0, 5)
      .map((row) => ({
        vehicleId: row.vehicleId,
        id: row.vehicleId,
        vehicleNumber: row.vehicleNumber,
        mileage: row.mileage,
        distance: row.distance,
        dist: row.distance,
        fuelLitres: row.fuelLitres,
        fuel: row.fuelLitres,
        trips: row.trips,
      }));

    // ---- Highest expense: deterministic (totalExpense DESC, vehicle_number ASC) --
    const highestExpense: AnalyticsHighestExpense[] = [...vehicleStats]
      .sort(
        (a, b) =>
          b.totalExpense - a.totalExpense ||
          a.vehicleNumber.localeCompare(b.vehicleNumber)
      )
      .slice(0, 5)
      .map((row) => ({
        vehicleId: row.vehicleId,
        id: row.vehicleId,
        vehicleNumber: row.vehicleNumber,
        totalExpense: row.totalExpense,
        maintenanceCost: row.maintenanceCost,
        maintenance: row.maintenanceCost,
        fuelCost: row.fuelCost,
        fuel: row.fuelCost,
        emiCost: row.emiCost,
        tollCost: row.tollCost,
        otherCost: row.otherCost,
      }));

    return {
      fromDate,
      toDate,
      vehicleId,
      safe: true,
      kpis,
      weekly,
      costCenters,
      vehicleStats,
      topPerformers,
      highestExpense,
    };
  },
};