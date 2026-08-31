import { query } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { mastersService } from "./mastersService.js";
import { tripsService } from "./tripsService.js";
import type { MobileAuthContext } from "./mobileAuthService.js";

type MobileOperationRequest = {
  operationId?: string;
  clientDraftId?: string;
  expectedVersion?: number | null;
  mode?: "save" | "submit";
  payload?: Record<string, unknown>;
};

function asOperation(body: Record<string, unknown>): MobileOperationRequest {
  return {
    operationId: typeof body.operationId === "string" ? body.operationId : undefined,
    clientDraftId: typeof body.clientDraftId === "string" ? body.clientDraftId : undefined,
    expectedVersion:
      body.expectedVersion == null || body.expectedVersion === ""
        ? null
        : Number(body.expectedVersion),
    mode: body.mode === "save" ? "save" : "submit",
    payload:
      body.payload && typeof body.payload === "object"
        ? (body.payload as Record<string, unknown>)
        : body,
  };
}

async function replayed(operationId: string | undefined) {
  if (!operationId) return null;
  const existing = await query(
    `SELECT response FROM mobile_operations WHERE operation_id = $1`,
    [operationId]
  );
  if (!existing.rowCount) return null;
  return { ...(existing.rows[0].response as Record<string, unknown>), replayed: true };
}

async function storeAck(
  operationId: string | undefined,
  accountId: number,
  tripId: number,
  response: Record<string, unknown>
) {
  if (!operationId) return response;
  await query(
    `INSERT INTO mobile_operations (operation_id, account_id, trip_id, response)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (operation_id) DO NOTHING`,
    [operationId, accountId, tripId, JSON.stringify(response)]
  );
  return response;
}

async function withVersion(trip: Record<string, unknown>) {
  const id = Number(trip.id);
  const row = await query<{ version: number }>(`SELECT version FROM trips WHERE id = $1`, [id]);
  return { ...trip, version: Number(row.rows[0]?.version ?? 1) };
}

async function assertOwnership(tripId: number, employeeId: number) {
  const row = await query(
    `SELECT supervisor_id FROM trips WHERE id = $1 AND deleted = FALSE`,
    [tripId]
  );
  if (!row.rowCount) throw new AppError(404, `Trip ${tripId} not found`);
  if (Number(row.rows[0].supervisor_id) !== employeeId) {
    throw new AppError(403, "You are not authorized for this Trip.");
  }
}

async function bumpVersion(tripId: number, expectedVersion: number | null | undefined) {
  if (expectedVersion != null && Number.isFinite(expectedVersion)) {
    const updated = await query(
      `UPDATE trips SET version = version + 1 WHERE id = $1 AND version = $2 RETURNING version`,
      [tripId, expectedVersion]
    );
    if (!updated.rowCount) {
      throw new AppError(409, "This Trip was changed from another client.");
    }
    return Number(updated.rows[0].version);
  }
  const updated = await query(
    `UPDATE trips SET version = version + 1 WHERE id = $1 RETURNING version`,
    [tripId]
  );
  return Number(updated.rows[0]?.version ?? 1);
}

function acknowledgement(operationId: string, trip: Record<string, unknown>, replayed = false) {
  return {
    acknowledged: true as const,
    operationId,
    trip,
    serverTime: new Date().toISOString(),
    replayed,
  };
}

export const mobileTripsService = {
  async bootstrap(auth: MobileAuthContext) {
    const [employees, vehicles, farms, shops, birdTypes] = await Promise.all([
      mastersService.listEmployees(),
      mastersService.listVehicles(),
      mastersService.listFarms(),
      mastersService.listShops(),
      mastersService.listBirdTypes(),
    ]);
    return {
      supervisor: auth.profile,
      employees: employees.map((e) => ({
        id: e.id,
        employeeName: e.employeeName,
        department: e.department,
        role: e.role,
        status: e.status,
      })),
      vehicles: vehicles.map((v) => ({
        id: v.id,
        vehicleNo: v.vehicleNo,
        vehicleNumber: v.vehicleNumber,
        noOfBoxes: v.noOfBoxes,
        status: v.status,
      })),
      farms: farms.map((f) => ({
        id: f.id,
        farmNo: f.farmNo,
        farmName: f.farmName,
        address: f.address,
        village: f.village,
        status: f.status,
      })),
      shops: shops.map((s) => ({
        id: s.id,
        shopNo: s.shopNo,
        shopName: s.shopName,
        city: s.city,
        status: s.status,
      })),
      birdTypes: birdTypes.map((b) => ({
        id: b.id,
        birdTypeNo: b.birdTypeNo,
        birdType: b.birdType,
        averageWeight: b.averageWeight,
        status: b.status,
      })),
    };
  },

  async listDrafts(auth: MobileAuthContext) {
    const trips = await tripsService.list({
      status: "Draft",
      supervisorId: auth.employeeId,
      full: true,
    });
    if (!Array.isArray(trips)) return [];
    return Promise.all(
      trips.map((trip) => withVersion(trip as unknown as Record<string, unknown>))
    );
  },

  async getTrip(auth: MobileAuthContext, tripId: number) {
    await assertOwnership(tripId, auth.employeeId);
    return withVersion((await tripsService.getById(tripId)) as unknown as Record<string, unknown>);
  },

  async applyStart(auth: MobileAuthContext, body: Record<string, unknown>) {
    const op = asOperation(body);
    const cached = await replayed(op.operationId);
    if (cached) return cached;

    const payload = {
      ...(op.payload ?? {}),
      mode: op.mode,
      status: "Draft",
      startStepSubmitted: true,
      supervisorId: auth.employeeId,
      supervisorName: auth.profile.employeeName,
    };
    delete (payload as { startTime?: unknown }).startTime;

    const saved = (await tripsService.save(null, payload)) as unknown as Record<string, unknown>;
    const trip = await withVersion(saved);
    const ack = acknowledgement(op.operationId ?? `start-${trip.id}`, trip);
    return storeAck(op.operationId, auth.accountId, Number(trip.id), ack);
  },

  async applyStep(
    auth: MobileAuthContext,
    tripId: number,
    step: "start" | "farm" | "pickup" | "deliveries" | "expenses",
    body: Record<string, unknown>
  ) {
    const op = asOperation(body);
    const cached = await replayed(op.operationId);
    if (cached) return cached;

    await assertOwnership(tripId, auth.employeeId);
    await bumpVersion(tripId, op.expectedVersion);

    const payload = {
      ...(op.payload ?? {}),
      mode: op.mode,
      supervisorId: auth.employeeId,
      supervisorName: auth.profile.employeeName,
    };

    const saved = (await tripsService.submitStep(tripId, step, payload)) as unknown as Record<
      string,
      unknown
    >;
    const trip = await withVersion(saved);
    const ack = acknowledgement(op.operationId ?? `${step}-${tripId}`, trip);
    return storeAck(op.operationId, auth.accountId, tripId, ack);
  },
};
