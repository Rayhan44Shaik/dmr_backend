/**
 * Recent Trips lifecycle: Draft until Step 5, unique trip numbers, GET hydration.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { getJson, patchJson, postJson, startApp, type TestApp } from "./helpers/app.js";
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
async function seedThroughStep4() {
  seq += 1;
  const n = String(seq).padStart(3, "0");
  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: `LCV${n}`,
    vehicleType: "Lorry",
    noOfBoxes: 40,
    birdCapacity: 1000,
    capacityKg: 2000,
    engineNumber: `LCE${n}`,
    chassisNumber: `LCC${n}`,
    status: "Active",
  });
  const driver = await mastersService.upsertEmployee({
    employeeName: `LC Driver ${n}`,
    department: "Driver",
    role: "Driver",
    phoneNumber: `6100000${n}`,
    licenseNumber: `LCDL${n}`,
    salary: 18000,
    status: "Active",
  });
  const supervisor = await mastersService.upsertEmployee({
    employeeName: `LC Supervisor ${n}`,
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: `6200000${n}`,
    salary: 24000,
    status: "Active",
  });
  const farm = await mastersService.upsertFarm({
    farmName: `LC Farm ${n}`,
    ownerName: "Owner",
    supervisorName: "Farm Super",
    phoneNumber: `6500000${n}`,
    village: "Guntur",
    address: `Farm Address ${n}`,
    capacity: 5000,
    status: "Active",
  });
  const shop = await mastersService.upsertShop({
    shopName: `LC Shop ${n}`,
    ownerName: "Owner",
    phoneNumber: `6600000${n}`,
    village: "Village",
    status: "Active",
  });
  const tripDate = `2026-07-${String((seq % 27) + 1).padStart(2, "0")}`;
  const start = await tripsService.save(null, {
    tripDate,
    status: "Draft",
    vehicleId: vehicle.id,
    vehicleNo: vehicle.vehicleNumber,
    driverId: driver.id,
    driverName: driver.employeeName,
    supervisorId: supervisor.id,
    supervisorName: supervisor.employeeName,
    openingMeter: 50000,
    advanceAmount: 2000,
    startStepSubmitted: true,
  } as Record<string, unknown>);
  const farmSaved = await tripsService.save(start.id, {
    sourceFarmId: farm.id,
    sourceFarm: farm.farmName,
    destMeter: 50100,
    farmAddress: farm.address,
    pickupTolls: 0,
    avgBirdWeight: 2.1,
    farmStepSubmitted: true,
  } as Record<string, unknown>);
  const pickup = await tripsService.save(farmSaved.id, {
    boxDetails: [{ boxNo: 1, birds: 40, weight: 80 }],
    pickupStepSubmitted: true,
  } as Record<string, unknown>);
  const trip = await tripsService.save(pickup.id, {
    deliveryStepSubmitted: true,
    deliveries: [
      {
        id: 0,
        shopId: shop.id,
        shopName: shop.shopName,
        birds: 40,
        weight: 80,
        mortality: 0,
        mortKg: 0,
        selectedBoxIds: [1],
        deliveryMode: "box",
        remarks: "",
        birdType: "",
        birdTypeId: null,
        rate: null,
        amount: 0,
      },
    ],
    replaceDeliveries: true,
  } as Record<string, unknown>);
  return { trip, startNo: start.tripNo };
}

describe("Trip number uniqueness", () => {
  it("enforces a unique constraint on trip_no", async () => {
    await pool.query(
      `INSERT INTO trips (trip_no, trip_date, status) VALUES ('TR-20260115-001', '2026-01-15', 'Draft')`
    );
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO trips (trip_no, trip_date, status) VALUES ('TR-20260115-001', '2026-01-15', 'Draft')`
        ),
      (err: { code?: string }) => err.code === "23505"
    );
  });

  it("does not reuse a deleted trip number", async () => {
    const a = await tripsService.createDraft({ tripDate: "2026-01-16" });
    const b = await tripsService.createDraft({ tripDate: "2026-01-16" });
    await tripsService.softDelete(a.id, "lifecycle uniqueness");
    const c = await tripsService.createDraft({ tripDate: "2026-01-16" });
    assert.notEqual(c.tripNo, a.tripNo);
    assert.equal(c.tripNo, "TR-20260116-003");
    assert.equal(b.tripNo, "TR-20260116-002");
    const stillThere = await pool.query(`SELECT trip_no, deleted FROM trips WHERE id = $1`, [a.id]);
    assert.equal(stillThere.rows[0].trip_no, a.tripNo);
    assert.equal(stillThere.rows[0].deleted, true);
  });

  it("concurrent creates cannot share a trip number", async () => {
    const results = await Promise.allSettled([
      tripsService.createDraft({ tripDate: "2026-01-17" }),
      tripsService.createDraft({ tripDate: "2026-01-17" }),
    ]);
    const created = results
      .filter((r): r is PromiseFulfilledResult<{ tripNo: string }> => r.status === "fulfilled")
      .map((r) => r.value.tripNo);
    assert.equal(new Set(created).size, created.length);
    const rows = await pool.query<{ trip_no: string }>(
      `SELECT trip_no FROM trips WHERE trip_date = '2026-01-17'`
    );
    const nos = rows.rows.map((r) => r.trip_no);
    assert.equal(new Set(nos).size, nos.length);
  });

  it("keeps the same trip number through Steps 1–5", async () => {
    const { trip, startNo } = await seedThroughStep4();
    assert.equal(trip.tripNo, startNo);
    assert.equal(trip.status, "Draft");
    const submitted = await postJson(baseUrl, `/api/trips/${trip.id}/steps/expenses`, {
      endMeter: 50400,
      destinationTolls: 0,
    });
    assert.equal(submitted.status, 200, submitted.body?.error || JSON.stringify(submitted.body));
    assert.equal(submitted.body.tripNo, startNo);
    assert.equal(submitted.body.status, "Pending");
  });
});

describe("Draft → Pending lifecycle", () => {
  it("cannot become Pending while Step 5 is unsubmitted", async () => {
    const { trip } = await seedThroughStep4();
    assert.equal(trip.status, "Draft");
    assert.equal(Boolean(trip.expensesStepSubmitted), false);
    const forced = await tripsService.save(trip.id, { status: "Pending" } as Record<string, unknown>);
    assert.equal(forced.status, "Draft");
    assert.equal(Boolean(forced.expensesStepSubmitted), false);
  });

  it("Step 5 submit atomically sets submitted flag, timestamp, and Pending", async () => {
    const { trip } = await seedThroughStep4();
    const ok = await postJson(baseUrl, `/api/trips/${trip.id}/steps/expenses`, {
      endMeter: 50400,
      destinationTolls: 0,
      meals: 100,
    });
    assert.equal(ok.status, 200, ok.body?.error || JSON.stringify(ok.body));
    assert.equal(ok.body.expensesStepSubmitted, true);
    assert.equal(ok.body.endStepSubmitted, true);
    assert.ok(ok.body.expensesStepSubmittedAt);
    assert.equal(ok.body.status, "Pending");

    const loaded = await getJson(baseUrl, `/api/trips/${trip.id}`);
    assert.equal(loaded.status, 200);
    assert.equal(loaded.body.status, "Pending");
    assert.equal(loaded.body.expensesStepSubmitted, true);
    assert.equal(loaded.body.endStepSubmitted, true);
    assert.equal(loaded.body.startStepSubmitted, true);
    assert.equal(loaded.body.farmStepSubmitted, true);
    assert.equal(loaded.body.pickupStepSubmitted, true);
    assert.equal(loaded.body.deliveryStepSubmitted, true);
    assert.equal(loaded.body.expensesStepSubmittedAt, ok.body.expensesStepSubmittedAt);

    const refreshed = await getJson(baseUrl, `/api/trips/${trip.id}`);
    assert.equal(refreshed.body.status, loaded.body.status);
    assert.equal(refreshed.body.expensesStepSubmitted, true);
    assert.equal(refreshed.body.deliveryStepSubmitted, true);
    assert.equal(refreshed.body.expensesStepSubmittedAt, loaded.body.expensesStepSubmittedAt);
  });

  it("PATCH cannot move Draft to Pending without Step 5", async () => {
    const { trip } = await seedThroughStep4();
    const denied = await patchJson(baseUrl, `/api/trips/${trip.id}/status`, { status: "Pending" });
    assert.equal(denied.status, 422);
    const loaded = await getJson(baseUrl, `/api/trips/${trip.id}`);
    assert.equal(loaded.body.status, "Draft");
  });

  it("PATCH Pending to Completed persists and survives refresh", async () => {
    const { trip } = await seedThroughStep4();
    const submitted = await postJson(baseUrl, `/api/trips/${trip.id}/steps/expenses`, {
      endMeter: 50400,
      destinationTolls: 0,
    });
    assert.equal(submitted.body.status, "Pending");
    const approved = await patchJson(baseUrl, `/api/trips/${trip.id}/status`, {
      status: "Completed",
      approvedBy: "Auditor",
    });
    assert.equal(approved.status, 200, approved.body?.error || JSON.stringify(approved.body));
    assert.equal(approved.body.status, "Completed");
    const loaded = await getJson(baseUrl, `/api/trips/${trip.id}`);
    assert.equal(loaded.body.status, "Completed");
    const again = await getJson(baseUrl, `/api/trips/${trip.id}`);
    assert.equal(again.body.status, "Completed");
  });
});

describe("Deleted tab listing", () => {
  it("GET /trips hides deleted unless includeDeleted=true", async () => {
    const created = await tripsService.createDraft({ tripDate: "2026-01-18" });
    await tripsService.softDelete(created.id, "list-deleted-tab");
    const hidden = await getJson(baseUrl, "/api/trips");
    assert.equal(hidden.status, 200);
    assert.equal(
      (hidden.body as Array<{ id: number }>).some((t) => t.id === created.id),
      false
    );
    const shown = await getJson(baseUrl, "/api/trips?includeDeleted=true");
    assert.equal(shown.status, 200);
    const row = (shown.body as Array<{ id: number; deleted?: boolean; status?: string }>).find(
      (t) => t.id === created.id
    );
    assert.ok(row);
    assert.equal(row?.deleted, true);
    assert.equal(row?.status, "Deleted");
  });
});
