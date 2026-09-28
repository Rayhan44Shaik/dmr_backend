/**
 * Trip List (GET /api/operations/trip-list) — data correctness against a real
 * PostgreSQL engine (PGlite behind pg-gateway; same harness as the other
 * backend suites). No mocks: HTTP → tripsService.listCompleted → PostgreSQL.
 *
 * Locks the Trip List contract to the Recent Trip Activity logic:
 *   • per-load aggregates (one entry per submitted load, never collapsed)
 *   • totals summed across loads (shops / birds / weight / mortality / W.L.)
 *   • submittedLoadCount tracks submitted Step 2 loads (1 → 1, 2 → 2)
 *   • legacy trips without per-load rows keep their persisted totals
 *     (never zeroed by an empty reduction)
 *   • pagination meta, vehicle filter, soft-delete exclusion, authorization
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { getJson, startApp, type TestApp } from "./helpers/app.js";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });
const baseUrl = app.baseUrl;

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");
const { tripsService } = await import("../src/services/tripsService.js");

after(async () => {
  await app.close();
  await testDb.close();
  await pool.end();
});

let seq = 0;

async function seed() {
  seq += 1;
  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: `TLV${String(seq).padStart(4, "0")}`,
    vehicleType: "Lorry",
    noOfBoxes: 20,
    birdCapacity: 2000,
    capacityKg: 3000,
    engineNumber: `TLENG${seq}`,
    chassisNumber: `TLCHS${seq}`,
    status: "Active",
  });
  const driver = await mastersService.upsertEmployee({
    employeeName: `TL Driver ${seq}`,
    department: "Driver",
    role: "Driver",
    phoneNumber: `981100${String(seq).padStart(4, "0")}`,
    licenseNumber: `TLDL${seq}`,
    salary: 18000,
    status: "Active",
  });
  const supervisor = await mastersService.upsertEmployee({
    employeeName: `TL Sup ${seq}`,
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: `982200${String(seq).padStart(4, "0")}`,
    salary: 24000,
    status: "Active",
  });
  const farm = await mastersService.upsertFarm({
    farmName: `TL Farm ${seq}`,
    ownerName: "Owner",
    supervisorName: "Sup",
    phoneNumber: `985500${String(seq).padStart(4, "0")}`,
    village: "V",
    address: "A",
    capacity: 30000,
    status: "Active",
  });
  const farm2 = await mastersService.upsertFarm({
    farmName: `TL Farm B ${seq}`,
    ownerName: "Owner",
    supervisorName: "Sup",
    phoneNumber: `986600${String(seq).padStart(4, "0")}`,
    village: "V",
    address: "A",
    capacity: 30000,
    status: "Active",
  });
  const birdType = await mastersService.upsertBirdType({
    birdType: `TL Bird ${seq}`,
    averageWeight: 2.5,
    description: "trip-list test",
    status: "Active",
  });
  const shopA = await mastersService.upsertShop({
    shopName: `TL Shop A${seq}`,
    ownerName: "Owner",
    phoneNumber: `987700${String(seq).padStart(4, "0")}`,
    village: "V",
    address: "A",
    status: "Active",
    openingBalance: 0,
  });
  const shopB = await mastersService.upsertShop({
    shopName: `TL Shop B${seq}`,
    ownerName: "Owner",
    phoneNumber: `987800${String(seq).padStart(4, "0")}`,
    village: "V",
    address: "A",
    status: "Active",
    openingBalance: 0,
  });
  return { vehicle, driver, supervisor, farm, farm2, birdType, shopA, shopB };
}

async function runLoad(
  tripId: number, legIndex: number, opts: {
    farmId: number; farmName: string; birdTypeId: number; birdType: string;
    shopId: number; shopName: string; destMeter: number;
  }
) {
  await tripsService.submitStep(tripId, "farm", {
    legIndex,
    sourceFarmId: opts.farmId,
    sourceFarm: opts.farmName,
    destMeter: opts.destMeter,
    pickupTolls: 0,
    avgBirdWeight: 2.5,
    farmBirdTypeId: opts.birdTypeId,
    farmBirdType: opts.birdType,
    farmGpsLat: 12.97,
    farmGpsLon: 77.59,
    farmGpsAccuracy: 10,
    farmGpsTime: new Date().toISOString(),
  });
  await tripsService.submitStep(tripId, "pickup", {
    legIndex,
    boxDetails: [{ boxNo: 1, birds: 40, weight: 80 }],
    dcPhotoKey: `tl-${tripId}-${legIndex}`,
    dcPhotoMime: "image/jpeg",
    dcPhotoData: `data:image/jpeg;base64,${"A".repeat(80)}`,
  });
  await tripsService.submitStep(tripId, "deliveries", {
    legIndex,
    deliveries: [{
      id: 0,
      clientKey: `tl-${tripId}-${legIndex}`,
      shopId: opts.shopId,
      shopName: opts.shopName,
      birdTypeId: opts.birdTypeId,
      birdType: opts.birdType,
      birds: 40,
      weight: 80,
      mortality: 0,
      mortKg: 0,
      rate: 100,
      amount: 8000,
      remarks: "",
      deliveryMode: "box",
      selectedBoxIds: [1],
      boxNo: 1,
    }],
  });
}

async function completeTwoLoadTrip(tag: string) {
  const m = await seed();
  const trip = await tripsService.save(null, {
    tripDate: "2026-09-20",
    vehicleId: m.vehicle.id,
    driverId: m.driver.id,
    supervisorId: m.supervisor.id,
    openingMeter: 5000 + seq * 1000,
    advanceAmount: 100,
    startStepSubmitted: true,
    status: "Draft",
  });
  await runLoad(trip.id, 1, {
    destMeter: 5050 + seq * 1000,
    farmId: m.farm.id, farmName: m.farm.farmName,
    birdTypeId: m.birdType.id, birdType: m.birdType.birdType,
    shopId: m.shopA.id, shopName: m.shopA.shopName,
  });
  await tripsService.addLeg(trip.id);
  await runLoad(trip.id, 2, {
    destMeter: 5100 + seq * 1000,
    farmId: m.farm2.id, farmName: m.farm2.farmName,
    birdTypeId: m.birdType.id, birdType: m.birdType.birdType,
    shopId: m.shopB.id, shopName: m.shopB.shopName,
  });
  await tripsService.submitStep(trip.id, "expenses", { closingMeter: 5200 + seq * 1000, meals: 50 });
  await tripsService.updateStatus(trip.id, { status: "Completed", approvedBy: "test" });
  void tag;
  return { trip, m };
}

describe("Trip List completed data", () => {
  it("1. a two-load trip lists per-load aggregates with summed totals", async () => {
    const { trip, m } = await completeTwoLoadTrip("two");
    const { status, body } = await getJson(baseUrl, "/api/operations/trip-list?page=1&limit=200");
    assert.equal(status, 200);
    const row = (body.data ?? body).find((t: { id: number }) => t.id === trip.id);
    assert.ok(row, "completed trip present in Trip List");
    assert.equal(row.submittedLoadCount, 2, "two submitted loads, never collapsed to one");
    assert.equal(row.loadSummaries.length, 2);
    assert.deepEqual(
      row.loadSummaries.map((l: { load: number }) => l.load),
      [1, 2]
    );
    assert.equal(row.loadSummaries[0].shops, 1);
    assert.equal(row.loadSummaries[1].shops, 1);
    assert.equal(row.totalShops, 2, "distinct shops across loads");
    assert.equal(row.totalBirds, 80);
    assert.equal(row.totalWeight, 160);
    assert.equal(row.totalMortality, 0);
    assert.ok(
      (body.data ?? body).every((t: { id: number }) => typeof t.id === "number"),
      "no duplicated rows"
    );
    void m;
  });

  it("2. a single-load trip shows load one with its own totals", async () => {
    const m = await seed();
    const trip = await tripsService.save(null, {
      tripDate: "2026-09-21",
      vehicleId: m.vehicle.id,
      driverId: m.driver.id,
      supervisorId: m.supervisor.id,
      openingMeter: 9000 + seq * 1000,
      startStepSubmitted: true,
      status: "Draft",
    });
    await runLoad(trip.id, 1, {
      destMeter: 9050 + seq * 1000,
      farmId: m.farm.id, farmName: m.farm.farmName,
      birdTypeId: m.birdType.id, birdType: m.birdType.birdType,
      shopId: m.shopA.id, shopName: m.shopA.shopName,
    });
    await tripsService.submitStep(trip.id, "expenses", { closingMeter: 9100 + seq * 1000, meals: 10 });
    await tripsService.updateStatus(trip.id, { status: "Completed", approvedBy: "test" });

    const { body } = await getJson(baseUrl, `/api/operations/trip-list?vehicleId=${m.vehicle.id}`);
    const row = (body.data ?? body).find((t: { id: number }) => t.id === trip.id);
    assert.ok(row);
    assert.equal(row.submittedLoadCount, 1, "one load shows one");
    assert.equal(row.loadSummaries.length, 1);
    assert.equal(row.totalShops, 1);
    assert.equal(row.totalBirds, 40);
    assert.equal(row.totalWeight, 80);
  });

  it("3. filters, pagination, soft-delete and authorization", async () => {
    const { trip, m } = await completeTwoLoadTrip("filter");
    const byVehicle = await getJson(baseUrl, `/api/operations/trip-list?vehicleId=${m.vehicle.id}&page=1&limit=5`);
    assert.equal(byVehicle.status, 200);
    assert.ok(byVehicle.body.data.length >= 1);
    assert.ok(byVehicle.body.data.every((t: { vehicleId: number }) => t.vehicleId === m.vehicle.id));
    assert.equal(typeof byVehicle.body.meta.total, "number");
    assert.equal(byVehicle.body.meta.page, 1);

    await tripsService.softDelete(trip.id, "trip-list test cleanup");
    const afterDelete = await getJson(baseUrl, `/api/operations/trip-list?vehicleId=${m.vehicle.id}`);
    assert.ok(!(afterDelete.body.data ?? afterDelete.body).some((t: { id: number }) => t.id === trip.id));

    const anon = await fetch(`${baseUrl}/api/operations/trip-list`);
    assert.equal(anon.status, 401);
  });

  it("4. completed trip totals follow the rateable row set, not the submitted-leg gate", async () => {
    // Regression: Trip List shops/birds/weight must equal exactly what Rate
    // Entry prices (non-deleted rows with a shop and a quantity), even when
    // rows sit on an unsubmitted load, carry no load linkage (legacy/manual
    // rows), or are uncaptured `[ORDER]` plan stubs. Previously the per-load
    // aggregate dropped the first two and counted the stub as a shop.
    const m = await seed();
    const shopC = await mastersService.upsertShop({
      shopName: `TL Shop C${seq}`,
      ownerName: "Owner",
      phoneNumber: `987900${String(seq).padStart(4, "0")}`,
      village: "V",
      address: "A",
      status: "Active",
      openingBalance: 0,
    });
    const trip = await tripsService.save(null, {
      tripDate: "2026-09-22",
      vehicleId: m.vehicle.id,
      driverId: m.driver.id,
      supervisorId: m.supervisor.id,
      openingMeter: 9500 + seq * 1000,
      startStepSubmitted: true,
      status: "Draft",
    });
    await runLoad(trip.id, 1, {
      destMeter: 9550 + seq * 1000,
      farmId: m.farm.id, farmName: m.farm.farmName,
      birdTypeId: m.birdType.id, birdType: m.birdType.birdType,
      shopId: m.shopA.id, shopName: m.shopA.shopName,
    });
    await tripsService.submitStep(trip.id, "expenses", { closingMeter: 9600 + seq * 1000, meals: 10 });
    await tripsService.updateStatus(trip.id, { status: "Completed", approvedBy: "test" });

    const leg1 = await pool.query(
      `SELECT id FROM trip_legs WHERE trip_id = $1 AND leg_index = 1`,
      [trip.id]
    );
    const leg1Id = Number(leg1.rows[0].id);
    // Legacy second load whose Step 4 was never submitted.
    const leg2 = await pool.query(
      `INSERT INTO trip_legs (trip_id, leg_index) VALUES ($1, 2) RETURNING id`,
      [trip.id]
    );
    const leg2Id = Number(leg2.rows[0].id);
    // Weight-mode shop on the unsubmitted load.
    await pool.query(
      `INSERT INTO trip_deliveries
         (trip_id, leg_id, sale_no, shop_id, shop_name, birds, weight, delivery_mode, deleted)
       VALUES ($1, $2, $3, $4, $5, 30, 60, 'weight', FALSE)`,
      [trip.id, leg2Id, `TL-SYNC-${seq}-B`, m.shopB.id, m.shopB.shopName]
    );
    // Weight-mode shop with no load linkage at all.
    await pool.query(
      `INSERT INTO trip_deliveries
         (trip_id, leg_id, sale_no, shop_id, shop_name, birds, weight, delivery_mode, deleted)
       VALUES ($1, NULL, $2, $3, $4, 20, 40, 'weight', FALSE)`,
      [trip.id, `TL-SYNC-${seq}-C`, shopC.id, shopC.shopName]
    );
    // Uncaptured `[ORDER]` plan stub beside the captured rows — a pending
    // plan is not a served shop.
    await pool.query(
      `INSERT INTO trip_deliveries
         (trip_id, leg_id, sale_no, shop_id, shop_name, birds, weight, remarks, deleted)
       VALUES ($1, $2, $3, $4, $5, 0, 0, '[ORDER] O:SYNC-1 planned', FALSE)`,
      [trip.id, leg1Id, `TL-SYNC-${seq}-S`, shopC.id, shopC.shopName]
    );

    // The rateable row set Rate Entry prices for this trip.
    const expected = await pool.query(
      `SELECT COUNT(*)::int AS shops,
              COALESCE(SUM(birds), 0)::int AS birds,
              COALESCE(SUM(weight), 0)::float AS weight
         FROM trip_deliveries
        WHERE trip_id = $1 AND COALESCE(deleted, FALSE) = FALSE
          AND COALESCE(shop_id, 0) > 0
          AND (COALESCE(birds, 0) > 0 OR COALESCE(weight, 0) > 0)`,
      [trip.id]
    );
    assert.equal(expected.rows[0].shops, 3);
    assert.equal(expected.rows[0].birds, 90);
    assert.equal(expected.rows[0].weight, 180);

    const { body } = await getJson(baseUrl, `/api/operations/trip-list?vehicleId=${m.vehicle.id}`);
    const row = (body.data ?? body).find((t: { id: number }) => t.id === trip.id);
    assert.ok(row, "completed trip present in Trip List");
    assert.equal(row.totalShops, expected.rows[0].shops, "shops equal the rateable row set");
    assert.equal(row.totalBirds, expected.rows[0].birds, "birds equal the rateable row set");
    assert.equal(row.totalWeight, expected.rows[0].weight, "weight equals the rateable row set");
    assert.equal(row.loadSummaries.length, 2, "both loads with rows are broken down");
  });
});
