import { query } from "../config/db.js";
import { dateOnly, num, str } from "../utils/coerce.js";
import { paginatedResult, type PaginationParams } from "../utils/pagination.js";

export type TripExpenseFilters = {
  fromDate?: string;
  toDate?: string;
  vehicleId?: number;
  supervisorId?: number;
  search?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  pagination?: PaginationParams | null;
};

const SORT_COLUMNS: Record<string, string> = {
  tripNo: "t.trip_no",
  tripDate: "t.trip_date",
  vehicleNo: "t.vehicle_no",
  supervisorName: "t.supervisor_name",
  advanceAmount: "t.advance_amount",
  totalExpense: "total_expense",
  employeeCount: "employee_count",
};

function whereClause(filters: TripExpenseFilters) {
  const clauses = ["t.deleted=FALSE", "t.status='Completed'", "t.expenses_step_submitted=TRUE"];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    clauses.push(sql.replace("?", `$${params.length}`));
  };
  if (filters.fromDate) add("t.trip_date>=?::date", filters.fromDate);
  if (filters.toDate) add("t.trip_date<=?::date", filters.toDate);
  if (filters.vehicleId) add("t.vehicle_id=?", filters.vehicleId);
  if (filters.supervisorId) add("t.supervisor_id=?", filters.supervisorId);
  if (filters.search?.trim()) {
    add("(t.trip_no ILIKE '%'||?||'%' OR t.vehicle_no ILIKE '%'||$" + (params.length + 1) + "||'%' OR t.supervisor_name ILIKE '%'||$" + (params.length + 1) + "||'%')", filters.search.trim());
  }
  return { where: `WHERE ${clauses.join(" AND ")}`, params };
}

function mapRow(row: Record<string, unknown>) {
  return {
    id: num(row.id),
    tripNo: str(row.trip_no),
    tripDate: dateOnly(row.trip_date) ?? "",
    vehicleId: row.vehicle_id == null ? null : num(row.vehicle_id),
    vehicleNo: str(row.vehicle_no),
    supervisorId: row.supervisor_id == null ? null : num(row.supervisor_id),
    supervisorName: str(row.supervisor_name),
    driverName: str(row.driver_name),
    advanceAmount: num(row.advance_amount),
    meals: num(row.meals),
    loading: num(row.loading),
    tiffin: num(row.meals_tiffin),
    supervisorPc: num(row.supervisor_pc),
    vehicleMaintenance: num(row.vehicle_maintenance),
    rto: num(row.others1_amt),
    others: num(row.others_total),
    diesel: num(row.diesel_amount),
    totalExpense: num(row.total_expense),
    remarks: str(row.remarks),
    employeeCount: num(row.employee_count),
    employees: Array.isArray(row.employees) ? row.employees : [],
    dieselBreakdown: Array.isArray(row.diesel_breakdown) ? row.diesel_breakdown : [],
    otherBreakdown: [2, 3, 4, 5].map((index) => ({
      name: str(row[`others${index}_name`]) || `Other ${index - 1}`,
      amount: num(row[`others${index}_amt`]),
    })).filter((item) => item.amount > 0),
    expenseBreakdown: [
      { name: "Meals", amount: num(row.meals) },
      { name: "Loading", amount: num(row.loading) },
      { name: "Tiffin", amount: num(row.meals_tiffin) },
      { name: "Driver Bata", amount: num(row.driver_bata) },
      { name: "Helper Bata", amount: num(row.helper_bata) },
      { name: "Vehicle Maintenance", amount: num(row.vehicle_maintenance) },
      { name: "Tea / RC", amount: num(row.others_rc) },
      { name: "RTO", amount: num(row.others1_amt) },
    ].filter((item) => item.amount > 0),
  };
}

export const tripExpensesService = {
  async list(filters: TripExpenseFilters = {}) {
    const { where, params } = whereClause(filters);
    const sortColumn = SORT_COLUMNS[filters.sortBy ?? ""] ?? "t.trip_date";
    const sortDir = filters.sortDir === "asc" ? "ASC" : "DESC";
    const select = `
      SELECT t.*,
        COALESCE(t.driver_bata,0)+COALESCE(t.helper_bata,0) AS supervisor_pc,
        COALESCE(t.vehicle_maintenance,0)+COALESCE(t.others_rc,0)+COALESCE(t.others1_amt,0)+COALESCE(t.others2_amt,0)+COALESCE(t.others3_amt,0)+COALESCE(t.others4_amt,0)+COALESCE(t.others5_amt,0) AS others_total,
        COALESCE(d.diesel_amount,t.fuel,0) AS diesel_amount,
        COALESCE(d.diesel_breakdown,'[]'::json) AS diesel_breakdown,
        (CASE WHEN t.driver_id IS NULL THEN 0 ELSE 1 END + CASE WHEN t.supervisor_id IS NULL THEN 0 ELSE 1 END + COALESCE(c.crew_count,0)) AS employee_count,
        COALESCE(c.employees,'[]'::json) AS employees,
        (COALESCE(t.meals,0)+COALESCE(t.loading,0)+COALESCE(t.meals_tiffin,0)+COALESCE(t.driver_bata,0)+COALESCE(t.helper_bata,0)+
         COALESCE(t.vehicle_maintenance,0)+COALESCE(t.others_rc,0)+COALESCE(t.others1_amt,0)+COALESCE(t.others2_amt,0)+
         COALESCE(t.others3_amt,0)+COALESCE(t.others4_amt,0)+COALESCE(t.others5_amt,0)+COALESCE(d.diesel_amount,t.fuel,0)) AS total_expense
      FROM trips t
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int crew_count,
          json_agg(json_build_object('name',tc.employee_name,'role',INITCAP(tc.role::text)) ORDER BY tc.role,tc.employee_name) employees
        FROM trip_crew tc WHERE tc.trip_id=t.id
      ) c ON TRUE
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(COALESCE(de.litres,0)*COALESCE(de.rate,0)),0) diesel_amount,
          json_agg(json_build_object('bunk',de.bunk_name,'litres',de.litres,'rate',de.rate,'amount',COALESCE(de.litres,0)*COALESCE(de.rate,0)) ORDER BY de.row_index) diesel_breakdown
        FROM trip_diesel_entries de WHERE de.trip_id=t.id
      ) d ON TRUE
      ${where}`;

    const countResult = await query<{ c: string }>(`SELECT COUNT(*)::text c FROM trips t ${where}`, params);
    const total = Number(countResult.rows[0]?.c ?? 0);
    if (!filters.pagination) {
      const result = await query(`${select} ORDER BY ${sortColumn} ${sortDir}, t.id DESC`, params);
      return result.rows.map(mapRow);
    }
    const pageParams = [...params, filters.pagination.limit, filters.pagination.offset];
    const result = await query(
      `${select} ORDER BY ${sortColumn} ${sortDir}, t.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      pageParams,
    );
    return paginatedResult(result.rows.map(mapRow), total, filters.pagination);
  },
};
