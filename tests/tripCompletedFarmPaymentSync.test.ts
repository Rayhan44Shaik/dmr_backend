/**
 * Trip-completed → Farm Payment sync contract (real PostgreSQL engine, no mocks).
 *
 * The moment a trip moves to Completed through the real completion path
 * (wizard steps + updateStatus), it must be visible to every surface the
 * Farm Payment page reads — with the farm's own figures — without any extra
 * step, delay, or manual refresh on the backend side:
 *   • farmPaymentsService.list() (the ledger Account Analysis charges)
 *   • tripsService.list() (GET /api/trips — the page's trip source, carrying
 *     exactly the fields its eligibility rule reads)
 *   • HTTP GET /api/accounts/farm-payments (the page's actual fetch)
 *
 * The ledger row keeps the persisted pickup figures (total_birds /
 * dc_weight): even with in-transit mortality the farm is shown what it
 * supplied, not the delivery-side net.
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
const { farmPaymentsService } = await import("../src/services/farmPaymentsService.js");

after(async () => {
  await app.close();
  await testDb.close();
  await pool.end();
});

let seq = 0;

async function completeTrip(tag: string) {
  seq += 1;
  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: `FPV${String(seq).padStart(4, "0")}`,
    vehicleType: "Lorry",
    noOfBoxes: 20,
    birdCapacity: 2000,
    capacityKg: 3000,
    engineNumber: `FPENG${seq}`,
    chassisNumber: `FPCHS${seq}`,
    status: "Active",
  });
  const driver = await mastersService.upsertEmployee({
    employeeName: `FP Driver ${seq}`,
    department: "Driver",
    role: "Driver",
    phoneNumber: `981101${String(seq).padStart(4, "0")}`,
    licenseNumber: `FPDL${seq}`,
    salary: 18000,
    status: "Active",
  });
  const supervisor = await mastersService.upsertEmployee({
    employeeName: `FP Sup ${seq}`,
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: `982201${String(seq).padStart(4, "0")}`,
    salary: 24000,
    status: "Active",
  });
  const farm = await mastersService.upsertFarm({
    farmName: `FP Farm ${seq}`,
    ownerName: "Owner",
    supervisorName: "Sup",
    phoneNumber: `985501${String(seq).padStart(4, "0")}`,
    village: "V",
    address: "A",
    capacity: 30000,
    status: "Active",
  });
  const birdType = await mastersService.upsertBirdType({
    birdType: `FP Bird ${seq}`,
    averageWeight: 2.5,
    description: "farm-payment sync test",
    status: "Active",
  });
  const shop = await mastersService.upsertShop({
    shopName: `FP Shop ${seq}`,
    ownerName: "Owner",
    phoneNumber: `987701${String(seq).padStart(4, "0")}`,
    village: "V",
    address: "A",
    status: "Active",
    openingBalance: 0,
  });

  const trip = await tripsService.save(null, {
    tripDate: "2026-09-22",
    vehicleId: vehicle.id,
    driverId: driver.id,
    supervisorId: supervisor.id,
    openingMeter: 7000 + seq * 1000,
    advanceAmount: 100,
    startStepSubmitted: true,
    status: "Draft",
  });
  await tripsService.submitStep(trip.id, "farm", {
    legIndex: 1,
    sourceFarmId: farm.id,
    sourceFarm: farm.farmName,
    destMeter: 7050 + seq * 1000,
    pickupTolls: 0,
    avgBirdWeight: 2.5,
    farmBirdTypeId: birdType.id,
    farmBirdType: birdType.birdType,
    farmGpsLat: 12.97,
    farmGpsLon: 77.59,
    farmGpsAccuracy: 10,
    farmGpsTime: new Date().toISOString(),
  });
  // 40 birds lifted at the farm; 2 die in transit — the farm-payment figure
  // must stay 40 (supplied), never the delivered 38.
  await tripsService.submitStep(trip.id, "pickup", {
    legIndex: 1,
    boxDetails: [{ boxNo: 1, birds: 40, weight: 80 }],
    dcPhotoKey: `fp-${trip.id}-${tag}`,
    dcPhotoMime: "image/jpeg",
    dcPhotoData: `data:image/jpeg;base64,${"A".repeat(80)}`,
  });
  await tripsService.submitStep(trip.id, "deliveries", {
    legIndex: 1,
    deliveries: [{
      id: 0,
      clientKey: `fp-${trip.id}-${tag}`,
      shopId: shop.id,
      shopName: shop.shopName,
      birdTypeId: birdType.id,
      birdType: birdType.birdType,
      birds: 38,
      weight: 76,
      mortality: 2,
      mortKg: 4,
      rate: 100,
      amount: 7600,
      remarks: "",
      deliveryMode: "box",
      selectedBoxIds: [1],
      boxNo: 1,
    }],
  });
  await tripsService.submitStep(trip.id, "expenses", { closingMeter: 7200 + seq * 1000, meals: 50 });
  await tripsService.updateStatus(trip.id, { status: "Completed", approvedBy: "test" });
  return { trip, farm };
}

describe("completed trip → farm payment sync", () => {
  it("a just-completed trip is immediately in the ledger with farm figures", async () => {
    const { trip, farm } = await completeTrip("ledger");
    const listed = await farmPaymentsService.list();
    assert.ok(Array.isArray(listed), "default list stays a bare array");
    const row = listed.find((r) => r.tripId === trip.id);
    assert.ok(row, "completed trip present in the farm-payments ledger");
    assert.equal(row.farmName, farm.farmName);
    assert.equal(row.totalBirds, 40, "farm birds supplied, not delivered net of mortality");
    assert.equal(row.dcWeight, 80);
    assert.equal(row.status, "Pending");
  });

  it("the same trip is immediately in GET /api/trips with the page's eligibility fields", async () => {
    const { trip } = await completeTrip("list");
    const listed = await tripsService.list({});
    const row = (listed as { id: number; status: string; deleted: boolean; pickupStepSubmitted: boolean }[])
      .find((t) => t.id === trip.id);
    assert.ok(row, "completed trip present in GET /api/trips");
    assert.equal(row.status, "Completed");
    assert.equal(row.deleted, false);
    assert.equal(row.pickupStepSubmitted, true);
  });

  it("HTTP GET /api/accounts/farm-payments serves the just-completed trip", async () => {
    const { trip, farm } = await completeTrip("http");
    const { status, body } = await getJson(baseUrl, "/api/accounts/farm-payments");
    assert.equal(status, 200);
    const rows = Array.isArray(body) ? body : body.data;
    const row = rows.find((r: { tripId: number }) => r.tripId === trip.id);
    assert.ok(row, "completed trip served by the page's own endpoint");
    assert.equal(row.farmName, farm.farmName);
    assert.equal(row.totalBirds, 40);
    assert.equal(row.dcWeight, 80);
  });

  it("a soft-deleted completed trip leaves the ledger immediately", async () => {
    const { trip } = await completeTrip("delete");
    const before = await farmPaymentsService.list();
    assert.ok(Array.isArray(before), "default list stays a bare array");
    assert.ok(before.some((r) => r.tripId === trip.id));
    await tripsService.softDelete(trip.id, "farm-payment sync test cleanup");
    const after = await farmPaymentsService.list();
    assert.ok(Array.isArray(after), "default list stays a bare array");
    assert.ok(!after.some((r) => r.tripId === trip.id), "deleted trip gone from the ledger");
  });
});
