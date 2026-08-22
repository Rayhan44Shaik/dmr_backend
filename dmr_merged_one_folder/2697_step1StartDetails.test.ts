/**
 * Vehicle Trips — Step 1 (Start Details) only.
 * Uses the real Express app + PGlite. Does not exercise Steps 2–5.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { getJson, postJson, startApp, type TestApp } from "./helpers/app.js";
import { applySchema, shutdownTestEnv, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });
const baseUrl = app.baseUrl;

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");
const { tripsService } = await import("../src/services/tripsService.js");

after(async () => {
  await shutdownTestEnv({ app, testDb, pool });
});

let seq = 0;
async function seedCrew() {
  seq += 1;
  const n = String(seq).padStart(3, "0");
  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: `S1V${n}`,
    vehicleType: "Lorry",
    noOfBoxes: 40,
    birdCapacity: 1000,
    capacityKg: 2000,
    engineNumber: `S1E${n}`,
    chassisNumber: `S1C${n}`,
    status: "Active",
  });
  const driver = await mastersService.upsertEmployee({
    employeeName: `S1 Driver ${n}`,
    department: "Driver",
    role: "Driver",
    phoneNumber: `9100000${n}`,
    licenseNumber: `S1DL${n}`,
    salary: 18000,
    status: "Active",
  });
  const supervisor = await mastersService.upsertEmployee({
    employeeName: `S1 Supervisor ${n}`,
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: `9200000${n}`,
    salary: 24000,
    status: "Active",
  });
  const helper = await mastersService.upsertEmployee({
    employeeName: `S1 Helper ${n}`,
    department: "Helper",
    role: "Helper",
    phoneNumber: `9300000${n}`,
    salary: 12000,
    status: "Active",
  });
  const loader = await mastersService.upsertEmployee({
    employeeName: `S1 Loader ${n}`,
    department: "Loader",
    role: "Loader",
    phoneNumber: `9400000${n}`,
    salary: 12000,
    status: "Active",
  });
  return { vehicle, driver, supervisor, helper, loader };
}

function startPayload(
  m: Awaited<ReturnType<typeof seedCrew>>,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    tripDate: extra.tripDate ?? "2026-08-17",
    vehicleId: m.vehicle.id,
    vehicleNo: m.vehicle.vehicleNumber,
    driverId: m.driver.id,
    driverName: m.driver.employeeName,
    supervisorId: m.supervisor.id,
    supervisorName: m.supervisor.employeeName,
    helpers: [m.helper.employeeName],
    loaders: [m.loader.employeeName],
    openingMeter: extra.openingMeter === undefined ? 1000 : extra.openingMeter,
    advanceAmount: extra.advanceAmount === undefined ? 500 : extra.advanceAmount,
    startTime: extra.startTime ?? "1999-01-01T00:00:00.000Z",
    ...extra,
  };
}

describe("Step 1 start details", () => {
  it("first submit creates a trip, numbers TR-YYYYMMDD-001, captures server NOW(), ignores client startTime", async () => {
    const m = await seedCrew();
    const res = await postJson(baseUrl, "/api/trips/steps/start", startPayload(m, { tripDate: "2026-09-30" }));
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.tripNo, "TR-20260930-001");
    assert.equal(res.body.startStepSubmitted, true);
    assert.ok(res.body.startTime, "server start time required");
    assert.notEqual(String(res.body.startTime).slice(0, 10), "1999-01-01");
    assert.equal(res.body.openingMeter, 1000);
    assert.equal(res.body.advanceAmount, 500);
  });

  it("empty KM and Advance persist as NULL", async () => {
    const m = await seedCrew();
    const res = await postJson(
      baseUrl,
      "/api/trips/steps/start",
      startPayload(m, { openingMeter: null, advanceAmount: null, tripDate: "2026-08-18" })
    );
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.openingMeter, null);
    assert.equal(res.body.advanceAmount, null);

    const db = await pool.query(
      `SELECT opening_meter, advance_amount FROM trips WHERE id = $1`,
      [res.body.id]
    );
    assert.equal(db.rows[0].opening_meter, null);
    assert.equal(db.rows[0].advance_amount, null);
  });

  it("explicit Advance 0 is persisted as 0, not NULL", async () => {
    const m = await seedCrew();
    const res = await postJson(
      baseUrl,
      "/api/trips/steps/start",
      startPayload(m, { advanceAmount: 0, openingMeter: null, tripDate: "2026-08-19" })
    );
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.advanceAmount, 0);
  });

  it("first trip for a vehicle accepts KM = 0; empty KM stays NULL", async () => {
    const m = await seedCrew();
    const zero = await postJson(
      baseUrl,
      "/api/trips/steps/start",
      startPayload(m, { openingMeter: 0, tripDate: "2026-08-20" })
    );
    assert.equal(zero.status, 201, JSON.stringify(zero.body));
    assert.equal(zero.body.openingMeter, 0);

    const m2 = await seedCrew();
    const empty = await postJson(
      baseUrl,
      "/api/trips/steps/start",
      startPayload(m2, { openingMeter: null, tripDate: "2026-08-20" })
    );
    assert.equal(empty.status, 201, JSON.stringify(empty.body));
    assert.equal(empty.body.openingMeter, null);
  });

  it("existing vehicle KM = 0 is rejected by the meter ledger", async () => {
    const m = await seedCrew();
    const first = await postJson(
      baseUrl,
      "/api/trips/steps/start",
      startPayload(m, { openingMeter: 4100, tripDate: "2026-08-21" })
    );
    assert.equal(first.status, 201, JSON.stringify(first.body));
    // Release occupancy (Draft lock) while keeping the meter event (not deleted).
    await pool.query(`UPDATE trips SET status = 'Pending' WHERE id = $1`, [first.body.id]);

    const m2 = await seedCrew();
    const second = await postJson(
      baseUrl,
      "/api/trips/steps/start",
      {
        ...startPayload(m2, { openingMeter: 0, tripDate: "2026-08-21" }),
        vehicleId: m.vehicle.id,
        vehicleNo: m.vehicle.vehicleNumber,
      }
    );
    assert.equal(second.status, 422, JSON.stringify(second.body));
    assert.match(String(second.body.error), /cannot be less than|latest recorded reading/i);
  });

  it("negative Advance is rejected", async () => {
    const m = await seedCrew();
    const res = await postJson(
      baseUrl,
      "/api/trips/steps/start",
      startPayload(m, { advanceAmount: -10 })
    );
    assert.equal(res.status, 422);
  });

  it("missing required resources are rejected", async () => {
    const m = await seedCrew();
    const base = startPayload(m);
    const cases: Array<[string, Record<string, unknown>]> = [
      ["vehicle", { ...base, vehicleId: null }],
      ["driver", { ...base, driverId: null }],
      ["supervisor", { ...base, supervisorId: null }],
      ["helper", { ...base, helpers: [] }],
      ["loader", { ...base, loaders: [] }],
    ];
    for (const [, body] of cases) {
      const res = await postJson(baseUrl, "/api/trips/steps/start", body);
      assert.equal(res.status, 422, JSON.stringify(res.body));
    }
  });

  it("occupied resources are rejected; edit self-exclusion allows the same trip's resources", async () => {
    const m = await seedCrew();
    const first = await postJson(baseUrl, "/api/trips/steps/start", startPayload(m, { tripDate: "2026-08-22" }));
    assert.equal(first.status, 201, JSON.stringify(first.body));

    const m2 = await seedCrew();
    const clash = await postJson(
      baseUrl,
      "/api/trips/steps/start",
      {
        ...startPayload(m2, { tripDate: "2026-08-22" }),
        vehicleId: m.vehicle.id,
        vehicleNo: m.vehicle.vehicleNumber,
      }
    );
    assert.equal(clash.status, 409, JSON.stringify(clash.body));
    assert.match(String(clash.body.error), /already assigned/i);

    const startTime = first.body.startTime;
    const tripNo = first.body.tripNo;
    const update = await postJson(
      baseUrl,
      `/api/trips/${first.body.id}/steps/start`,
      {
        ...startPayload(m, { openingMeter: 1200, advanceAmount: 50, tripDate: "2026-08-22" }),
        startStepSubmitted: true,
        startTime: "1999-01-01T00:00:00.000Z",
      }
    );
    assert.equal(update.status, 200, JSON.stringify(update.body));
    assert.equal(update.body.tripNo, tripNo);
    assert.equal(update.body.startStepSubmitted, true);
    assert.equal(update.body.startTime, startTime);
    assert.equal(update.body.openingMeter, 1200);
  });

  it("second Step 1 submit for the same vehicle is rejected (occupancy)", async () => {
    const m = await seedCrew();
    const m2 = await seedCrew();
    const a = startPayload(m, { tripDate: "2026-08-23" });
    const b = {
      ...startPayload(m2, { tripDate: "2026-08-23" }),
      vehicleId: m.vehicle.id,
      vehicleNo: m.vehicle.vehicleNumber,
    };
    // PGlite/pg-gateway does not serialize pg_advisory_xact_lock across pool
    // clients, so overlapping Promise.all can insert two drafts. Production
    // PostgreSQL serializes via lockTripResourcesForWrite. This assertion still
    // requires occupancy: the second save must fail after the first commits.
    const first = await tripsService.save(null, { ...a, startStepSubmitted: true, status: "Draft" });
    await assert.rejects(
      tripsService.save(null, { ...b, startStepSubmitted: true, status: "Draft" }),
      /already assigned/
    );
    const created = await pool.query(
      `SELECT COUNT(*)::int AS n FROM trips WHERE vehicle_id = $1 AND start_step_submitted = TRUE AND deleted = FALSE`,
      [m.vehicle.id]
    );
    assert.equal(created.rows[0].n, 1);
    assert.ok(first.id);
  });

  it("retry after success does not create a duplicate trip number", async () => {
    const m = await seedCrew();
    const first = await postJson(baseUrl, "/api/trips/steps/start", startPayload(m, { tripDate: "2026-08-24" }));
    assert.equal(first.status, 201);
    const retry = await postJson(baseUrl, "/api/trips/steps/start", startPayload(m, { tripDate: "2026-08-24" }));
    assert.equal(retry.status, 409);
    const rows = await pool.query(
      `SELECT COUNT(*)::int AS n FROM trips WHERE trip_no = $1`,
      [first.body.tripNo]
    );
    assert.equal(rows.rows[0].n, 1);
  });

  it("GET by id restores Step 1 fields including null KM/Advance", async () => {
    const m = await seedCrew();
    const created = await postJson(
      baseUrl,
      "/api/trips/steps/start",
      startPayload(m, { openingMeter: null, advanceAmount: null, tripDate: "2026-08-25" })
    );
    const loaded = await getJson(baseUrl, `/api/trips/${created.body.id}`);
    assert.equal(loaded.status, 200);
    assert.equal(loaded.body.tripNo, created.body.tripNo);
    assert.equal(loaded.body.startTime, created.body.startTime);
    assert.equal(loaded.body.startStepSubmitted, true);
    assert.equal(loaded.body.openingMeter, null);
    assert.equal(loaded.body.advanceAmount, null);
    assert.equal(loaded.body.farmStepSubmitted, false);
  });

  it("available-resources excludes occupied vehicle and includes it when tripId is self", async () => {
    const m = await seedCrew();
    const created = await postJson(baseUrl, "/api/trips/steps/start", startPayload(m, { tripDate: "2026-08-26" }));
    const open = await getJson(baseUrl, "/api/trips/available-resources");
    assert.equal(
      open.body.vehicles.some((v: { id: number }) => v.id === m.vehicle.id),
      false
    );
    const self = await getJson(baseUrl, `/api/trips/available-resources?tripId=${created.body.id}`);
    assert.equal(
      self.body.vehicles.some((v: { id: number }) => v.id === m.vehicle.id),
      true
    );
  });

  it("Step 2 cannot be submitted before Step 1", async () => {
    const draft = await postJson(baseUrl, "/api/trips", { tripDate: "2026-08-28" });
    assert.equal(draft.status, 201, JSON.stringify(draft.body));
    assert.equal(draft.body.startStepSubmitted, false);
    const farm = await postJson(baseUrl, `/api/trips/${draft.body.id}/steps/farm`, {
      sourceFarmId: 1,
      destMeter: 5000,
      avgBirdWeight: 2.2,
    });
    assert.equal(farm.status, 422, JSON.stringify(farm.body));
    assert.match(String(farm.body.error), /Step 1|Trip Header|before/i);
  });
});
