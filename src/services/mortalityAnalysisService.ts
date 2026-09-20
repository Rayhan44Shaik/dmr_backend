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
}

export interface MortalityAnalysisQuery {
  fromDate?: string;
  toDate?: string;
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
};

function mapRow(row: Record<string, unknown>): MortalityAnalysisRow {
  return {
    tripId: num(row.id),
    tripNo: String(row.trip_no ?? ""),
    tripDate: dateOnly(row.trip_date) ?? "",
    vehicleNo: row.vehicle_no == null ? null : String(row.vehicle_no),
    supervisorName: row.supervisor_name == null ? null : String(row.supervisor_name),
    sourceFarm: row.source_farm == null ? null : String(row.source_farm),
    farmBirds: num(row.farm_birds),
    farmWeight: num(row.farm_weight),
    deliveredBirds: num(row.total_birds_delivered),
    deliveredWeight: num(row.total_delivered_weight),
    mortalityCount: num(row.total_mortality_count),
    mortalityWeight: num(row.total_mortality_weight),
    weightLoss: num(row.weight_loss),
  };
}

export const mortalityAnalysisService = {
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
    };

    const selectSql = `
      SELECT
        t.id, t.trip_no, t.trip_date, t.vehicle_no, t.supervisor_name, t.source_farm,
        COALESCE(NULLIF(t.farm_bird_count, 0), t.total_birds) AS farm_birds,
        COALESCE(NULLIF(t.farm_load_weight, 0), t.dc_weight) AS farm_weight,
        t.total_birds_delivered, t.total_delivered_weight,
        t.total_mortality_count, t.total_mortality_weight, t.weight_loss
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
        kpis,
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

    return { ...page, kpis };
  },
};
