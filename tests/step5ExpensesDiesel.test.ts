/**
 * Trip Entry Step 5 — general expenses + diesel lifecycle.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import {
  deleteJson,
  getJson,
  patchJson,
  postJson,
  startApp,
  type TestApp,
} from "./helpers/app.js";
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

const BILL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let seq = 0;
async function seed() {
  seq += 1;
  const n = String(seq).padStart(3, "0");
  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: `S5V${n}`,
    vehicleType: "Lorry",
    noOfBoxes: 40,
    birdCapacity: 1000,
    capacityKg: 2000,
    engineNumber: `S5E${n}`,
    chassisNumber: `S5C${n}`,
    status: "Active",
  });
  const driver = await mastersService.upsertEmployee({
    employeeName: `S5 Driver ${n}`,
    department: "Driver",
    role: "Driver",
    phoneNumber: `7100000${n}`,
    licenseNumber: `S5DL${n}`,
    salary: 18000,
    status: "Active",
  });
  const supervisor = await mastersService.upsertEmployee({
    employeeName: `S5 Supervisor ${n}`,
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: `7200000${n}`,
    salary: 24000,
    status: "Active",
  });
  const farm = await mastersService.upsertFarm({
    farmName: `S5 Farm ${n}`,
    ownerName: "Owner",
    supervisorName: "Farm Super",
    phoneNumber: `7500000${n}`,
    village: "Guntur",
    address: `Farm Address ${n}`,
    capacity: 5000,
    status: "Active",
  });
  const shop = await mastersService.upsertShop({
    shopName: `S5 Shop ${n}`,
    ownerName: "Owner",
    phoneNumber: `7600000${n}`,
    village: "Village",
    email: `s5shop${n}@example.com`,
    status: "Active",
  });
  const trip = await tripsService.save(null, {
    tripDate: `2026-08-${String((seq % 27) + 1).padStart(2, "0")}`,
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
    sourceFarmId: farm.id,
    sourceFarm: farm.farmName,
    destMeter: 50100,
    farmAddress: farm.address,
    pickupTolls: 0,
    avgBirdWeight: 2.1,
    farmStepSubmitted: true,
    boxDetails: [{ boxNo: 1, birds: 40, weight: 80 }],
    pickupStepSubmitted: true,
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
  return { trip, vehicle };
}

function dieselBody(overrides: Record<string, unknown> = {}) {
  return {
    clientKey: `ck-${Date.now()}-${Math.random()}`,
    litres: 10,
    rate: 95,
    meter: 50200,
    bunkName: "HP Bunk, Guntur",
    gpsLat: 16.3,
    gpsLon: 80.4,
    gpsAccuracy: 8,
    gpsCapturedAt: "2026-08-17T10:00:00.000Z",
    imageData: BILL,
    imageName: "bill.png",
    ...overrides,
  };
}

describe("Step 5 general expenses", () => {
  it("saves partial expenses, keeps other values, rejects negatives, allows zero", async () => {
    const { trip } = await seed();
    const url = `/api/trips/${trip.id}/steps/expenses`;
    const first = await postJson(baseUrl, url, { mode: "save", meals: 500, loading: 300 });
    assert.equal(first.status, 200);
    assert.equal(first.body.meals, 500);
    assert.equal(first.body.expensesStepSubmitted, false);
    assert.equal(first.body.expensesStepSubmittedAt, null);
    assert.equal(first.body.vehicleNo, trip.vehicleNo);
    assert.equal(Number(first.body.advanceAmount), 2000);

    const second = await postJson(baseUrl, url, { mode: "save", meals: 550 });
    assert.equal(second.status, 200);
    assert.equal(Number(second.body.meals), 550);
    assert.equal(Number(second.body.loading), 300);

    const neg = await postJson(baseUrl, url, { mode: "save", meals: -1 });
    assert.equal(neg.status, 422);

    const zero = await postJson(baseUrl, url, { mode: "save", othersRC: 0, meals: 550 });
    assert.equal(zero.status, 200);
    assert.equal(Number(zero.body.othersRC), 0);

    const overwriteAdvance = await postJson(baseUrl, url, {
      mode: "save",
      advanceAmount: 9999,
      vehicleNo: "HACK",
      meals: 550,
    });
    assert.equal(Number(overwriteAdvance.body.advanceAmount), 2000);
    assert.equal(overwriteAdvance.body.vehicleNo, trip.vehicleNo);

    const loaded = await getJson(baseUrl, `/api/trips/${trip.id}`);
    assert.equal(Number(loaded.body.meals), 550);
    assert.equal(Number(loaded.body.loading), 300);
  });
});

describe("Step 5 diesel lifecycle", () => {
  it("rejects invalid diesel submits and persists a valid bill", async () => {
    const { trip } = await seed();
    const url = `/api/trips/${trip.id}/diesel`;

    assert.equal((await postJson(baseUrl, url, dieselBody({ litres: 0 }))).status, 422);
    assert.equal((await postJson(baseUrl, url, dieselBody({ litres: -1 }))).status, 422);
    assert.equal((await postJson(baseUrl, url, dieselBody({ rate: 0 }))).status, 422);
    assert.equal((await postJson(baseUrl, url, dieselBody({ rate: -5 }))).status, 422);
    assert.equal((await postJson(baseUrl, url, dieselBody({ meter: 50100 }))).status, 422);
    assert.equal((await postJson(baseUrl, url, dieselBody({ meter: 50050 }))).status, 422);
    assert.equal((await postJson(baseUrl, url, dieselBody({ gpsLat: 0, gpsLon: 0 }))).status, 422);
    assert.equal((await postJson(baseUrl, url, dieselBody({ imageData: "fake-key" }))).status, 422);
    assert.equal((await postJson(baseUrl, url, dieselBody({ amount: 1 }))).status, 422);

    const ok = await postJson(baseUrl, url, dieselBody({ clientKey: "diesel-a" }));
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal(Number(ok.body.dieselAmount1), 950);
    assert.equal(ok.body.dieselSubmitted1, true);
    assert.ok(ok.body.dieselSubmittedAt1);
    assert.equal(ok.body.dieselBunk1, "HP Bunk, Guntur");
    assert.notEqual(ok.body.dieselBunk1, "16.3000, 80.4000");
    const firstTs = ok.body.dieselSubmittedAt1;

    const retry = await postJson(baseUrl, url, dieselBody({ clientKey: "diesel-a", litres: 10, rate: 95 }));
    assert.equal(retry.status, 201);
    const diesel = retry.body.dieselEntries ?? [];
    assert.equal(diesel.length, 1);
    assert.equal(retry.body.dieselSubmittedAt1, firstTs);

    const loaded = await getJson(baseUrl, `/api/trips/${trip.id}`);
    assert.equal(Number(loaded.body.dieselLtr1), 10);
    assert.ok(String(loaded.body.dieselImage1).startsWith("data:image/"));
  });

  it("validates meter progression, edit timestamp, delete, and multiple bills", async () => {
    const { trip } = await seed();
    const url = `/api/trips/${trip.id}/diesel`;
    const a = await postJson(baseUrl, url, dieselBody({ clientKey: "d1", meter: 50200 }));
    assert.equal(a.status, 201);
    const id1 = a.body.dieselId1;
    const ts1 = a.body.dieselSubmittedAt1;

    const rollback = await postJson(baseUrl, url, dieselBody({ clientKey: "d2", meter: 50150 }));
    assert.equal(rollback.status, 422);

    const b = await postJson(baseUrl, url, dieselBody({ clientKey: "d2", meter: 50300, litres: 5, rate: 100 }));
    assert.equal(b.status, 201);
    assert.equal(Number(b.body.dieselAmount2), 500);

    const edited = await patchJson(baseUrl, `/api/trips/${trip.id}/diesel/${id1}`, {
      ...dieselBody({ litres: 12, rate: 95, meter: 50210 }),
    });
    assert.equal(edited.status, 200);
    assert.equal(Number(edited.body.dieselLtr1), 12);
    assert.equal(Number(edited.body.dieselAmount1), 1140);
    assert.equal(edited.body.dieselSubmittedAt1, ts1);

    const gone = await deleteJson(baseUrl, `/api/trips/${trip.id}/diesel/${edited.body.dieselId2}`);
    assert.equal(gone.status, 200);
    const after = await getJson(baseUrl, `/api/trips/${trip.id}`);
    assert.equal(after.body.dieselLtr2 ?? null, null);
    assert.equal(Number(after.body.dieselLtr1), 12);
  });
});

describe("Step 5 final submit", () => {
  it("enforces Step 4, end meter, destination tolls, mileage, and server timestamp", async () => {
    const { trip, vehicle } = await seed();
    const exp = `/api/trips/${trip.id}/steps/expenses`;

    const early = await postJson(baseUrl, exp, { endMeter: 51000, destinationTolls: 0 });
    // Step 4 is already submitted in seed; empty diesel is allowed.
    // End meter must beat farm 50100.
    const tooLow = await postJson(baseUrl, exp, { endMeter: 50050, destinationTolls: 0 });
    assert.equal(tooLow.status, 422);

    const negToll = await postJson(baseUrl, exp, { endMeter: 51000, destinationTolls: -1 });
    assert.equal(negToll.status, 422);

    await postJson(baseUrl, `/api/trips/${trip.id}/diesel`, dieselBody({ litres: 40, rate: 95, meter: 50200 }));

    const ok = await postJson(baseUrl, exp, { endMeter: 50400, destinationTolls: 0, meals: 500, othersRC: 0 });
    assert.equal(ok.status, 200, ok.body?.error || JSON.stringify(ok.body));
    assert.equal(ok.body.expensesStepSubmitted, true);
    assert.ok(ok.body.expensesStepSubmittedAt);
    assert.equal(ok.body.status, "Pending");
    assert.equal(Number(ok.body.mileageKmL), 10);
    assert.equal(ok.body.vehicleNo, vehicle.vehicleNumber);
    assert.equal(Number(ok.body.advanceAmount), 2000);
    const ts = ok.body.expensesStepSubmittedAt;

    const again = await postJson(baseUrl, exp, { endMeter: 50410, destinationTolls: 1, meals: 600 });
    assert.equal(again.status, 200);
    assert.equal(again.body.expensesStepSubmittedAt, ts);
    assert.equal(Number(again.body.meals), 600);

    const loaded = await getJson(baseUrl, `/api/trips/${trip.id}`);
    assert.equal(loaded.body.expensesStepSubmitted, true);
    assert.equal(loaded.body.expensesStepSubmittedAt, ts);
    assert.equal(Number(loaded.body.dieselLtr1), 40);
  });

  it("combines general 600 + other 150 into one expense total and omits zero categories", async () => {
    const { trip } = await seed();
    const exp = `/api/trips/${trip.id}/steps/expenses`;
    const ok = await postJson(baseUrl, exp, {
      endMeter: 51000,
      destinationTolls: 0,
      meals: 600,
      others1Amt: 150,
      othersRC: 0,
      loading: 0,
    });
    assert.equal(ok.status, 200, ok.body?.error || JSON.stringify(ok.body));
    assert.equal(Number(ok.body.meals), 600);
    assert.equal(Number(ok.body.others1Amt), 150);
    const categoryTotal =
      Number(ok.body.meals || 0) +
      Number(ok.body.loading || 0) +
      Number(ok.body.mealsTiffin || 0) +
      Number(ok.body.vehicleMaintenance || 0) +
      Number(ok.body.othersRC || 0) +
      Number(ok.body.others1Amt || 0) +
      Number(ok.body.others2Amt || 0) +
      Number(ok.body.others3Amt || 0) +
      Number(ok.body.others4Amt || 0) +
      Number(ok.body.others5Amt || 0);
    assert.equal(categoryTotal, 750);
    assert.notEqual(categoryTotal, 600);
  });

  it("rejects Step 5 submit when Step 4 is missing", async () => {
    seq += 1;
    const n = String(seq).padStart(3, "0");
    const vehicle = await mastersService.upsertVehicle({
      vehicleNumber: `S5X${n}`,
      vehicleType: "Lorry",
      noOfBoxes: 40,
      birdCapacity: 1000,
      capacityKg: 2000,
      engineNumber: `S5XE${n}`,
      chassisNumber: `S5XC${n}`,
      status: "Active",
    });
    const driver = await mastersService.upsertEmployee({
      employeeName: `S5X Driver ${n}`,
      department: "Driver",
      role: "Driver",
      phoneNumber: `7110000${n}`,
      licenseNumber: `S5XDL${n}`,
      salary: 18000,
      status: "Active",
    });
    const supervisor = await mastersService.upsertEmployee({
      employeeName: `S5X Supervisor ${n}`,
      department: "Supervisor",
      role: "Supervisor",
      phoneNumber: `7210000${n}`,
      salary: 24000,
      status: "Active",
    });
    const farm = await mastersService.upsertFarm({
      farmName: `S5X Farm ${n}`,
      ownerName: "Owner",
      supervisorName: "Farm Super",
      phoneNumber: `7510000${n}`,
      village: "Guntur",
      address: "Addr",
      capacity: 5000,
      status: "Active",
    });
    const trip = await tripsService.save(null, {
      tripDate: "2026-08-16",
      vehicleId: vehicle.id,
      vehicleNo: vehicle.vehicleNumber,
      driverId: driver.id,
      driverName: driver.employeeName,
      supervisorId: supervisor.id,
      supervisorName: supervisor.employeeName,
      openingMeter: 1000,
      startStepSubmitted: true,
      sourceFarmId: farm.id,
      destMeter: 1100,
      farmAddress: "Addr",
      avgBirdWeight: 2,
      farmStepSubmitted: true,
      pickupStepSubmitted: true,
      boxDetails: [{ boxNo: 1, birds: 10, weight: 20 }],
    } as Record<string, unknown>);
    const res = await postJson(baseUrl, `/api/trips/${trip.id}/steps/expenses`, {
      endMeter: 1200,
      destinationTolls: 0,
    });
    assert.equal(res.status, 422);
  });
});

describe("Step 5 hardening", () => {
  it("does not persist draft diesel fields sent with final submit", async () => {
    const { trip } = await seed();
    await postJson(baseUrl, `/api/trips/${trip.id}/diesel`, dieselBody({ clientKey: "only-one", litres: 40, rate: 95, meter: 50200 }));
    const res = await postJson(baseUrl, `/api/trips/${trip.id}/steps/expenses`, {
      endMeter: 50400,
      destinationTolls: 0,
      dieselLtr2: 50,
      dieselRate2: 95,
      dieselMeter2: 50300,
      dieselBunk2: "Draft bunk",
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const loaded = await getJson(baseUrl, `/api/trips/${trip.id}`);
    const entries = loaded.body.dieselEntries ?? [];
    assert.equal(entries.length, 1);
    assert.equal(Number(loaded.body.mileageKmL), 10);
  });

  it("rejects diesel edit that breaks previous or next meter", async () => {
    const { trip } = await seed();
    const url = `/api/trips/${trip.id}/diesel`;
    const a = await postJson(baseUrl, url, dieselBody({ clientKey: "m1", meter: 50200 }));
    const b = await postJson(baseUrl, url, dieselBody({ clientKey: "m2", meter: 50300 }));
    const c = await postJson(baseUrl, url, dieselBody({ clientKey: "m3", meter: 50400 }));
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.equal(c.status, 201);
    const id2 = b.body.dieselId2;
    const belowPrev = await patchJson(baseUrl, `/api/trips/${trip.id}/diesel/${id2}`, dieselBody({ meter: 50150 }));
    assert.equal(belowPrev.status, 422);
    const aboveNext = await patchJson(baseUrl, `/api/trips/${trip.id}/diesel/${id2}`, dieselBody({ meter: 50500 }));
    assert.equal(aboveNext.status, 422);
    const ok = await patchJson(baseUrl, `/api/trips/${trip.id}/diesel/${id2}`, dieselBody({ meter: 50250 }));
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(Number(ok.body.dieselMeter2), 50250);
    assert.equal(ok.body.dieselId2, id2);
    assert.equal(ok.body.dieselSubmittedAt2, b.body.dieselSubmittedAt2);
  });

  it("rejects wrong-trip diesel edit and delete", async () => {
    const a = await seed();
    const b = await seed();
    const created = await postJson(baseUrl, `/api/trips/${a.trip.id}/diesel`, dieselBody({ clientKey: "own" }));
    const id = created.body.dieselId1;
    const edit = await patchJson(baseUrl, `/api/trips/${b.trip.id}/diesel/${id}`, dieselBody({ meter: 50300 }));
    assert.equal(edit.status, 404);
    const del = await deleteJson(baseUrl, `/api/trips/${b.trip.id}/diesel/${id}`);
    assert.equal(del.status, 404);
    const still = await getJson(baseUrl, `/api/trips/${a.trip.id}`);
    assert.equal(Number(still.body.dieselLtr1), 10);
  });

  it("computes decimal amounts in PostgreSQL NUMERIC", async () => {
    const { trip } = await seed();
    const a = await postJson(baseUrl, `/api/trips/${trip.id}/diesel`, dieselBody({ clientKey: "dec", litres: 10.25, rate: 94.5, meter: 50200 }));
    assert.equal(a.status, 201, JSON.stringify(a.body));
    assert.equal(Number(a.body.dieselAmount1), 968.63);
  });

  it("rejects invalid diesel images", async () => {
    const { trip } = await seed();
    const url = `/api/trips/${trip.id}/diesel`;
    assert.equal((await postJson(baseUrl, url, dieselBody({ imageData: "data:image/jpeg;base64,not-real-image" }))).status, 422);
    assert.equal((await postJson(baseUrl, url, dieselBody({ imageData: "data:image/png;base64,!!!!" }))).status, 422);
    assert.equal((await postJson(baseUrl, url, dieselBody({ imageData: "data:image/png;base64,AAAA" }))).status, 422);
    assert.equal((await postJson(baseUrl, url, dieselBody({ imageData: "data:image/svg+xml;base64,PHN2Zy8+" }))).status, 422);
    const { MAX_DIESEL_BILL_BYTES } = await import("../src/utils/tripStep5.js");
    const buf = Buffer.alloc(MAX_DIESEL_BILL_BYTES + 16);
    buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4e; buf[3] = 0x47;
    buf[4] = 0x0d; buf[5] = 0x0a; buf[6] = 0x1a; buf[7] = 0x0a;
    const huge = `data:image/png;base64,${buf.toString("base64")}`;
    assert.equal((await postJson(baseUrl, url, dieselBody({ imageData: huge }))).status, 422);
  });

  it("retries the same clientKey without duplicating rows", async () => {
    const { trip } = await seed();
    const url = `/api/trips/${trip.id}/diesel`;
    const body = dieselBody({ clientKey: "idem-A", meter: 50200 });
    const a = await postJson(baseUrl, url, body);
    const b = await postJson(baseUrl, url, body);
    const c = await postJson(baseUrl, url, body);
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.equal(c.status, 201);
    assert.equal(a.body.dieselId1, b.body.dieselId1);
    assert.equal(a.body.dieselId1, c.body.dieselId1);
    const loaded = await getJson(baseUrl, `/api/trips/${trip.id}`);
    assert.equal((loaded.body.dieselEntries ?? []).length, 1);
  });

  it("persists diesel bill image across GET after refresh", async () => {
    const { trip } = await seed();
    const created = await postJson(baseUrl, `/api/trips/${trip.id}/diesel`, dieselBody({ clientKey: "img-1" }));
    assert.equal(created.status, 201);
    const loaded = await getJson(baseUrl, `/api/trips/${trip.id}`);
    assert.match(String(loaded.body.dieselImage1), /^data:image\/png;base64,/);
    assert.equal(loaded.body.dieselSubmitted1, true);
  });

  it("excludes deleted diesel from mileage", async () => {
    const { trip } = await seed();
    const created = await postJson(
      baseUrl,
      `/api/trips/${trip.id}/diesel`,
      dieselBody({ clientKey: "mile-1", litres: 40, rate: 95, meter: 50200 })
    );
    const submitted = await postJson(baseUrl, `/api/trips/${trip.id}/steps/expenses`, {
      endMeter: 50400,
      destinationTolls: 0,
    });
    assert.equal(submitted.status, 200);
    assert.equal(Number(submitted.body.mileageKmL), 10);
    const gone = await deleteJson(baseUrl, `/api/trips/${trip.id}/diesel/${created.body.dieselId1}`);
    assert.equal(gone.status, 200);
    assert.equal(gone.body.mileageKmL, null);
  });

  it("serializes concurrent diesel submits without invalid meter order", async () => {
    const { trip } = await seed();
    const url = `/api/trips/${trip.id}/diesel`;
    await postJson(baseUrl, url, dieselBody({ clientKey: "race-base", meter: 50200 }));
    const [a, b] = await Promise.all([
      postJson(baseUrl, url, dieselBody({ clientKey: "race-a", meter: 50300 })),
      postJson(baseUrl, url, dieselBody({ clientKey: "race-b", meter: 50180 })),
    ]);
    const statuses = [a.status, b.status].sort();
    assert.equal(statuses[0], 201);
    assert.equal(statuses[1], 422);
    const loaded = await getJson(baseUrl, `/api/trips/${trip.id}`);
    const meters = (loaded.body.dieselEntries ?? []).map((e: { meter: number }) => Number(e.meter)).sort((x: number, y: number) => x - y);
    for (let i = 1; i < meters.length; i++) {
      assert.ok(meters[i] > meters[i - 1]);
    }
    assert.ok(meters[0] > 50100);
  });

  it("serializes concurrent diesel edits against previous/next meters", async () => {
    const { trip } = await seed();
    const url = `/api/trips/${trip.id}/diesel`;
    const d1 = await postJson(baseUrl, url, dieselBody({ clientKey: "e1", meter: 50200 }));
    const d2 = await postJson(baseUrl, url, dieselBody({ clientKey: "e2", meter: 50300 }));
    await postJson(baseUrl, url, dieselBody({ clientKey: "e3", meter: 50400 }));
    const [a, b] = await Promise.all([
      patchJson(baseUrl, `/api/trips/${trip.id}/diesel/${d1.body.dieselId1}`, dieselBody({ meter: 50250 })),
      patchJson(baseUrl, `/api/trips/${trip.id}/diesel/${d2.body.dieselId2}`, dieselBody({ meter: 50240 })),
    ]);
    const okCount = [a.status, b.status].filter((s) => s === 200).length;
    const failCount = [a.status, b.status].filter((s) => s === 422).length;
    assert.equal(okCount, 1);
    assert.equal(failCount, 1);
    const loaded = await getJson(baseUrl, `/api/trips/${trip.id}`);
    const meters = (loaded.body.dieselEntries ?? []).map((e: { meter: number }) => Number(e.meter));
    for (let i = 1; i < meters.length; i++) {
      assert.ok(meters[i] > meters[i - 1]);
    }
  });

  it("allows two concurrent valid diesel submits", async () => {
    const { trip } = await seed();
    const url = `/api/trips/${trip.id}/diesel`;
    const [a, b] = await Promise.all([
      postJson(baseUrl, url, dieselBody({ clientKey: "ok-a", meter: 50200 })),
      postJson(baseUrl, url, dieselBody({ clientKey: "ok-b", meter: 50300 })),
    ]);
    assert.equal(a.status, 201, JSON.stringify(a.body));
    assert.equal(b.status, 201, JSON.stringify(b.body));
    const loaded = await getJson(baseUrl, `/api/trips/${trip.id}`);
    const meters = (loaded.body.dieselEntries ?? []).map((e: { meter: number }) => Number(e.meter)).sort((x: number, y: number) => x - y);
    assert.deepEqual(meters, [50200, 50300]);
  });

  it("failed final submit does not mark Step 5 submitted", async () => {
    const { trip } = await seed();
    await postJson(baseUrl, `/api/trips/${trip.id}/steps/expenses`, { mode: "save", meals: 400 });
    const fail = await postJson(baseUrl, `/api/trips/${trip.id}/steps/expenses`, { endMeter: 50050, destinationTolls: 0 });
    assert.equal(fail.status, 422);
    const loaded = await getJson(baseUrl, `/api/trips/${trip.id}`);
    assert.equal(loaded.body.expensesStepSubmitted, false);
    assert.equal(loaded.body.expensesStepSubmittedAt, null);
    assert.equal(Number(loaded.body.meals), 400);
  });

  it("caps diesel at 6 submitted rows", async () => {
    const { trip } = await seed();
    const url = `/api/trips/${trip.id}/diesel`;
    for (let i = 1; i <= 6; i++) {
      const res = await postJson(baseUrl, url, dieselBody({ clientKey: `cap-${i}`, meter: 50100 + i * 20 }));
      assert.equal(res.status, 201, JSON.stringify(res.body));
    }
    const seventh = await postJson(baseUrl, url, dieselBody({ clientKey: "cap-7", meter: 50900 }));
    assert.equal(seventh.status, 422);
  });
});

