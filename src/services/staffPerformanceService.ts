/**
 * Staff → Driver Performance / Supervisor Performance — READ-ONLY aggregation
 * layer. Nothing is written; every figure is computed inside PostgreSQL from
 * the same authoritative Fleet sources the Analytics page uses:
 *
 *  - Trips      → completed, non-deleted trips (trip_date business date).
 *                 A trip is counted ONCE per crew member (aggregation over the
 *                 trips table itself — never over trip_deliveries — so a trip
 *                 with many shops can never multiply the counts).
 *  - Fuel       → non-deleted fuel_expenses belonging to the filtered crew /
 *                 vehicle set. Eligibility mirrors the Fuel page exactly:
 *                 `(source_type <> 'TRIP' OR ops_status = 'Approved')`.
 *  - Maintenance→ fleet_maintenance with status = 'Approved', not deleted.
 *  - Trip cash  → toll = pickup + delivery + destination tolls; other =
 *                 driver bata, meals, tiffin, loading, on-road maintenance,
 *                 others1–5, RC (identical cost-centre split to Analytics).
 *
 * Date range: fromDate..toDate inclusive. When the range is absent, the last
 * 30 calendar days (including today) are used.
 */

import { query } from "../config/db.js";
import { num, str } from "../utils/coerce.js";
import type {
  DriverPerformanceDetail,
  DriverPerformanceKpis,
  DriverPerformanceResponse,
  DriverPerformanceRow,
  DriverVehicleDetail,
  PerformanceRecentTrip,
  SupervisorPerformanceDetail,
  SupervisorPerformanceKpis,
  SupervisorPerformanceResponse,
  SupervisorPerformanceRow,
} from "../types/performance.js";
import type {
  DriverPerformanceQuery,
  SupervisorPerformanceQuery,
} from "../validation/performance.js";

interface DriverFilters {
  driverId?: number;
  vehicleId?: number;
  search?: string;
}

interface SupervisorFilters {
  supervisorId?: number;
  vehicleId?: number;
  search?: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function defaultRange(): { fromDate: string; toDate: string } {
  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - 29);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { fromDate: iso(from), toDate: iso(today) };
}

/** Sequential parameter builder: $1 = fromDate, $2 = toDate, then every
 *  optional filter is appended in order and referenced with its real $n. */
class ParamBuilder {
  private n = 2;
  readonly params: unknown[] = [];

  next(value: unknown): number {
    this.params.push(value);
    this.n += 1;
    return this.n;
  }
}

function completedTripsCte(filters: DriverFilters | SupervisorFilters, pb: ParamBuilder): string {
  const clauses = [
    "t.status = 'Completed'",
    "COALESCE(t.deleted, FALSE) = FALSE",
    "t.trip_date BETWEEN $1::date AND $2::date",
  ];
  const crewId =
    "driverId" in filters
      ? (filters as DriverFilters).driverId
      : (filters as SupervisorFilters).supervisorId;
  const crewCol = "driverId" in filters ? "t.driver_id" : "t.supervisor_id";
  const crewNameCol = "driverId" in filters ? "t.driver_name" : "t.supervisor_name";
  if (crewId != null) {
    clauses.push(`${crewCol} = $${pb.next(crewId)}::int`);
  }
  if (filters.vehicleId != null) {
    clauses.push(`t.vehicle_id = $${pb.next(filters.vehicleId)}::int`);
  }
  if (filters.search) {
    clauses.push(`${crewNameCol} ILIKE '%' || $${pb.next(filters.search)}::text || '%'`);
  }
  return `completed_trips AS (
    SELECT
      t.id,
      t.driver_id,
      t.driver_name,
      t.supervisor_id,
      t.supervisor_name,
      t.vehicle_id,
      t.vehicle_no,
      t.trip_no,
      t.trip_date,
      COALESCE(t.total_km, 0) AS total_km,
      COALESCE(t.total_shops, 0) AS total_shops,
      COALESCE(t.total_birds_delivered, 0) AS total_birds_delivered,
      COALESCE(t.total_delivered_weight, 0) AS total_delivered_weight,
      COALESCE(t.total_mortality, 0) AS total_mortality,
      COALESCE(t.weight_loss, 0) AS weight_loss,
      COALESCE(t.pickup_tolls, 0) + COALESCE(t.delivery_tolls, 0) + COALESCE(t.destination_tolls, 0) AS toll_expense,
      COALESCE(t.driver_bata, 0) + COALESCE(t.meals, 0) + COALESCE(t.meals_tiffin, 0)
        + COALESCE(t.loading, 0) + COALESCE(t.vehicle_maintenance, 0) + COALESCE(t.others_rc, 0)
        + COALESCE(t.others1_amt, 0) + COALESCE(t.others2_amt, 0) + COALESCE(t.others3_amt, 0)
        + COALESCE(t.others4_amt, 0) + COALESCE(t.others5_amt, 0) AS other_expense
    FROM trips t
    WHERE ${clauses.join(" AND ")}
  )`;
}

/** trip_drivers + filtered_fuel + filtered_maint CTEs. Fuel/maintenance are
 *  restricted to the drivers present in completed_trips so the search / crew
 *  filter applies consistently to every cost source. The vehicle filter is
 *  forwarded to the fuel/maintenance rows too (same vehicle-only semantics as
 *  the trips). */
function crewCostCtes(filters: DriverFilters, pb: ParamBuilder): string {
  const fuelClauses = [
    "COALESCE(fe.deleted, FALSE) = FALSE",
    "(fe.source_type <> 'TRIP' OR fe.ops_status = 'Approved'::ops_record_status)",
    "fe.expense_date BETWEEN $1::date AND $2::date",
  ];
  const maintClauses = [
    "fm.status = 'Approved'",
    "COALESCE(fm.deleted, FALSE) = FALSE",
    "fm.maintenance_date BETWEEN $1::date AND $2::date",
  ];
  if (filters.vehicleId != null) {
    fuelClauses.push(`fe.vehicle_id = $${pb.next(filters.vehicleId)}::int`);
    maintClauses.push(`fm.vehicle_id = $${pb.next(filters.vehicleId)}::int`);
  }
  return `trip_drivers AS (
  SELECT DISTINCT driver_id
  FROM completed_trips
  WHERE driver_id IS NOT NULL
),
filtered_fuel AS (
  SELECT fe.driver_id,
         fe.expense_date,
         COALESCE(fe.litres, 0) AS litres,
         COALESCE(fe.amount, 0) AS amount
  FROM fuel_expenses fe
  JOIN trip_drivers td ON td.driver_id = fe.driver_id
  WHERE ${fuelClauses.join(" AND ")}
),
filtered_maint AS (
  SELECT fm.driver_id,
         SUM(COALESCE(fm.total_cost, 0)) AS cost
  FROM fleet_maintenance fm
  JOIN trip_drivers td ON td.driver_id = fm.driver_id
  WHERE ${maintClauses.join(" AND ")}
  GROUP BY fm.driver_id
)`;
}

function weeksInRange(from: string, to: string): number {
  const days = Math.ceil((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  return Math.max(1, Math.ceil(days / 7));
}

const weekSeriesCte = (weeksParam: number) => `week_series AS (
  SELECT (s.sunday_from + (n - 1) * 7)::date AS week_start,
         'W' || EXTRACT(WEEK FROM (s.sunday_from + (n - 1) * 7)::date)::int AS week
  FROM generate_series(1, $${weeksParam}::int) AS n
  CROSS JOIN (SELECT ($1::date - EXTRACT(DOW FROM $1::date)::int)::date AS sunday_from) s
)`;

function mapRecentTrip(row: Record<string, unknown>): PerformanceRecentTrip {
  return {
    tripNo: str(row.trip_no),
    tripDate: str(row.trip_date),
    vehicleNo: row.vehicle_no == null ? "" : str(row.vehicle_no),
    totalShops: num(row.total_shops),
    totalBirdsDelivered: num(row.total_birds_delivered),
    totalDeliveredWeight: num(row.total_delivered_weight),
    totalMortality: num(row.total_mortality),
    weightLoss: num(row.weight_loss),
    totalKm: num(row.total_km),
  };
}

function mapDriverRow(row: Record<string, unknown>): DriverPerformanceRow {
  const trips = num(row.trips);
  const distance = num(row.distance);
  const fuelLitres = num(row.fuel_litres);
  const fuelCost = num(row.fuel_cost);
  const maintenanceCost = num(row.maint_cost);
  const tollCost = num(row.toll_cost);
  const otherCost = num(row.other_cost);
  const totalCost = round2(fuelCost + maintenanceCost + tollCost + otherCost);
  const vehicleNos: string[] = Array.isArray(row.vehicle_nos)
    ? (row.vehicle_nos as string[]).filter(Boolean)
    : [];
  return {
    driverId: num(row.driver_id),
    driverName: str(row.driver_name),
    employeeStatus: row.employee_status == null ? "Active" : str(row.employee_status),
    trips,
    distance: round2(distance),
    avgDistancePerTrip: trips > 0 ? round2(distance / trips) : 0,
    vehicles: num(row.vehicles),
    vehicleNos,
    fuelLitres: round2(fuelLitres),
    fuelCost: round2(fuelCost),
    maintenanceCost: round2(maintenanceCost),
    tollCost: round2(tollCost),
    otherCost: round2(otherCost),
    totalCost,
    costPerKm: distance > 0 ? round2(totalCost / distance) : 0,
    mileage: distance > 0 && fuelLitres > 0 ? round2(distance / fuelLitres) : 0,
  };
}

const DRIVER_ROWS_SQL = `
WITH %CTE_COMPLETED%,
%CTE_COST%,
per_driver AS (
  SELECT
    ct.driver_id,
    MIN(ct.driver_name) AS driver_name,
    COUNT(*) AS trips,
    SUM(ct.total_km) AS distance,
    SUM(ct.toll_expense) AS toll_cost,
    SUM(ct.other_expense) AS other_cost,
    COUNT(DISTINCT ct.vehicle_no) FILTER (WHERE ct.vehicle_no IS NOT NULL AND ct.vehicle_no <> '') AS vehicles,
    array_agg(DISTINCT ct.vehicle_no) FILTER (WHERE ct.vehicle_no IS NOT NULL AND ct.vehicle_no <> '') AS vehicle_nos
  FROM completed_trips ct
  WHERE ct.driver_id IS NOT NULL
  GROUP BY ct.driver_id
)
SELECT
  pd.driver_id,
  pd.driver_name,
  e.status AS employee_status,
  pd.trips,
  pd.distance,
  pd.toll_cost,
  pd.other_cost,
  pd.vehicles,
  pd.vehicle_nos,
  COALESCE(ff.litres, 0) AS fuel_litres,
  COALESCE(ff.amount, 0) AS fuel_cost,
  COALESCE(fm.cost, 0) AS maint_cost
FROM per_driver pd
LEFT JOIN (SELECT driver_id, SUM(litres) AS litres, SUM(amount) AS amount
           FROM filtered_fuel GROUP BY driver_id) ff ON ff.driver_id = pd.driver_id
LEFT JOIN filtered_maint fm ON fm.driver_id = pd.driver_id
LEFT JOIN employees e ON e.id = pd.driver_id
ORDER BY pd.distance DESC, pd.driver_name`;

const DRIVER_WEEKLY_SQL = `
WITH %CTE_COMPLETED%,
%CTE_COST%,
%WEEK_SERIES%
SELECT
  ws.week,
  COALESCE((SELECT COUNT(*) FROM completed_trips t
             WHERE t.trip_date >= ws.week_start AND t.trip_date < ws.week_start + 7), 0) AS trips,
  COALESCE((SELECT SUM(t.total_km) FROM completed_trips t
             WHERE t.trip_date >= ws.week_start AND t.trip_date < ws.week_start + 7), 0) AS distance,
  COALESCE((SELECT SUM(f.litres) FROM filtered_fuel f
             WHERE f.expense_date >= ws.week_start AND f.expense_date < ws.week_start + 7), 0) AS fuel_litres
FROM week_series ws
ORDER BY ws.week_start`;

export const staffPerformanceService = {
  async getDriverPerformance(input: DriverPerformanceQuery): Promise<DriverPerformanceResponse> {
    const { fromDate, toDate } = defaultRange();
    const from = input.fromDate ?? fromDate;
    const to = input.toDate ?? toDate;
    const filters: DriverFilters = {
      driverId: input.driverId,
      vehicleId: input.vehicleId,
      search: input.search,
    };
    const pb = new ParamBuilder();
    const cteCompleted = completedTripsCte(filters, pb);
    const cteCost = crewCostCtes(filters, pb);
    const params = [from, to, ...pb.params];
    const weeksParam = 3 + pb.params.length;
    const weeklySql = DRIVER_WEEKLY_SQL.replace("%CTE_COMPLETED%", cteCompleted)
      .replace("%CTE_COST%", cteCost)
      .replace("%WEEK_SERIES%", weekSeriesCte(weeksParam));

    const [rowsRes, weeklyRes] = await Promise.all([
      query(
        DRIVER_ROWS_SQL.replace("%CTE_COMPLETED%", cteCompleted).replace("%CTE_COST%", cteCost),
        params
      ),
      query(weeklySql, [...params, weeksInRange(from, to)]),
    ]);

    const rows = rowsRes.rows.map(mapDriverRow);
    const totalTrips = rows.reduce((s, r) => s + r.trips, 0);
    const totalDistance = rows.reduce((s, r) => s + r.distance, 0);
    const totalFuelLitres = rows.reduce((s, r) => s + r.fuelLitres, 0);
    const totalFuelCost = rows.reduce((s, r) => s + r.fuelCost, 0);
    const totalMaintCost = rows.reduce((s, r) => s + r.maintenanceCost, 0);
    const totalTollCost = rows.reduce((s, r) => s + r.tollCost, 0);
    const totalOtherCost = rows.reduce((s, r) => s + r.otherCost, 0);
    const totalCost = round2(totalFuelCost + totalMaintCost + totalTollCost + totalOtherCost);
    const kpis: DriverPerformanceKpis = {
      drivers: rows.length,
      trips: totalTrips,
      distance: round2(totalDistance),
      avgDistancePerTrip: totalTrips > 0 ? round2(totalDistance / totalTrips) : 0,
      fuelLitres: round2(totalFuelLitres),
      fuelCost: round2(totalFuelCost),
      maintenanceCost: round2(totalMaintCost),
      tollCost: round2(totalTollCost),
      otherCost: round2(totalOtherCost),
      totalCost,
      costPerKm: totalDistance > 0 ? round2(totalCost / totalDistance) : 0,
      mileage: totalDistance > 0 && totalFuelLitres > 0 ? round2(totalDistance / totalFuelLitres) : 0,
    };

    const weekly = weeklyRes.rows.map((row) => ({
      week: str(row.week),
      trips: num(row.trips),
      distance: round2(num(row.distance)),
      fuelLitres: round2(num(row.fuel_litres)),
    }));

    let detail: DriverPerformanceDetail | null = null;
    if (input.driverId != null) {
      const [vehicleRes, recentRes] = await Promise.all([
        query(
          `WITH completed_trips AS (
             SELECT t.id, t.driver_id, t.vehicle_no, t.trip_date,
                    COALESCE(t.total_km, 0) AS total_km
             FROM trips t
             WHERE t.status = 'Completed'
               AND COALESCE(t.deleted, FALSE) = FALSE
               AND t.trip_date BETWEEN $1::date AND $2::date
               AND t.driver_id = $3::int
           ),
           per_vehicle AS (
             SELECT ct.vehicle_no,
                    COUNT(*) AS trips,
                    SUM(ct.total_km) AS distance
             FROM completed_trips ct
             WHERE ct.driver_id IS NOT NULL AND ct.vehicle_no IS NOT NULL AND ct.vehicle_no <> ''
             GROUP BY ct.vehicle_no
           ),
           vehicle_fuel AS (
             SELECT fe.vehicle_no,
                    SUM(COALESCE(fe.litres, 0)) AS litres,
                    SUM(COALESCE(fe.amount, 0)) AS amount
             FROM fuel_expenses fe
             WHERE COALESCE(fe.deleted, FALSE) = FALSE
               AND (fe.source_type <> 'TRIP' OR fe.ops_status = 'Approved'::ops_record_status)
               AND fe.expense_date BETWEEN $1::date AND $2::date
               AND fe.driver_id = $3::int
             GROUP BY fe.vehicle_no
           ),
           vehicle_maint AS (
             SELECT fm.vehicle_no,
                    SUM(COALESCE(fm.total_cost, 0)) AS cost
             FROM fleet_maintenance fm
             WHERE fm.status = 'Approved'
               AND COALESCE(fm.deleted, FALSE) = FALSE
               AND fm.maintenance_date BETWEEN $1::date AND $2::date
               AND fm.driver_id = $3::int
             GROUP BY fm.vehicle_no
           )
           SELECT
             pv.vehicle_no,
             pv.trips,
             pv.distance,
             COALESCE(vf.litres, 0) AS fuel_litres,
             COALESCE(vf.amount, 0) AS fuel_cost,
             COALESCE(vm.cost, 0) AS maint_cost
           FROM per_vehicle pv
           LEFT JOIN vehicle_fuel vf ON vf.vehicle_no = pv.vehicle_no
           LEFT JOIN vehicle_maint vm ON vm.vehicle_no = pv.vehicle_no
           ORDER BY pv.distance DESC, pv.vehicle_no`,
          [from, to, input.driverId]
        ),
        query(
          `SELECT trip_no, trip_date, vehicle_no, total_shops, total_birds_delivered,
                  total_delivered_weight, total_mortality, weight_loss, total_km
           FROM trips
           WHERE status = 'Completed'
             AND COALESCE(deleted, FALSE) = FALSE
             AND trip_date BETWEEN $1::date AND $2::date
             AND driver_id = $3::int
           ORDER BY trip_date DESC, id DESC
           LIMIT 10`,
          [from, to, input.driverId]
        ),
      ]);
      const vehicles: DriverVehicleDetail[] = vehicleRes.rows
        .filter((r) => r.vehicle_no != null && str(r.vehicle_no) !== "")
        .map((row) => {
          const trips = num(row.trips);
          const distance = num(row.distance);
          const fuelLitres = num(row.fuel_litres);
          const fuelCost = num(row.fuel_cost);
          const maintenanceCost = num(row.maint_cost);
          const totalCost = round2(fuelCost + maintenanceCost);
          return {
            vehicleNo: str(row.vehicle_no),
            trips,
            distance: round2(distance),
            avgDistancePerTrip: trips > 0 ? round2(distance / trips) : 0,
            fuelLitres: round2(fuelLitres),
            fuelCost: round2(fuelCost),
            maintenanceCost: round2(maintenanceCost),
            totalCost,
            mileage: distance > 0 && fuelLitres > 0 ? round2(distance / fuelLitres) : 0,
          };
        });
      const detailTrips = vehicles.reduce((s, v) => s + v.trips, 0);
      const detailDistance = vehicles.reduce((s, v) => s + v.distance, 0);
      detail = {
        avgDistancePerTrip: detailTrips > 0 ? round2(detailDistance / detailTrips) : 0,
        vehicles,
        recentTrips: recentRes.rows.map(mapRecentTrip),
      };
    }

    return { fromDate: from, toDate: to, kpis, weekly, rows, detail };
  },

  async getSupervisorPerformance(
    input: SupervisorPerformanceQuery
  ): Promise<SupervisorPerformanceResponse> {
    const { fromDate, toDate } = defaultRange();
    const from = input.fromDate ?? fromDate;
    const to = input.toDate ?? toDate;
    const filters: SupervisorFilters = {
      supervisorId: input.supervisorId,
      vehicleId: input.vehicleId,
      search: input.search,
    };
    const pb = new ParamBuilder();
    const cteCompleted = completedTripsCte(filters, pb);
    const params = [from, to, ...pb.params];
    const weeksParam = 3 + pb.params.length;
    const weeklySql = `WITH ${cteCompleted},
         ${weekSeriesCte(weeksParam)}
         SELECT
           ws.week,
           COALESCE((SELECT COUNT(*) FROM completed_trips t
                      WHERE t.trip_date >= ws.week_start AND t.trip_date < ws.week_start + 7), 0) AS trips,
           COALESCE((SELECT SUM(t.total_birds_delivered) FROM completed_trips t
                      WHERE t.trip_date >= ws.week_start AND t.trip_date < ws.week_start + 7), 0) AS birds,
           COALESCE((SELECT SUM(t.total_delivered_weight) FROM completed_trips t
                      WHERE t.trip_date >= ws.week_start AND t.trip_date < ws.week_start + 7), 0) AS weight
         FROM week_series ws
         ORDER BY ws.week_start`;

    const [rowsRes, weeklyRes] = await Promise.all([
      query(
        `WITH ${cteCompleted},
         per_supervisor AS (
           SELECT
             ct.supervisor_id,
             MIN(ct.supervisor_name) AS supervisor_name,
             COUNT(*) AS trips,
             SUM(ct.total_shops) AS shops,
             SUM(ct.total_birds_delivered) AS birds,
             SUM(ct.total_delivered_weight) AS weight,
             SUM(ct.total_mortality) AS mortality,
             SUM(ct.weight_loss) AS weight_loss
           FROM completed_trips ct
           WHERE ct.supervisor_id IS NOT NULL
           GROUP BY ct.supervisor_id
         )
         SELECT
           ps.supervisor_id,
           ps.supervisor_name,
           e.status AS employee_status,
           ps.trips,
           ps.shops,
           ps.birds,
           ps.weight,
           ps.mortality,
           ps.weight_loss
         FROM per_supervisor ps
         LEFT JOIN employees e ON e.id = ps.supervisor_id
         ORDER BY ps.trips DESC, ps.supervisor_name`,
        params
      ),
      query(weeklySql, [...params, weeksInRange(from, to)]),
    ]);

    const rows: SupervisorPerformanceRow[] = rowsRes.rows.map((row) => {
      const trips = num(row.trips);
      const birds = num(row.birds);
      return {
        supervisorId: num(row.supervisor_id),
        supervisorName: str(row.supervisor_name),
        employeeStatus: row.employee_status == null ? "Active" : str(row.employee_status),
        trips,
        shops: num(row.shops),
        birds,
        weight: round2(num(row.weight)),
        mortality: num(row.mortality),
        mortalityRate: birds > 0 ? round4((num(row.mortality) / birds) * 100) : 0,
        weightLoss: round2(num(row.weight_loss)),
      };
    });

    const totalTrips = rows.reduce((s, r) => s + r.trips, 0);
    const totalBirds = rows.reduce((s, r) => s + r.birds, 0);
    const kpis: SupervisorPerformanceKpis = {
      supervisors: rows.length,
      trips: totalTrips,
      shops: rows.reduce((s, r) => s + r.shops, 0),
      birds: totalBirds,
      weight: round2(rows.reduce((s, r) => s + r.weight, 0)),
      mortality: rows.reduce((s, r) => s + r.mortality, 0),
      mortalityRate: totalBirds > 0 ? round4((rows.reduce((s, r) => s + r.mortality, 0) / totalBirds) * 100) : 0,
      weightLoss: round2(rows.reduce((s, r) => s + r.weightLoss, 0)),
    };

    const weekly = weeklyRes.rows.map((row) => ({
      week: str(row.week),
      trips: num(row.trips),
      birds: num(row.birds),
      weight: round2(num(row.weight)),
    }));

    let detail: SupervisorPerformanceDetail | null = null;
    if (input.supervisorId != null) {
      const recentRes = await query(
        `SELECT trip_no, trip_date, vehicle_no, total_shops, total_birds_delivered,
                total_delivered_weight, total_mortality, weight_loss, total_km
         FROM trips
         WHERE status = 'Completed'
           AND COALESCE(deleted, FALSE) = FALSE
           AND trip_date BETWEEN $1::date AND $2::date
           AND supervisor_id = $3::int
         ORDER BY trip_date DESC, id DESC
         LIMIT 10`,
        [from, to, input.supervisorId]
      );
      detail = { recentTrips: recentRes.rows.map(mapRecentTrip) };
    }

    return { fromDate: from, toDate: to, kpis, weekly, rows, detail };
  },
};