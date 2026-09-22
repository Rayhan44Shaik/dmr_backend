import { z } from "zod";
import { query, withTransaction } from "../config/db.js";
import { parseMaster } from "../validation/masters.js";
import { mapBank, mapBirdType, mapEmployee, mapFarm, mapShop, mapVehicle } from "./mastersService.js";
import { mapRoute } from "./routesService.js";

const configs = {
  employees: { table: "employees", name: "employee_name", no: "employee_no", search: ["employee_name", "department", "role", "phone_number", "email"], filters: ["department", "role"], map: mapEmployee },
  vehicles: { table: "vehicles", name: "vehicle_number", no: "vehicle_no", search: ["vehicle_number", "vehicle_type", "tracking_id", "fastag_bank", "engine_number", "chassis_number"], filters: ["vehicle_type"], map: mapVehicle },
  farms: { table: "farms", name: "farm_name", no: "farm_no", search: ["farm_name", "owner_name", "supervisor_name", "phone_number", "village"], filters: ["village"], map: mapFarm },
  shops: { table: "shops", name: "shop_name", no: "shop_no", search: ["shop_name", "shop_number", "owner_name", "phone_number", "city"], filters: ["city", "association_type"], map: mapShop },
  banks: { table: "banks", name: "bank_name", no: "bank_no", search: ["bank_name", "branch", "account_number", "ifsc_code", "upi_id"], filters: ["branch"], map: mapBank },
  "bird-types": { table: "bird_types", name: "bird_type", no: "bird_type_no", search: ["bird_type", "description"], filters: ["category"], map: mapBirdType },
  routes: { table: "routes", name: "route_name", no: "route_no", search: ["route_name", "route_code", "description"], filters: [], map: mapRoute },
} as const;
export type MasterEntity = keyof typeof configs;
export const masterEntities = Object.keys(configs) as MasterEntity[];
const text = z.string().trim().max(200).optional();
const listSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: text,
  status: z.enum(["Active", "Inactive", "Suspended", ""]).optional(),
  sort: z.enum(["name", "number", "status"]).default("number"),
  direction: z.enum(["asc", "desc"]).default("asc"),
  department: text, role: text, city: text, village: text, branch: text, category: text,
  vehicle_type: text, association_type: text,
  export: z.enum(["true"]).optional(),
}).strict();

export async function listMaster(entity: MasterEntity, input: unknown) {
  const q = parseMaster(listSchema, input);
  const config = configs[entity];
  const params: unknown[] = [];
  const conditions: string[] = [];
  const bind = (value: unknown) => { params.push(value); return `$${params.length}`; };
  if (q.search) {
    const term = bind(`%${q.search.replace(/[\\%_]/g, "\\$&")}%`);
    conditions.push(`(${[...config.search, config.no, "status"].map(c => `${c}::text ILIKE ${term}`).join(" OR ")})`);
  }
  if (q.status) conditions.push(`status::text = ${bind(q.status)}`);
  for (const field of ["department", "role", "city", "village", "branch", "category", "vehicle_type", "association_type"] as const) {
    if (!q[field]) continue;
    if (!(config.filters as readonly string[]).includes(field)) {
      parseMaster(z.never(), q[field]);
    }
    conditions.push(`LOWER(${field}) = LOWER(${bind(q[field])})`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const sort = q.sort === "name" ? config.name : q.sort === "status" ? "status" : config.no;
  const order = `ORDER BY ${sort} ${q.direction}, id ${q.direction}`;
  // Legacy consumers retain their complete array contract. Masters screens always pass page.
  if (q.page === undefined && !q.export) {
    const result = await query(`SELECT * FROM ${config.table} ${where} ${order}`, params);
    return result.rows.map(row => config.map(row));
  }
  return withTransaction(async client => {
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const count = await client.query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM ${config.table} ${where}`, params);
    const total = count.rows[0].total;
    if (q.export && total > 10000) {
      const { AppError } = await import("../middleware/errorHandler.js");
      throw new AppError(400, "Export is limited to 10,000 records. Narrow the filters and retry.");
    }
    const page = Math.min(q.page ?? 1, Math.max(1, Math.ceil(total / q.pageSize)));
    const result = await client.query(`SELECT * FROM ${config.table} ${where} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, q.export ? 10000 : q.pageSize, q.export ? 0 : (page - 1) * q.pageSize]);
    const facets: Record<string, string[]> = {};
    for (const field of config.filters) {
      const values = await client.query<{ value: string }>(`SELECT DISTINCT ${field} AS value FROM ${config.table} WHERE ${field} <> '' ORDER BY value LIMIT 1000`);
      facets[field] = values.rows.map(row => row.value);
    }
    return { items: result.rows.map(row => config.map(row)), total, page, pageSize: q.pageSize, facets };
  });
}
