/**
 * Completed-trip mortality / weight-loss analysis for dashboard Operational Trends
 * and the Mortality Analysis page.
 */
import { query } from "../config/db.js";
import { dateOnly, num } from "../utils/coerce.js";
import {
  paginatedResult,
  type PaginationParams,
} from "../utils/pagination.js";

export interface MortalityAnalysisRow {
  tripId: number;
  tripNo: string;
  tripDate: string;
  vehicleNo: string | null;
  supervisorName: string | null;
  sourceFarm: string | null;
  farmBirds: number;
  farmWeight: number;
  deliveredBirds: number;
  deliveredWeight: number;
  mortalityCount: number;
  mortalityWeight: number;
  weightLoss: number;
  driverName: string;
  loaders: string[];
  helpers: string[];
  status: string;
  deliveryShops: number;
  mortalityPercentage: number;
  weightLossPercentage: number;
  survivalRate: number;
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

const SORT_COLUMNS: Record<string, string> = {
  tripDate: "t.trip_date",
  tripNo: "t.trip_no",
  farmBirds: "COALESCE(NULLIF(t.farm_bird_count, 0), t.total_birds)",
  farmWeight: "COALESCE(NULLIF(t.farm_load_weight, 0), t.dc_weight)",
  weightLoss: "t.weight_loss",
  mortalityCount: "t.total_mortality_count",
  sourceFarm: "t.source_farm",
  supervisorName: "t.supervisor_name",
  deliveryShops: "delivery_shops",
  deliveredBirds: "t.total_birds_delivered",
  deliveredWeight: "t.total_delivered_weight",
  mortalityWeight: "t.total_mortality_weight",
  mortalityPercentage: "mortality_percentage",
  weightLossPercentage: "weight_loss_percentage",
};

function mapRow(row: Record<string, unknown>): MortalityAnalysisRow {
  const farmBirds = num(row.farm_birds);
  const farmWeight = num(row.farm_weight);
  const mortalityCount = num(row.total_mortality_count);
  const weightLoss = num(row.weight_loss);
  return {
    tripId: num(row.id),
    tripNo: String(row.trip_no ?? ""),
    tripDate: dateOnly(row.trip_date) ?? "",
    vehicleNo: row.vehicle_no == null ? null : String(row.vehicle_no),
    supervisorName: row.supervisor_name == null ? null : String(row.supervisor_name),
    sourceFarm: row.source_farm == null ? null : String(row.source_farm),
    farmBirds,
    farmWeight,
    deliveredBirds: num(row.total_birds_delivered),
    deliveredWeight: num(row.total_delivered_weight),
    mortalityCount,
    mortalityWeight: num(row.total_mortality_weight),
    weightLoss,
    driverName: String(row.driver_name ?? ""),
    loaders: [],
    helpers: [],
    status: "Completed",
    deliveryShops: num(row.delivery_shops),
    mortalityPercentage: farmBirds > 0 ? Number(((mortalityCount / farmBirds) * 100).toFixed(2)) : 0,
    weightLossPercentage: farmWeight > 0 ? Number(((weightLoss / farmWeight) * 100).toFixed(2)) : 0,
    survivalRate: farmBirds > 0 ? Math.max(0, (farmBirds - mortalityCount) / farmBirds) : 0,
  };
}

export const mortalityAnalysisService = {
  async deliveries(tripId: number) {
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
    const clauses = [
      `COALESCE(t.deleted, FALSE) = FALSE`,
      `t.status IN ('Completed', 'Pending')`,
      `t.expenses_step_submitted = TRUE`,
    ];
    const params: unknown[] = [];

    if (filters.fromDate) {
      params.push(filters.fromDate);
      clauses.push(`t.trip_date >= $${params.length}::date`);
    }
    if (filters.toDate) {
      params.push(filters.toDate);
      clauses.push(`t.trip_date <= $${params.length}::date`);
    }
    if (filters.farm) { params.push(filters.farm); clauses.push(`t.source_farm = $${params.length}`); }
    if (filters.supervisor) { params.push(filters.supervisor); clauses.push(`t.supervisor_name = $${params.length}`); }
    if (filters.search) {
      params.push(`%${filters.search}%`);
      clauses.push(`(t.trip_no ILIKE $${params.length} OR t.vehicle_no ILIKE $${params.length} OR t.driver_name ILIKE $${params.length})`);
    }

    const where = `WHERE ${clauses.join(" AND ")}`;
    const sortCol = SORT_COLUMNS[filters.sortBy ?? "tripDate"] ?? SORT_COLUMNS.tripDate;
    const sortDir = filters.sortDir === "desc" ? "DESC" : "ASC";

    const kpiResult = await query(
      `SELECT
         COUNT(*)::int AS total_trips,
         COALESCE(SUM(COALESCE(NULLIF(t.farm_bird_count, 0), t.total_birds)), 0)::float AS farm_birds,
         COALESCE(SUM(t.total_birds_delivered), 0)::float AS delivered_birds,
         COALESCE(SUM(t.total_mortality_count), 0)::float AS mortality_count,
         COALESCE(SUM(COALESCE(NULLIF(t.farm_load_weight, 0), t.dc_weight)), 0)::float AS farm_weight,
         COALESCE(SUM(t.total_delivered_weight), 0)::float AS delivered_weight,
         COALESCE(SUM(t.total_mortality_weight), 0)::float AS mortality_weight,
         COALESCE(SUM(t.weight_loss), 0)::float AS weight_loss
       FROM trips t
       ${where}`,
      params
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
      deliveryShops: 0,
      mortalityPercentage: num(kpi.farm_birds) > 0 ? Number(((num(kpi.mortality_count) / num(kpi.farm_birds)) * 100).toFixed(2)) : 0,
      weightLossPercentage: num(kpi.farm_weight) > 0 ? Number(((num(kpi.weight_loss) / num(kpi.farm_weight)) * 100).toFixed(2)) : 0,
    };

    const optionRows = await query(`SELECT DISTINCT source_farm, supervisor_name FROM trips WHERE COALESCE(deleted,FALSE)=FALSE AND expenses_step_submitted=TRUE`);
    const filterOptions = {
      farms: [...new Set(optionRows.rows.map((row) => String(row.source_farm ?? "")).filter(Boolean))].sort(),
      supervisors: [...new Set(optionRows.rows.map((row) => String(row.supervisor_name ?? "")).filter(Boolean))].sort(),
    };

    const selectSql = `
      SELECT
        t.id, t.trip_no, t.trip_date, t.vehicle_no, t.driver_name, t.supervisor_name, t.source_farm,
        COALESCE(NULLIF(t.farm_bird_count, 0), t.total_birds) AS farm_birds,
        COALESCE(NULLIF(t.farm_load_weight, 0), t.dc_weight) AS farm_weight,
        t.total_birds_delivered, t.total_delivered_weight,
        t.total_mortality_count, t.total_mortality_weight, t.weight_loss,
        (SELECT COUNT(DISTINCT d.shop_id) FROM trip_deliveries d WHERE d.trip_id=t.id AND COALESCE(d.deleted,FALSE)=FALSE) AS delivery_shops,
        CASE WHEN COALESCE(NULLIF(t.farm_bird_count,0),t.total_birds,0)>0 THEN (t.total_mortality_count*100.0/COALESCE(NULLIF(t.farm_bird_count,0),t.total_birds)) ELSE 0 END AS mortality_percentage,
        CASE WHEN COALESCE(NULLIF(t.farm_load_weight,0),t.dc_weight,0)>0 THEN (t.weight_loss*100.0/COALESCE(NULLIF(t.farm_load_weight,0),t.dc_weight)) ELSE 0 END AS weight_loss_percentage
      FROM trips t
      ${where}
      ORDER BY ${sortCol} ${sortDir}, t.id ASC`;

    if (!filters.pagination) {
      const all = await query(selectSql, params);
      const data = all.rows.map((r) => mapRow(r));
      return {
        data,
        meta: {
          total: kpis.totalTrips,
          page: 1,
          limit: data.length || 1,
          totalPages: 1,
        },
        kpis: { ...kpis, deliveryShops: data.reduce((sum, row) => sum + row.deliveryShops, 0) },
        filterOptions,
      };
    }

    const countResult = await query(
      `SELECT COUNT(*)::int AS c FROM trips t ${where}`,
      params
    );
    const total = num(countResult.rows[0]?.c);
    const pageParams = filters.pagination;
    const pageSql = `${selectSql} LIMIT ${pageParams.limit} OFFSET ${pageParams.offset}`;
    const pageRows = await query(pageSql, params);
    const page = paginatedResult(
      pageRows.rows.map((r) => mapRow(r)),
      total,
      pageParams
    );

    return { ...page, kpis: { ...kpis, deliveryShops: page.data.reduce((sum, row) => sum + row.deliveryShops, 0) }, filterOptions };
  },
};
