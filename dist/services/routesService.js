import { query } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { num, str } from "../utils/coerce.js";
import { validateRouteFields } from "../utils/masterValidation.js";
export function mapRoute(row) {
    return {
        id: num(row.id),
        routeNo: num(row.route_no),
        routeName: str(row.route_name),
        routeCode: str(row.route_code),
        description: str(row.description),
        status: str(row.status),
    };
}
export const routesService = {
    async listRoutes() {
        const result = await query(`SELECT * FROM routes ORDER BY route_name`);
        return result.rows.map(mapRoute);
    },
    async getRoute(id) {
        const result = await query("SELECT * FROM routes WHERE id = $1", [id]);
        if (!result.rowCount)
            throw new AppError(404, "Route not found");
        return mapRoute(result.rows[0]);
    },
    async assertUniqueName(routeName, excludeId) {
        const result = await query(`SELECT id FROM routes
       WHERE LOWER(route_name) = LOWER($1)
         AND ($2::int IS NULL OR id <> $2)
       LIMIT 1`, [routeName, excludeId ?? null]);
        if (result.rowCount) {
            throw new AppError(409, `A route named "${routeName}" already exists.`);
        }
    },
    async upsertRoute(body) {
        const errors = validateRouteFields(body);
        if (errors.length)
            throw new AppError(400, errors[0].message);
        if (body.id) {
            await this.assertUniqueName(body.routeName, body.id);
            const result = await query(`UPDATE routes SET
          route_no=COALESCE($2,route_no), route_name=$3, route_code=$4, description=$5, status=$6
         WHERE id=$1 RETURNING *`, [
                body.id,
                body.routeNo,
                body.routeName,
                body.routeCode ?? "",
                body.description ?? "",
                body.status ?? "Active",
            ]);
            if (!result.rowCount)
                throw new AppError(404, "Route not found");
            return mapRoute(result.rows[0]);
        }
        await this.assertUniqueName(body.routeName);
        const nextNo = await query(`SELECT next_master_number('routes') AS n`);
        const result = await query(`INSERT INTO routes (
         route_no, route_name, route_code, description, status
       ) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [
            body.routeNo ?? nextNo.rows[0].n,
            body.routeName,
            body.routeCode ?? "",
            body.description ?? "",
            body.status ?? "Active",
        ]);
        return mapRoute(result.rows[0]);
    },
    async updateRouteStatus(id, status) {
        const result = await query(`UPDATE routes SET status=$2 WHERE id=$1 RETURNING *`, [id, status]);
        if (!result.rowCount)
            throw new AppError(404, "Route not found");
        return mapRoute(result.rows[0]);
    },
    async deleteRoute(id) {
        const result = await query(`UPDATE routes SET status='Inactive' WHERE id=$1 RETURNING *`, [id]);
        if (!result.rowCount)
            throw new AppError(404, "Route not found");
        return { id, deleted: true, deactivated: true };
    },
};
//# sourceMappingURL=routesService.js.map