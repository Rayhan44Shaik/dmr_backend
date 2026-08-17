/**
 * Vehicle Trips — Step 3 (Pickup / Loading) only.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { getJson, postJson, startApp, type TestApp } from "./helpers/app.js";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });
const baseUrl = app.baseUrl;

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");

after(async () => {
  await app.close();
  await testDb.close();
  await pool.end();
});

const PHOTO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
const PHOTO2 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let seq = 0;
async function seed(boxes = 4) {
  seq += 1;
  const n = String(seq).padStart(3, "0");
  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: `S3V${n}`,
    vehicleType: "Lorry",
    noOfBoxes: boxes,
    birdCapacity: 1000,
    capacityKg: 2000,
    engineNumber: `S3E${n}`,
    chassisNumber: `S3C${n}`,
    status: "Active",
  });
  const driver = await mastersService.upsertEmployee({
    employeeName: `S3 Driver ${n}`,
    department: "Driver",
    role: "Driver",
    phoneNumber: `7100000${n}`,
    licenseNumber: `S3DL${n}`,
    salary: 18000,
    status: "Active",
  });
  const supervisor = await mastersService.upsertEmployee({
    employeeName: `S3 Supervisor ${n}`,
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: `7200000${n}`,
    salary: 24000,
    status: "Active",
  });
  const helper = await mastersService.upsertEmployee({
    employeeName: `S3 Helper ${n}`,
    department: "Helper",
    role: "Helper",
    phoneNumber: `7300000${n}`,
    salary: 12000,
    status: "Active",
  });
  const loader = await mastersService.upsertEmployee({
    employeeName: `S3 Loader ${n}`,
    department: "Loader",
    role: "Loader",
    phoneNumber: `7400000${n}`,
    salary: 12000,
    status: "Active",
  });
  const farm = await mastersService.upsertFarm({
    farmName: `S3 Farm ${n}`,
    ownerName: "Owner",
    supervisorName: "Farm Super",
    phoneNumber: `7500000${n}`,
    village: "Guntur",
    address: `Farm Address ${n}`,
    capacity: 5000,
    status: "Active",
  });
  return { vehicle, driver, supervisor, helper, loader, farm };
}

async function startAndFarm(boxes = 4) {
  const m = await seed(boxes);
  const tripDate = `2026-11-${String((seq % 28) + 1).padStart(2, "0")}`;
  const start = await postJson(baseUrl, "/api/trips/steps/start", {
    tripDate,
    vehicleId: m.vehicle.id,
    vehicleNo: m.vehicle.vehicleNumber,
    driverId: m.driver.id,
    driverName: m.driver.employeeName,
    supervisorId: m.supervisor.id,
    supervisorName: m.supervisor.employeeName,
    helpers: [m.helper.employeeName],
    loaders: [m.loader.employeeName],
    openingMeter: 40000,
    advanceAmount: 0,
  });
  assert.equal(start.status, 201, JSON.stringify(start.body));
  const farm = await postJson(baseUrl, `/api/trips/${start.body.id}/steps/farm`, {
    sourceFarmId: m.farm.id,
    sourceFarm: m.farm.farmName,
    farmAddress: m.farm.address,
    destMeter: 40010,
    pickupTolls: 0,
    avgBirdWeight: 2.1,
  });
  assert.equal(farm.status, 200, JSON.stringify(farm.body));
  return { ...m, trip: farm.body };
}

function pickupUrl(id: number) {
  return `/api/trips/${id}/steps/pickup`;
}

describe("Step 3 pickup / loading", () => {
  it("rejects save and submit before Step 2 is submitted", async () => {
    const m = await seed();
    const start = await postJson(baseUrl, "/api/trips/steps/start", {
      tripDate: "2026-11-01",
      vehicleId: m.vehicle.id,
      vehicleNo: m.vehicle.vehicleNumber,
      driverId: m.driver.id,
      driverName: m.driver.employeeName,
      supervisorId: m.supervisor.id,
      supervisorName: m.supervisor.employeeName,
      helpers: [m.helper.employeeName],
      loaders: [m.loader.employeeName],
      openingMeter: 100,
      advanceAmount: 0,
    });
    const save = await postJson(baseUrl, pickupUrl(start.body.id), {
      mode: "save",
      boxDetails: [{ boxNo: 1, birds: 10, weight: 20 }],
    });
    assert.equal(save.status, 422);
    const submit = await postJson(baseUrl, pickupUrl(start.body.id), {
      boxDetails: [{ boxNo: 1, birds: 10, weight: 20 }],
      dcPhotoKey: "k1",
      dcPhotoData: PHOTO,
    });
    assert.equal(submit.status, 422);
  });

  it("allows empty and partial save without timestamp or submit", async () => {
    const m = await startAndFarm();
    const empty = await postJson(baseUrl, pickupUrl(m.trip.id), { mode: "save" });
    assert.equal(empty.status, 200, JSON.stringify(empty.body));
    assert.equal(empty.body.pickupStepSubmitted, false);
    assert.equal(empty.body.pickupLoadTime, null);

    const partial = await postJson(baseUrl, pickupUrl(m.trip.id), {
      mode: "save",
      boxDetails: [{ boxNo: 1, birds: 10, weight: 0 }],
    });
    assert.equal(partial.status, 200, JSON.stringify(partial.body));
    assert.equal(partial.body.pickupStepSubmitted, false);
    assert.equal(partial.body.pickupLoadTime, null);
    assert.equal(partial.body.boxDetails[0].birds, 10);
  });

  it("saves multiple boxes, omits do not delete, refresh hydrates KPI and avg", async () => {
    const m = await startAndFarm();
    const first = await postJson(baseUrl, pickupUrl(m.trip.id), {
      mode: "save",
      boxDetails: [
        { boxNo: 1, birds: 10, weight: 21 },
        { boxNo: 2, birds: 8, weight: 16 },
      ],
    });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.boxDetails.length, 2);
    assert.equal(first.body.totalBirds, 18);
    assert.equal(Number(first.body.boxDetails[0].avgWeight), 2.1);

    const partial = await postJson(baseUrl, pickupUrl(m.trip.id), {
      mode: "save",
      boxDetails: [{ boxNo: 1, birds: 12, weight: 24 }],
    });
    assert.equal(partial.status, 200);
    assert.equal(partial.body.boxDetails.length, 2);
    assert.equal(partial.body.boxDetails[0].birds, 12);
    assert.equal(partial.body.boxDetails[1].birds, 8);

    const again = await getJson(baseUrl, `/api/trips/${m.trip.id}`);
    assert.equal(again.body.boxDetails.length, 2);
    assert.equal(again.body.totalBirds, 20);
    assert.equal(again.body.pickupStepSubmitted, false);
    assert.equal(again.body.tripNo, m.trip.tripNo);
    assert.equal(again.body.id, m.trip.id);
  });

  it("rejects capacity, duplicates, non-sequential, invalid birds/weight on submit", async () => {
    const m = await startAndFarm(4);
    const over = await postJson(baseUrl, pickupUrl(m.trip.id), {
      boxDetails: [
        { boxNo: 1, birds: 1, weight: 1 },
        { boxNo: 2, birds: 1, weight: 1 },
        { boxNo: 3, birds: 1, weight: 1 },
        { boxNo: 4, birds: 1, weight: 1 },
        { boxNo: 5, birds: 1, weight: 1 },
      ],
      dcPhotoKey: "k1",
      dcPhotoData: PHOTO,
    });
    assert.equal(over.status, 422);

    const dup = await postJson(baseUrl, pickupUrl(m.trip.id), {
      boxDetails: [
        { boxNo: 1, birds: 1, weight: 1 },
        { boxNo: 1, birds: 1, weight: 1 },
      ],
      dcPhotoKey: "k1",
      dcPhotoData: PHOTO,
    });
    assert.equal(dup.status, 422);

    const gap = await postJson(baseUrl, pickupUrl(m.trip.id), {
      boxDetails: [
        { boxNo: 1, birds: 1, weight: 1 },
        { boxNo: 3, birds: 1, weight: 1 },
      ],
      dcPhotoKey: "k1",
      dcPhotoData: PHOTO,
    });
    assert.equal(gap.status, 422);

    const birds = await postJson(baseUrl, pickupUrl(m.trip.id), {
      boxDetails: [{ boxNo: 1, birds: 0, weight: 10 }],
      dcPhotoKey: "k1",
      dcPhotoData: PHOTO,
    });
    assert.equal(birds.status, 422);

    const weight = await postJson(baseUrl, pickupUrl(m.trip.id), {
      boxDetails: [{ boxNo: 1, birds: 10, weight: 0 }],
      dcPhotoKey: "k1",
      dcPhotoData: PHOTO,
    });
    assert.equal(weight.status, 422);
  });

  it("rejects fake photo keys and submit without a real photo", async () => {
    const m = await startAndFarm();
    const fake = await postJson(baseUrl, pickupUrl(m.trip.id), {
      boxDetails: [{ boxNo: 1, birds: 10, weight: 20 }],
      dcPhotoKey: "not-a-real-image",
    });
    assert.equal(fake.status, 422);

    const none = await postJson(baseUrl, pickupUrl(m.trip.id), {
      boxDetails: [{ boxNo: 1, birds: 10, weight: 20 }],
    });
    assert.equal(none.status, 422);
  });

  it("saves 0/1/2 photos, deletes persist, submit captures server time and unlocks step 4", async () => {
    const m = await startAndFarm();
    const zero = await postJson(baseUrl, pickupUrl(m.trip.id), {
      mode: "save",
      boxDetails: [{ boxNo: 1, birds: 10, weight: 21 }],
    });
    assert.equal(zero.status, 200);
    assert.equal(zero.body.dcPhotoData ?? null, null);

    const one = await postJson(baseUrl, pickupUrl(m.trip.id), {
      mode: "save",
      boxDetails: [{ boxNo: 1, birds: 10, weight: 21 }],
      dcPhotoKey: "p1",
      dcPhotoMime: "image/png",
      dcPhotoData: PHOTO,
      syncPickupPhotos: true,
    });
    assert.equal(one.status, 200);
    assert.ok(one.body.dcPhotoData);

    const two = await postJson(baseUrl, pickupUrl(m.trip.id), {
      mode: "save",
      boxDetails: [{ boxNo: 1, birds: 10, weight: 21 }],
      dcPhotoKey: "p1",
      dcPhotoData: PHOTO,
      dcPhotoMime: "image/png",
      dcPhotoKey2: "p2",
      dcPhotoData2: PHOTO2,
      dcPhotoMime2: "image/png",
      syncPickupPhotos: true,
    });
    assert.equal(two.status, 200);
    assert.ok(two.body.dcPhotoData);
    assert.ok(two.body.dcPhotoData2);

    const del = await postJson(baseUrl, pickupUrl(m.trip.id), {
      mode: "save",
      dcPhotoKey: "p1",
      dcPhotoData: PHOTO,
      dcPhotoMime: "image/png",
      syncPickupPhotos: true,
    });
    assert.equal(del.status, 200);
    assert.ok(del.body.dcPhotoData);
    assert.equal(del.body.dcPhotoData2 ?? null, null);

    const submitted = await postJson(baseUrl, pickupUrl(m.trip.id), {
      boxDetails: [{ boxNo: 1, birds: 10, weight: 21 }],
      dcPhotoKey: "p1",
      dcPhotoData: PHOTO,
      dcPhotoMime: "image/png",
    });
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
    assert.equal(submitted.body.pickupStepSubmitted, true);
    assert.ok(submitted.body.pickupLoadTime);
    assert.equal(submitted.body.resumeStep, "deliveries");
    assert.equal(submitted.body.id, m.trip.id);
    assert.equal(submitted.body.tripNo, m.trip.tripNo);

    const firstTime = submitted.body.pickupLoadTime;
    const again = await postJson(baseUrl, pickupUrl(m.trip.id), {
      boxDetails: [{ boxNo: 1, birds: 11, weight: 22 }],
      dcPhotoKey: "p1",
      dcPhotoData: PHOTO,
      dcPhotoMime: "image/png",
    });
    assert.equal(again.status, 200);
    assert.equal(again.body.pickupStepSubmitted, true);
    assert.equal(again.body.pickupLoadTime, firstTime);
    assert.equal(again.body.boxDetails[0].birds, 11);
  });

  it("retry submit is idempotent and does not duplicate boxes or photos", async () => {
    const m = await startAndFarm();
    const payload = {
      boxDetails: [{ boxNo: 1, birds: 9, weight: 18 }],
      dcPhotoKey: "same",
      dcPhotoData: PHOTO,
      dcPhotoMime: "image/png",
    };
    const a = await postJson(baseUrl, pickupUrl(m.trip.id), payload);
    const b = await postJson(baseUrl, pickupUrl(m.trip.id), payload);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(b.body.boxDetails.length, 1);
    assert.equal(b.body.pickupLoadTime, a.body.pickupLoadTime);
    const media = await pool.query(`SELECT count(*)::int AS n FROM trip_media WHERE trip_id = $1`, [
      m.trip.id,
    ]);
    assert.equal(media.rows[0].n, 1);
  });
});
