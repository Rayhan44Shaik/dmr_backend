/**
 * Vehicle Trips — Step 2 (Farm Loading) only.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { getJson, postJson, startApp, type TestApp } from "./helpers/app.js";
import { applySchema, shutdownTestEnv, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });
const baseUrl = app.baseUrl;

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");

after(async () => {
  await shutdownTestEnv({ app, testDb, pool });
});

let seq = 0;
async function seed() {
  seq += 1;
  const n = String(seq).padStart(3, "0");
  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: `S2V${n}`,
    vehicleType: "Lorry",
    noOfBoxes: 40,
    birdCapacity: 1000,
    capacityKg: 2000,
    engineNumber: `S2E${n}`,
    chassisNumber: `S2C${n}`,
    status: "Active",
  });
  const driver = await mastersService.upsertEmployee({
    employeeName: `S2 Driver ${n}`,
    department: "Driver",
    role: "Driver",
    phoneNumber: `8100000${n}`,
    licenseNumber: `S2DL${n}`,
    salary: 18000,
    status: "Active",
  });
  const supervisor = await mastersService.upsertEmployee({
    employeeName: `S2 Supervisor ${n}`,
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: `8200000${n}`,
    salary: 24000,
    status: "Active",
  });
  const helper = await mastersService.upsertEmployee({
    employeeName: `S2 Helper ${n}`,
    department: "Helper",
    role: "Helper",
    phoneNumber: `8300000${n}`,
    salary: 12000,
    status: "Active",
  });
  const loader = await mastersService.upsertEmployee({
    employeeName: `S2 Loader ${n}`,
    department: "Loader",
    role: "Loader",
    phoneNumber: `8400000${n}`,
    salary: 12000,
    status: "Active",
  });
  const farm = await mastersService.upsertFarm({
    farmName: `S2 Farm ${n}`,
    ownerName: "Owner",
    supervisorName: "Farm Super",
    phoneNumber: `8500000${n}`,
    village: "Guntur",
    address: `Farm Master Address ${n}`,
    capacity: 5000,
    status: "Active",
  });
  return { vehicle, driver, supervisor, helper, loader, farm };
}

async function startTrip(extra: Record<string, unknown> = {}) {
  const m = await seed();
  const tripDate = extra.tripDate ?? `2026-10-${String((seq % 28) + 1).padStart(2, "0")}`;
  const res = await postJson(baseUrl, "/api/trips/steps/start", {
    tripDate,
    vehicleId: m.vehicle.id,
    vehicleNo: m.vehicle.vehicleNumber,
    driverId: m.driver.id,
    driverName: m.driver.employeeName,
    supervisorId: m.supervisor.id,
    supervisorName: m.supervisor.employeeName,
    helpers: [m.helper.employeeName],
    loaders: [m.loader.employeeName],
    openingMeter: extra.openingMeter === undefined ? 50000 : extra.openingMeter,
    advanceAmount: 0,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { ...m, trip: res.body };
}

function farmBody(m: Awaited<ReturnType<typeof startTrip>>, extra: Record<string, unknown> = {}) {
  return {
    sourceFarmId: m.farm.id,
    sourceFarm: m.farm.farmName,
    farmAddress: extra.farmAddress === undefined ? m.farm.address : extra.farmAddress,
    destMeter: extra.destMeter === undefined ? 50001 : extra.destMeter,
    pickupTolls: extra.pickupTolls === undefined ? 0 : extra.pickupTolls,
    avgBirdWeight: extra.avgBirdWeight === undefined ? 2.1 : extra.avgBirdWeight,
    remarks: extra.remarks ?? "",
    ...extra,
  };
}

describe("Step 2 farm loading", () => {
  it("partial save allows missing farm address and mandatory fields, does not timestamp or submit", async () => {
    const m = await startTrip();
    const save = await postJson(baseUrl, `/api/trips/${m.trip.id}/steps/farm`, {
      mode: "save",
      sourceFarmId: m.farm.id,
      sourceFarm: m.farm.farmName,
      farmAddress: "",
      destMeter: null,
      pickupTolls: 0,
      avgBirdWeight: null,
    });
    assert.equal(save.status, 200, JSON.stringify(save.body));
    assert.equal(save.body.farmStepSubmitted, false);
    assert.equal(save.body.reachedTime, null);
    assert.equal("farmCompletedTrips" in save.body, false);

    const again = await getJson(baseUrl, `/api/trips/${m.trip.id}`);
    assert.equal(again.status, 200);
    assert.equal(again.body.sourceFarmId, m.farm.id);
    assert.equal(again.body.farmStepSubmitted, false);
    assert.equal(again.body.reachedTime, null);
    assert.equal(again.body.tripNo, m.trip.tripNo);
  });

  it("save retry after a failed payload still keeps previously saved farm fields", async () => {
    const m = await startTrip();
    const first = await postJson(baseUrl, `/api/trips/${m.trip.id}/steps/farm`, {
      mode: "save",
      sourceFarmId: m.farm.id,
      sourceFarm: m.farm.farmName,
      farmAddress: m.farm.address,
      destMeter: 50010,
      pickupTolls: 2,
    });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const retry = await postJson(baseUrl, `/api/trips/${m.trip.id}/steps/farm`, {
      mode: "save",
      sourceFarmId: m.farm.id,
      destMeter: 50011,
    });
    assert.equal(retry.status, 200, JSON.stringify(retry.body));
    assert.equal(retry.body.farmAddress, m.farm.address);
    assert.equal(retry.body.destMeter, 50011);
    assert.equal(retry.body.farmStepSubmitted, false);
  });

  it("rejects farm meter below and equal to start meter; accepts strictly greater", async () => {
    const m = await startTrip({ openingMeter: 50000 });
    const below = await postJson(baseUrl, `/api/trips/${m.trip.id}/steps/farm`, {
      mode: "submit",
      ...farmBody(m, { destMeter: 49999 }),
    });
    assert.equal(below.status, 422);
    const equal = await postJson(baseUrl, `/api/trips/${m.trip.id}/steps/farm`, {
      mode: "submit",
      ...farmBody(m, { destMeter: 50000 }),
    });
    assert.equal(equal.status, 422);
    const ok = await postJson(baseUrl, `/api/trips/${m.trip.id}/steps/farm`, {
      mode: "submit",
      ...farmBody(m, { destMeter: 50001 }),
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.destMeter, 50001);
  });

  it("accepts toll 0, normalizes negative tolls to 0, remarks optional", async () => {
    const m = await startTrip();
    const res = await postJson(baseUrl, `/api/trips/${m.trip.id}/steps/farm`, {
      mode: "submit",
      ...farmBody(m, { pickupTolls: -4, remarks: "" }),
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.pickupTolls, 0);
  });

  it("first submit captures server NOW() and ignores client reachedTime; save never timestamps", async () => {
    const m = await startTrip();
    const saved = await postJson(baseUrl, `/api/trips/${m.trip.id}/steps/farm`, {
      mode: "save",
      ...farmBody(m),
      reachedTime: "1999-01-01T00:00:00.000Z",
    });
    assert.equal(saved.body.reachedTime, null);
    assert.equal(saved.body.farmStepSubmitted, false);

    const submitted = await postJson(baseUrl, `/api/trips/${m.trip.id}/steps/farm`, {
      mode: "submit",
      ...farmBody(m),
      reachedTime: "1999-01-01T00:00:00.000Z",
    });
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
    assert.equal(submitted.body.farmStepSubmitted, true);
    assert.ok(submitted.body.reachedTime);
    assert.notEqual(String(submitted.body.reachedTime).slice(0, 10), "1999-01-01");
    const original = submitted.body.reachedTime;
    const tripNo = submitted.body.tripNo;

    const updated = await postJson(baseUrl, `/api/trips/${m.trip.id}/steps/farm`, {
      mode: "submit",
      ...farmBody(m, { destMeter: 50020, remarks: "updated" }),
      reachedTime: "2001-01-01T00:00:00.000Z",
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.farmStepSubmitted, true);
    assert.equal(String(updated.body.reachedTime), String(original));
    assert.equal(updated.body.tripNo, tripNo);
    assert.equal(updated.body.id, m.trip.id);
  });

  it("blocks Step 3 before Step 2 submit and allows it after", async () => {
    const m = await startTrip();
    const blocked = await postJson(baseUrl, `/api/trips/${m.trip.id}/steps/pickup`, {
      mode: "submit",
      boxDetails: [{ boxNo: 1, birds: 10, weight: 20 }],
      dcPhotoKey: "photo-1",
    });
    assert.equal(blocked.status, 422);
    assert.match(String(blocked.body.message ?? blocked.body.error ?? JSON.stringify(blocked.body)), /Farm Loading|farm/i);

    const farm = await postJson(baseUrl, `/api/trips/${m.trip.id}/steps/farm`, {
      mode: "submit",
      ...farmBody(m),
    });
    assert.equal(farm.status, 200);
    const pickup = await postJson(baseUrl, `/api/trips/${m.trip.id}/steps/pickup`, {
      mode: "submit",
      boxDetails: [{ boxNo: 1, birds: 10, weight: 20 }],
      dcPhotoKey: "photo-1",
    });
    assert.doesNotMatch(
      String(pickup.body?.message ?? ""),
      /Complete Step 2|Farm Loading before/i
    );
  });

  it("persists GPS only when provided and never invents coordinates", async () => {
    const m = await startTrip();
    const without = await postJson(baseUrl, `/api/trips/${m.trip.id}/steps/farm`, {
      mode: "save",
      ...farmBody(m),
    });
    assert.equal(without.body.farmGpsLat, null);
    assert.equal(without.body.farmGpsLon, null);

    const withGps = await postJson(baseUrl, `/api/trips/${m.trip.id}/steps/farm`, {
      mode: "save",
      ...farmBody(m),
      farmGpsLat: 16.3067,
      farmGpsLon: 80.4365,
      farmGpsAccuracy: 12.5,
      farmGpsTime: "2026-08-17T10:00:00.000Z",
    });
    assert.equal(withGps.status, 200, JSON.stringify(withGps.body));
    assert.equal(Number(withGps.body.farmGpsLat), 16.3067);
    assert.equal(Number(withGps.body.farmGpsLon), 80.4365);

    const keep = await postJson(baseUrl, `/api/trips/${m.trip.id}/steps/farm`, {
      mode: "save",
      ...farmBody(m, { destMeter: 50030 }),
    });
    assert.equal(Number(keep.body.farmGpsLat), 16.3067);
  });

  it("submit requires farm address and never returns Completed Trips / Average Rate fields", async () => {
    const m = await startTrip();
    const missing = await postJson(baseUrl, `/api/trips/${m.trip.id}/steps/farm`, {
      mode: "submit",
      ...farmBody(m, { farmAddress: "" }),
    });
    assert.equal(missing.status, 422);
    const ok = await postJson(baseUrl, `/api/trips/${m.trip.id}/steps/farm`, {
      mode: "submit",
      ...farmBody(m),
      farmCompletedTrips: 99,
      farmRate: 120,
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal("farmCompletedTrips" in ok.body, false);
  });
});
