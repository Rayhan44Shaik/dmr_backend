import type pg from "pg";
import { AppError } from "../middleware/errorHandler.js";
import { query } from "../config/db.js";

type Client = pg.PoolClient;

async function exists(
  client: Client | null,
  table: string,
  id: number,
  extraWhere = ""
): Promise<boolean> {
  const sql = `SELECT 1 FROM ${table} WHERE id = $1 ${extraWhere} LIMIT 1`;
  const result = client
    ? await client.query(sql, [id])
    : await query(sql, [id]);
  return Boolean(result.rowCount);
}

export async function assertEmployeeExists(
  id: number | null | undefined,
  label = "Employee",
  client: Client | null = null
) {
  if (id == null) return;
  if (!(await exists(client, "employees", id))) {
    throw new AppError(422, `${label} not found`, { employeeId: id });
  }
}

export async function assertVehicleExists(
  id: number | null | undefined,
  client: Client | null = null
) {
  if (id == null) return;
  if (!(await exists(client, "vehicles", id))) {
    throw new AppError(422, "Vehicle not found", { vehicleId: id });
  }
}

export async function assertFarmExists(
  id: number | null | undefined,
  client: Client | null = null
) {
  if (id == null) return;
  if (!(await exists(client, "farms", id))) {
    throw new AppError(422, "Farm not found", { farmId: id });
  }
}

export async function assertShopExists(
  id: number | null | undefined,
  client: Client | null = null
) {
  if (id == null) return;
  if (!(await exists(client, "shops", id))) {
    throw new AppError(422, "Shop not found", { shopId: id });
  }
}

export async function assertBirdTypeExists(
  id: number | null | undefined,
  client: Client | null = null
) {
  if (id == null) return;
  if (!(await exists(client, "bird_types", id))) {
    throw new AppError(422, "Bird type not found", { birdTypeId: id });
  }
}

export async function assertTripExists(
  id: number | null | undefined,
  client: Client | null = null
) {
  if (id == null) return;
  if (!(await exists(client, "trips", id, "AND COALESCE(deleted, FALSE) = FALSE"))) {
    throw new AppError(404, `Trip ${id} not found`);
  }
}

export async function validateTripForeignKeys(
  body: {
    vehicleId?: number | null;
    driverId?: number | null;
    supervisorId?: number | null;
    sourceFarmId?: number | null;
    farmBirdTypeId?: number | null;
    deliveries?: Array<{ shopId?: number | null; birdTypeId?: number | null }>;
  },
  client: Client | null = null
) {
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

export async function resolveEmployeeNames(
  client: Client,
  names: string[],
  role: "helper" | "loader"
): Promise<Array<{ employeeId: number | null; employeeName: string }>> {
  const resolved: Array<{ employeeId: number | null; employeeName: string }> = [];
  for (const name of names) {
    if (!name?.trim()) continue;
    const result = await client.query<{ id: number }>(
      `SELECT id FROM employees WHERE employee_name = $1 AND status = 'Active' LIMIT 1`,
      [name.trim()]
    );
    resolved.push({
      employeeId: result.rowCount ? result.rows[0].id : null,
      employeeName: name.trim(),
    });
  }
  return resolved;
}
