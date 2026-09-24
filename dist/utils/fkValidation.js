import { AppError } from "../middleware/errorHandler.js";
import { query } from "../config/db.js";
async function exists(client, table, id, extraWhere = "") {
    const sql = `SELECT 1 FROM ${table} WHERE id = $1 ${extraWhere} LIMIT 1`;
    const result = client
        ? await client.query(sql, [id])
        : await query(sql, [id]);
    return Boolean(result.rowCount);
}
export async function assertEmployeeExists(id, label = "Employee", client = null) {
    if (id == null)
        return;
    if (!(await exists(client, "employees", id))) {
        throw new AppError(422, `${label} not found`, { employeeId: id });
    }
}
export async function assertVehicleExists(id, client = null) {
    if (id == null)
        return;
    if (!(await exists(client, "vehicles", id))) {
        throw new AppError(422, "Vehicle not found", { vehicleId: id });
    }
}
/** Stricter than assertVehicleExists: also rejects an Inactive (soft-deleted /
 * cancelled) vehicle. Mirrors assertShopActive — new trip/fuel/meter activity
 * against an inactive vehicle is rejected, while historical records that
 * already reference it keep working. Backend-enforced; frontend filtering
 * alone is insufficient. */
export async function assertVehicleActive(id, client = null) {
    if (id == null)
        return;
    const sql = `SELECT status FROM vehicles WHERE id = $1`;
    const result = client ? await client.query(sql, [id]) : await query(sql, [id]);
    if (!result.rowCount) {
        throw new AppError(422, "Vehicle not found", { vehicleId: id });
    }
    if (result.rows[0].status !== "Active") {
        throw new AppError(422, "Vehicle is inactive and cannot be used for a new trip or fuel entry.", {
            code: "VEHICLE_INACTIVE",
            vehicleId: id,
        });
    }
}
export async function assertFarmExists(id, client = null) {
    if (id == null)
        return;
    if (!(await exists(client, "farms", id))) {
        throw new AppError(422, "Farm not found", { farmId: id });
    }
}
export async function assertShopExists(id, client = null) {
    if (id == null)
        return;
    if (!(await exists(client, "shops", id))) {
        throw new AppError(422, "Shop not found", { shopId: id });
    }
}
/** Stricter than assertShopExists: also rejects a soft-deleted (Inactive)
 * shop. Use this wherever a NEW transactional record (e.g. a Shop Sale) is
 * being created against a shop — existing historical records that already
 * reference a since-deactivated shop must keep working, but new activity
 * against an inactive shop should not be possible. */
export async function assertShopActive(id, client = null) {
    if (id == null)
        return;
    const sql = `SELECT status FROM shops WHERE id = $1`;
    const result = client ? await client.query(sql, [id]) : await query(sql, [id]);
    if (!result.rowCount) {
        throw new AppError(422, "Shop not found", { shopId: id });
    }
    if (result.rows[0].status !== "Active") {
        throw new AppError(422, "Shop is inactive and cannot be used for a new Shop Sale", {
            shopId: id,
        });
    }
}
export async function assertBirdTypeExists(id, client = null) {
    if (id == null)
        return;
    if (!(await exists(client, "bird_types", id))) {
        throw new AppError(422, "Bird type not found", { birdTypeId: id });
    }
}
export async function assertTripExists(id, client = null) {
    if (id == null)
        return;
    if (!(await exists(client, "trips", id, "AND COALESCE(deleted, FALSE) = FALSE"))) {
        throw new AppError(404, `Trip ${id} not found`);
    }
}
export async function validateTripForeignKeys(body, client = null) {
    await assertVehicleExists(body.vehicleId, client);
    await assertEmployeeExists(body.driverId, "Driver", client);
    await assertEmployeeExists(body.supervisorId, "Supervisor", client);
    await assertFarmExists(body.sourceFarmId, client);
    await assertBirdTypeExists(body.farmBirdTypeId, client);
    for (const [index, delivery] of (body.deliveries ?? []).entries()) {
        if (delivery.shopId != null) {
            if (!(await exists(client, "shops", delivery.shopId))) {
                throw new AppError(422, `Delivery shop not found at index ${index}`, {
                    shopId: delivery.shopId,
                });
            }
        }
        if (delivery.birdTypeId != null) {
            if (!(await exists(client, "bird_types", delivery.birdTypeId))) {
                throw new AppError(422, `Delivery bird type not found at index ${index}`, {
                    birdTypeId: delivery.birdTypeId,
                });
            }
        }
    }
}
export async function resolveEmployeeNames(client, names, role) {
    const resolved = [];
    for (const name of names) {
        if (!name?.trim())
            continue;
        const result = await client.query(`SELECT id FROM employees WHERE employee_name = $1 AND status = 'Active' LIMIT 1`, [name.trim()]);
        resolved.push({
            employeeId: result.rowCount ? result.rows[0].id : null,
            employeeName: name.trim(),
        });
    }
    return resolved;
}
//# sourceMappingURL=fkValidation.js.map