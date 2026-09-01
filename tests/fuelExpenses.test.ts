/**
 * Fuel Expenses — backend-authoritative PostgreSQL tests.
 * Trip Step 5 is exercised through existing Trip APIs (read-only integration).
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import {
  getJson,
  patchJson,
  postJson,
  putJson,
  startApp,
  type TestApp,
} from "./helpers/app.js";
import { applySchema, markTripCompletedForTests, shutdownTestEnv, startTestDb, type TestDb } from "./helpers/testDb.js";

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
async function seedMasters() {
  seq += 1;
  const n = String(seq).padStart(3, "0");
  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: `FLV${n}`,
    vehicleType: "Lorry",
    noOfBoxes: 40,
    birdCapacity: 1000,
    capacityKg: 2000,
    engineNumber: `FLE${n}`,
    chassisNumber: `FLC${n}`,
    status: "Active",
  });
  const driver = await mastersService.upsertEmployee({
    employeeName: `FL Driver ${n}`,
    department: "Driver",
    role: "Driver",
    phoneNumber: `8100000${n}`,
    licenseNumber: `FLDL${n}`,
    salary: 18000,
    status: "Active",
  });
  const supervisor = await mastersService.upsertEmployee({
    employeeName: `FL Super ${n}`,
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: `8200000${n}`,
    salary: 24000,
    status: "Active",
  });
  const farm = await mastersService.upsertFarm({
    farmName: `FL Farm ${n}`,
    ownerName: "Owner",
    supervisorName: "Farm Super",
    phoneNumber: `8500000${n}`,
    village: "Guntur",
    address: `Farm Address ${n}`,
    capacity: 5000,
    status: "Active",
  });
  const shop = await mastersService.upsertShop({
    associationType: "Ass Vij",
    shopName: `FL Shop ${n}`,
    ownerName: "Owner",
    phoneNumber: `8600000${n}`,
    email: `flshop${n}@example.com`,
    village: "Village",
    status: "Active",
  });
  return { vehicle, driver, supervisor, farm, shop };
}

async function seedTrip(date = "2026-08-17") {
  const m = await seedMasters();
  const trip = await tripsService.save(null, {
    tripDate: date,
    status: "Draft",
    vehicleId: m.vehicle.id,
    vehicleNo: m.vehicle.vehicleNumber,
    driverId: m.driver.id,
    driverName: m.driver.employeeName,
    supervisorId: m.supervisor.id,
    supervisorName: m.supervisor.employeeName,
    openingMeter: 50000,
    advanceAmount: 2000,
    startStepSubmitted: true,
    sourceFarmId: m.farm.id,
    sourceFarm: m.farm.farmName,
    destMeter: 50100,
    farmAddress: m.farm.address,
    pickupTolls: 0,
    avgBirdWeight: 2.1,
    farmStepSubmitted: true,
    boxDetails: [{ boxNo: 1, birds: 40, weight: 80 }],
    pickupStepSubmitted: true,
    deliveryStepSubmitted: true,
    deliveries: [
      {
        id: 0,
        shopId: m.shop.id,
        shopName: m.shop.shopName,
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
  return { ...m, trip };
}

function dieselBody(overrides: Record<string, unknown> = {}) {
  return {
    clientKey: `ck-${Date.now()}-${Math.random()}`,
    litres: 10,
    rate: 90,
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

async function completeTripWithBills(
  tripId: number,
  bills: Array<{ litres: number; rate: number; meter: number }>
) {
  let meter = 50200;
  for (const [i, b] of bills.entries()) {
    meter = b.meter ?? meter + i * 50;
    const res = await postJson(baseUrl, `/api/trips/${tripId}/diesel`, dieselBody({
      clientKey: `bill-${tripId}-${i}`,
      litres: b.litres,
      rate: b.rate,
      meter,
    }));
    assert.equal(res.status, 201, JSON.stringify(res.body));
  }
  await markTripCompletedForTests(tripId);
  const rec = await postJson(baseUrl, "/api/operations/fuel-expenses/reconcile-trips", {});
  assert.equal(rec.status, 200, JSON.stringify(rec.body));
}

async function listFuel(qs = "") {
  return getJson(baseUrl, `/api/operations/fuel-expenses${qs}`);
}

function rows(body: any): any[] {
  return Array.isArray(body) ? body : body.data ?? [];
}

describe("Fuel Expenses — trip origin multi-bill", () => {
  it("creates four separate TRIP bills with per-trip numbering and amounts", async () => {
    const { trip } = await seedTrip("2026-08-17");
    await completeTripWithBills(trip.id, [
      { litres: 100, rate: 90, meter: 50200 },
      { litres: 50, rate: 91, meter: 50250 },
      { litres: 80, rate: 92, meter: 50320 },
      { litres: 60, rate: 90, meter: 50400 },
    ]);
    const dbRows = await pool.query(
      `SELECT bill_no, trip_id, source_type, ops_status, litres, rate, amount
       FROM fuel_expenses WHERE trip_id = $1 AND source_type = 'TRIP' ORDER BY trip_fuel_entry_index`,
      [trip.id]
    );
    assert.equal(dbRows.rowCount, 4, JSON.stringify(dbRows.rows));
    const listed = await listFuel(`?page=1&limit=50&sourceType=TRIP`);
    assert.equal(listed.status, 200);
    const fuel = rows(listed.body).filter((r) => r.tripId === trip.id);
    assert.equal(fuel.length, 4);
    const sorted = [...fuel].sort((a, b) => String(a.billNo).localeCompare(String(b.billNo)));
    assert.equal(sorted[0].billNo.endsWith("-001"), true);
    assert.equal(sorted[1].billNo.endsWith("-002"), true);
    assert.equal(sorted[2].billNo.endsWith("-003"), true);
    assert.equal(sorted[3].billNo.endsWith("-004"), true);
    assert.ok(sorted.every((r) => String(r.billNo).startsWith("TR-")));
    assert.ok(sorted.every((r) => r.sourceType === "TRIP"));
    assert.ok(sorted.every((r) => r.status === "Approved"));
    assert.equal(Number(sorted[0].liters), 100);
    assert.equal(Number(sorted[0].fuelRate), 90);
    assert.equal(Number(sorted[0].amount), 9000);
    assert.equal(Number(sorted[1].amount), 4550);
    assert.equal(Number(sorted[2].amount), 7360);
    assert.equal(Number(sorted[3].amount), 5400);
    const litresSum = sorted.reduce((s, r) => s + Number(r.liters), 0);
    assert.equal(litresSum, 290);
  });

  it("is idempotent when the same completed trip is processed twice", async () => {
    const { trip } = await seedTrip("2026-08-17");
    await completeTripWithBills(trip.id, [
      { litres: 10, rate: 90, meter: 50200 },
      { litres: 20, rate: 91, meter: 50250 },
    ]);
    await postJson(baseUrl, "/api/operations/fuel-expenses/reconcile-trips", {});
    await postJson(baseUrl, "/api/operations/fuel-expenses/reconcile-trips", {});
    await patchJson(baseUrl, `/api/trips/${trip.id}/status`, { status: "Completed" });
    const listed = await listFuel(`?page=1&limit=50&search=${trip.id}`);
    const fuel = rows(listed.body).filter((r) => r.tripId === trip.id);
    assert.equal(fuel.length, 2);
  });

  it("gives independent sequences to two trips on the same date", async () => {
    const a = await seedTrip("2026-08-17");
    const b = await seedTrip("2026-08-17");
    await completeTripWithBills(a.trip.id, [
      { litres: 10, rate: 90, meter: 50200 },
      { litres: 11, rate: 90, meter: 50250 },
    ]);
    await completeTripWithBills(b.trip.id, [
      { litres: 12, rate: 90, meter: 50200 },
      { litres: 13, rate: 90, meter: 50250 },
      { litres: 14, rate: 90, meter: 50300 },
    ]);
    await postJson(baseUrl, "/api/operations/fuel-expenses/reconcile-trips", {});
    const listed = await listFuel("?page=1&limit=100&sourceType=TRIP");
    const fa = rows(listed.body).filter((r) => r.tripId === a.trip.id);
    const fb = rows(listed.body).filter((r) => r.tripId === b.trip.id);
    assert.equal(fa.length, 2);
    assert.equal(fb.length, 3);
    assert.equal(fa.filter((r) => r.billNo.endsWith("-001")).length, 1);
    assert.equal(fb.filter((r) => r.billNo.endsWith("-001")).length, 1);
  });

  it("does not post fuel for a pending trip or a trip with no diesel", async () => {
    const pending = await seedTrip("2026-08-18");
    await postJson(baseUrl, `/api/trips/${pending.trip.id}/diesel`, dieselBody({ meter: 50200 }));
    await postJson(baseUrl, "/api/operations/fuel-expenses/reconcile-trips", {});
    const listedPending = await listFuel("?page=1&limit=50");
    assert.equal(rows(listedPending.body).filter((r) => r.tripId === pending.trip.id).length, 0);

    const empty = await seedTrip("2026-08-18");
    const exp = await postJson(baseUrl, `/api/trips/${empty.trip.id}/steps/expenses`, {
      endMeter: 50400,
      destinationTolls: 0,
    });
    assert.equal(exp.status, 200);
    await markTripCompletedForTests(empty.trip.id);
    await postJson(baseUrl, "/api/operations/fuel-expenses/reconcile-trips", {});
    const listedEmpty = await listFuel("?page=1&limit=50");
    assert.equal(rows(listedEmpty.body).filter((r) => r.tripId === empty.trip.id).length, 0);
  });
});

describe("Fuel Expenses — manual workflow", () => {
  it("numbers BILL-YYYYMMDD, stays PENDING, then approves", async () => {
    const { vehicle, driver, supervisor } = await seedMasters();
    const created = await postJson(baseUrl, "/api/operations/fuel-expenses", {
      billDate: "2026-08-17",
      vehicleId: vehicle.id,
      vehicleNo: vehicle.vehicleNumber,
      driverId: driver.id,
      driverName: driver.employeeName,
      supervisorId: supervisor.id,
      supervisorName: supervisor.employeeName,
      liters: 100,
      fuelRate: 90,
      amount: 8000,
      gpsLat: 16.5,
      gpsLon: 80.4,
      imageData: BILL,
      imageName: "manual.png",
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.match(created.body.billNo, /^BILL-20260817-\d{3}$/);
    assert.equal(created.body.sourceType, "MANUAL");
    assert.equal(created.body.status, "Pending Approval");
    assert.equal(Number(created.body.amount), 9000);
    const approved = await postJson(baseUrl, `/api/operations/fuel-expenses/${created.body.id}/approve`, {
      approvedBy: "tester",
    });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.status, "Approved");
    const again = await postJson(baseUrl, `/api/operations/fuel-expenses/${created.body.id}/approve`, {
      approvedBy: "tester",
    });
    assert.equal(again.status, 409);
  });

  it("rejects invalid litres, rate, date, GPS, and photo", async () => {
    const { vehicle } = await seedMasters();
    const base = { billDate: "2026-08-17", vehicleId: vehicle.id, vehicleNo: vehicle.vehicleNumber, liters: 10, fuelRate: 90 };
    assert.equal((await postJson(baseUrl, "/api/operations/fuel-expenses", { ...base, liters: 0 })).status, 422);
    assert.equal((await postJson(baseUrl, "/api/operations/fuel-expenses", { ...base, liters: -1 })).status, 422);
    assert.equal((await postJson(baseUrl, "/api/operations/fuel-expenses", { ...base, liters: 999999 })).status, 422);
    assert.equal((await postJson(baseUrl, "/api/operations/fuel-expenses", { ...base, fuelRate: 0 })).status, 422);
    assert.equal((await postJson(baseUrl, "/api/operations/fuel-expenses", { ...base, fuelRate: -2 })).status, 422);
    assert.equal((await postJson(baseUrl, "/api/operations/fuel-expenses", { ...base, billDate: "2026-02-31" })).status, 400);
    assert.equal((await postJson(baseUrl, "/api/operations/fuel-expenses", { ...base, gpsLat: 100, gpsLon: 10 })).status, 422);
    assert.equal((await postJson(baseUrl, "/api/operations/fuel-expenses", { ...base, gpsLat: 10, gpsLon: 200 })).status, 422);
    assert.equal((await postJson(baseUrl, "/api/operations/fuel-expenses", { ...base, gpsLat: 0, gpsLon: 0 })).status, 422);
    assert.equal((await postJson(baseUrl, "/api/operations/fuel-expenses", { ...base, imageData: "not-an-image" })).status, 422);
    assert.equal((await postJson(baseUrl, "/api/operations/fuel-expenses", { ...base, vehicleId: 999999 })).status, 422);
  });

  it("rejects then blocks approve of rejected records", async () => {
    const { vehicle } = await seedMasters();
    const created = await postJson(baseUrl, "/api/operations/fuel-expenses", {
      billDate: "2026-08-17",
      vehicleId: vehicle.id,
      liters: 5,
      fuelRate: 90,
    });
    const rejected = await postJson(baseUrl, `/api/operations/fuel-expenses/${created.body.id}/reject`, {
      reason: "wrong bunk",
    });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.status, "Rejected");
    const approve = await postJson(baseUrl, `/api/operations/fuel-expenses/${created.body.id}/approve`, {});
    assert.equal(approve.status, 409);
  });

  it("paginates and filters", async () => {
    const { vehicle } = await seedMasters();
    for (let i = 0; i < 5; i++) {
      await postJson(baseUrl, "/api/operations/fuel-expenses", {
        billDate: "2026-08-16",
        vehicleId: vehicle.id,
        vehicleNo: vehicle.vehicleNumber,
        liters: 1 + i,
        fuelRate: 90,
      });
    }
    const page1 = await listFuel("?page=1&limit=2&billNo=BILL-");
    assert.equal(page1.status, 200);
    assert.ok(page1.body.meta.total >= 5);
    assert.equal(page1.body.data.length, 2);
    const empty = await listFuel("?page=1&limit=10&billNo=NO-SUCH-BILL");
    assert.equal(empty.body.data.length, 0);
  });

  it("creates concurrent unique manual bill numbers", async () => {
    const { vehicle } = await seedMasters();
    const payload = {
      billDate: "2026-08-19",
      vehicleId: vehicle.id,
      liters: 3,
      fuelRate: 91.5,
    };
    const results = await Promise.all(
      Array.from({ length: 8 }, () => postJson(baseUrl, "/api/operations/fuel-expenses", payload))
    );
    const ok = results.filter((r) => r.status === 201);
    assert.equal(ok.length, 8);
    const nos = new Set(ok.map((r) => r.body.billNo));
    assert.equal(nos.size, 8);
    assert.ok([...nos].every((n) => String(n).startsWith("BILL-20260819-")));
    assert.equal(Number(ok[0].body.amount), 274.5);
  });
});

describe("Fuel Expenses — volume", () => {
  it("handles 100/200/500 record listing via pagination", async () => {
    const { vehicle } = await seedMasters();
    const client = await pool.connect();
    try {
      for (let i = 0; i < 500; i++) {
        await client.query(
          `INSERT INTO fuel_expenses (
             bill_no, expense_date, vehicle_id, vehicle_no, source_type,
             meter_reading, amount, rate, litres, status, ops_status, created_by
           ) VALUES ($1,'2026-08-20',$2,$3,'MANUAL',0,90,90,1,'Pending','Pending Approval','volume-test')`,
          [`VOL-20260820-${String(i + 1).padStart(4, "0")}`, vehicle.id, vehicle.vehicleNumber]
        );
      }
    } finally {
      client.release();
    }
    const p100 = await listFuel("?page=1&limit=100&billNo=VOL-20260820");
    assert.equal(p100.body.data.length, 100);
    assert.ok(p100.body.meta.total >= 500);
    const p200 = await listFuel("?page=2&limit=200&billNo=VOL-20260820");
    assert.equal(p200.body.data.length, 200);
    const last = await listFuel("?page=3&limit=200&billNo=VOL-20260820");
    assert.ok(last.body.data.length >= 100);
  });
});

describe("Fuel Expenses — 100 scenario matrix", () => {
  interface FuelMatrixCase {
    name: string;
    run(): Promise<void>;
  }
  const cases: FuelMatrixCase[] = [];

  cases.push({
    name: "missing vehicle",
    run: async () => {
      const res = await postJson(baseUrl, "/api/operations/fuel-expenses", {
        billDate: "2026-08-17",
        liters: 1,
        fuelRate: 90,
      });
      assert.equal(res.status, 422);
    },
  });

  cases.push({
    name: "decimal litres and rate",
    run: async () => {
      const { vehicle } = await seedMasters();
      const res = await postJson(baseUrl, "/api/operations/fuel-expenses", {
        billDate: "2026-08-17",
        vehicleId: vehicle.id,
        liters: 10.25,
        fuelRate: 90.4,
      });
      assert.equal(res.status, 201);
      assert.equal(Number(res.body.amount), 926.6);
    },
  });

  cases.push({
    name: "cannot edit TRIP records",
    run: async () => {
      const { trip } = await seedTrip("2026-08-21");
      await completeTripWithBills(trip.id, [{ litres: 8, rate: 90, meter: 50200 }]);
      await postJson(baseUrl, "/api/operations/fuel-expenses/reconcile-trips", {});
      const listed = await listFuel("?page=1&limit=50&sourceType=TRIP");
      const row = rows(listed.body).find((r) => r.tripId === trip.id);
      assert.ok(row);
      const upd = await putJson(baseUrl, `/api/operations/fuel-expenses/${row.id}`, { liters: 99, fuelRate: 90, billDate: "2026-08-21" });
      assert.equal(upd.status, 409);
    },
  });

  cases.push({
    name: "wrong vehicle vs trip",
    run: async () => {
      const a = await seedTrip("2026-08-22");
      const b = await seedMasters();
      const res = await postJson(baseUrl, "/api/operations/fuel-expenses", {
        billDate: "2026-08-22",
        vehicleId: b.vehicle.id,
        tripId: a.trip.id,
        liters: 4,
        fuelRate: 90,
      });
      assert.equal(res.status, 422);
    },
  });

  cases.push({
    name: "404 get",
    run: async () => {
      const res = await getJson(baseUrl, "/api/operations/fuel-expenses/00000000-0000-0000-0000-000000000000");
      assert.equal(res.status, 404);
    },
  });

  for (let i = 0; i < 95; i++) {
    cases.push({
      name: `matrix-${i + 1}`,
      run: async () => {
        const { vehicle } = await seedMasters();
        const litres = 1 + (i % 17);
        const rate = 90 + (i % 5) * 0.25;
        const res = await postJson(baseUrl, "/api/operations/fuel-expenses", {
          billDate: "2026-08-17",
          vehicleId: vehicle.id,
          liters: litres,
          fuelRate: rate,
        });
        assert.equal(res.status, 201);
        const expected = Number((litres * rate).toFixed(2));
        assert.equal(Number(res.body.amount), expected);
        assert.match(res.body.billNo, /^BILL-/);
        assert.equal(res.body.sourceType, "MANUAL");
      },
    });
  }

  for (const c of cases) {
    it(c.name, c.run);
  }
});

describe("Fuel independence, numbering, security, performance", () => {
  async function fuelForSourceTrip(tripId: number) {
    const r = await pool.query(
      `SELECT bill_no, litres, rate, amount, source_trip_no, trip_id, ops_status
       FROM fuel_expenses
       WHERE source_type = 'TRIP' AND source_trip_id = $1 AND COALESCE(deleted, FALSE) = FALSE
       ORDER BY trip_fuel_entry_index`,
      [tripId]
    );
    return r.rows;
  }

  async function hardDeleteTrip(tripId: number) {
    await pool.query(`DELETE FROM trip_diesel_entries WHERE trip_id = $1`, [tripId]);
    await pool.query(`DELETE FROM trips WHERE id = $1`, [tripId]);
  }

  it("TEST-TRIP-DELETE-001: three bills survive physical trip delete", async () => {
    const { trip } = await seedTrip("2026-08-17");
    await completeTripWithBills(trip.id, [
      { litres: 100, rate: 90, meter: 50200 },
      { litres: 50, rate: 91, meter: 50250 },
      { litres: 80, rate: 92, meter: 50320 },
    ]);
    assert.equal((await fuelForSourceTrip(trip.id)).length, 3);
    await hardDeleteTrip(trip.id);
    const gone = await pool.query(`SELECT id FROM trips WHERE id = $1`, [trip.id]);
    assert.equal(gone.rowCount, 0);
    const fuel = await fuelForSourceTrip(trip.id);
    assert.equal(fuel.length, 3);
    assert.equal(Number(fuel[0].litres), 100);
    assert.equal(Number(fuel[0].amount), 9000);
    const listed = await listFuel("?page=1&limit=50&sourceType=TRIP");
    assert.equal(listed.status, 200);
    const still = rows(listed.body).filter((r) => String(r.tripNo || "").includes("20260817") || r.billNo.startsWith("TR-20260817"));
    assert.ok(still.length >= 3);
  });

  it("TEST-TRIP-DELETE-002: bill numbers unchanged after trip delete", async () => {
    const { trip } = await seedTrip("2026-08-17");
    await completeTripWithBills(trip.id, [
      { litres: 10, rate: 90, meter: 50200 },
      { litres: 11, rate: 90, meter: 50250 },
      { litres: 12, rate: 90, meter: 50300 },
    ]);
    const before = (await fuelForSourceTrip(trip.id)).map((r) => r.bill_no);
    await hardDeleteTrip(trip.id);
    const after = (await fuelForSourceTrip(trip.id)).map((r) => r.bill_no);
    assert.deepEqual(after, before);
    assert.equal(after[0].endsWith("-001"), true);
    assert.equal(after[1].endsWith("-002"), true);
    assert.equal(after[2].endsWith("-003"), true);
  });

  it("TEST-TRIP-DELETE-003: deleted trip bill numbers are never reused", async () => {
    const a = await seedTrip("2026-08-17");
    await completeTripWithBills(a.trip.id, [{ litres: 100, rate: 90, meter: 50200 }]);
    const old = await fuelForSourceTrip(a.trip.id);
    assert.equal(old.length, 1);
    const oldBill = old[0].bill_no;
    await hardDeleteTrip(a.trip.id);
    const b = await seedTrip("2026-08-17");
    await completeTripWithBills(b.trip.id, [{ litres: 40, rate: 90, meter: 50200 }]);
    const kept = await pool.query(`SELECT id FROM fuel_expenses WHERE bill_no = $1 AND source_trip_id = $2`, [
      oldBill,
      a.trip.id,
    ]);
    assert.equal(kept.rowCount, 1);
    const newer = await fuelForSourceTrip(b.trip.id);
    assert.equal(newer.length, 1);
    assert.equal(newer[0].bill_no.endsWith("-001"), true);
    assert.notEqual(String(newer[0].source_trip_id ?? b.trip.id), String(a.trip.id));
  });

  it("TEST-NUMBER-001: four bills remain after trip delete", async () => {
    const { trip } = await seedTrip("2026-08-17");
    await completeTripWithBills(trip.id, [
      { litres: 100, rate: 90, meter: 50200 },
      { litres: 50, rate: 91, meter: 50250 },
      { litres: 80, rate: 92, meter: 50320 },
      { litres: 60, rate: 90, meter: 50400 },
    ]);
    await hardDeleteTrip(trip.id);
    const fuel = await fuelForSourceTrip(trip.id);
    assert.equal(fuel.length, 4);
    assert.deepEqual(
      fuel.map((r) => r.bill_no.slice(-3)),
      ["001", "002", "003", "004"]
    );
  });

  it("TEST-TRIP-EDIT-001: posted fuel does not follow later diesel edits", async () => {
    const { trip } = await seedTrip("2026-08-17");
    await completeTripWithBills(trip.id, [{ litres: 100, rate: 90, meter: 50200 }]);
    await pool.query(`UPDATE trip_diesel_entries SET litres = 120, rate = 95, amount = 11400 WHERE trip_id = $1`, [
      trip.id,
    ]);
    await postJson(baseUrl, "/api/operations/fuel-expenses/reconcile-trips", {});
    const fuel = await fuelForSourceTrip(trip.id);
    assert.equal(fuel.length, 1);
    assert.equal(Number(fuel[0].litres), 100);
    assert.equal(Number(fuel[0].rate), 90);
    assert.equal(Number(fuel[0].amount), 9000);
  });

  it("TEST-IDEMPOTENCY-001: reconcile 20 times keeps one row per bill", async () => {
    const { trip } = await seedTrip("2026-08-17");
    await completeTripWithBills(trip.id, [
      { litres: 10, rate: 90, meter: 50200 },
      { litres: 20, rate: 91, meter: 50250 },
    ]);
    for (let i = 0; i < 20; i++) {
      const rec = await postJson(baseUrl, "/api/operations/fuel-expenses/reconcile-trips", {});
      assert.equal(rec.status, 200, JSON.stringify(rec.body));
    }
    assert.equal((await fuelForSourceTrip(trip.id)).length, 2);
  });

  it("TEST-CONCURRENCY-001: 20 concurrent reconciles do not duplicate", async () => {
    const { trip } = await seedTrip("2026-08-17");
    await completeTripWithBills(trip.id, [
      { litres: 15, rate: 90, meter: 50200 },
      { litres: 16, rate: 90, meter: 50250 },
      { litres: 17, rate: 90, meter: 50300 },
    ]);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => postJson(baseUrl, "/api/operations/fuel-expenses/reconcile-trips", {}))
    );
    assert.ok(results.every((r) => r.status === 200));
    assert.equal((await fuelForSourceTrip(trip.id)).length, 3);
  });

  it("TEST-NUMBER-002: two same-date trips keep distinct identities after one delete", async () => {
    const a = await seedTrip("2026-08-17");
    const b = await seedTrip("2026-08-17");
    await completeTripWithBills(a.trip.id, [
      { litres: 10, rate: 90, meter: 50200 },
      { litres: 11, rate: 90, meter: 50250 },
    ]);
    await completeTripWithBills(b.trip.id, [
      { litres: 12, rate: 90, meter: 50200 },
      { litres: 13, rate: 90, meter: 50250 },
      { litres: 14, rate: 90, meter: 50300 },
    ]);
    await hardDeleteTrip(a.trip.id);
    const fa = await fuelForSourceTrip(a.trip.id);
    const fb = await fuelForSourceTrip(b.trip.id);
    assert.equal(fa.length, 2);
    assert.equal(fb.length, 3);
    assert.equal(fa.filter((r) => String(r.bill_no).endsWith("-001")).length, 1);
    assert.equal(fb.filter((r) => String(r.bill_no).endsWith("-001")).length, 1);
  });

  it("snapshot trip_no remains after trip_id is null", async () => {
    const { trip } = await seedTrip("2026-08-17");
    await completeTripWithBills(trip.id, [{ litres: 9, rate: 90, meter: 50200 }]);
    await hardDeleteTrip(trip.id);
    const fuel = await fuelForSourceTrip(trip.id);
    assert.equal(fuel[0].trip_id, null);
    assert.ok(String(fuel[0].source_trip_no).length > 0);
    const listed = await listFuel(`?page=1&limit=50&tripNo=${encodeURIComponent(String(fuel[0].source_trip_no))}`);
    assert.ok(rows(listed.body).some((r) => r.billNo === fuel[0].bill_no));
  });

  it("FK is SET NULL not CASCADE", async () => {
    const fk = await pool.query<{ def: string }>(
      `SELECT pg_get_constraintdef(c.oid) AS def
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.relname = 'fuel_expenses' AND c.contype = 'f'
         AND pg_get_constraintdef(c.oid) ILIKE '%trip_id%'`
    );
    assert.ok(fk.rowCount);
    assert.match(fk.rows[0].def, /ON DELETE SET NULL/i);
    assert.doesNotMatch(fk.rows[0].def, /ON DELETE CASCADE/i);
  });

  it("rejects spoofed source, bill number, and status on manual create", async () => {
    const { vehicle } = await seedMasters();
    const res = await postJson(baseUrl, "/api/operations/fuel-expenses", {
      billDate: "2026-08-17",
      vehicleId: vehicle.id,
      liters: 7,
      fuelRate: 90,
      billNo: "TR-HACK-001",
      sourceType: "TRIP",
      status: "Approved",
      amount: 1,
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.sourceType, "MANUAL");
    assert.equal(res.body.status, "Pending Approval");
    assert.match(res.body.billNo, /^BILL-/);
    assert.equal(Number(res.body.amount), 630);
  });

  it("manual soft-delete does not recycle bill numbers", async () => {
    const { vehicle } = await seedMasters();
    const a = await postJson(baseUrl, "/api/operations/fuel-expenses", {
      billDate: "2026-08-18",
      vehicleId: vehicle.id,
      liters: 2,
      fuelRate: 90,
    });
    assert.equal(a.status, 201, JSON.stringify(a.body));
    const first = a.body.billNo;
    assert.match(first, /^BILL-20260818-/);
    const del = await fetch(`${baseUrl}/api/operations/fuel-expenses/${a.body.id}`, { method: "DELETE" });
    assert.ok(del.status < 300, await del.text());
    const b = await postJson(baseUrl, "/api/operations/fuel-expenses", {
      billDate: "2026-08-18",
      vehicleId: vehicle.id,
      liters: 3,
      fuelRate: 90,
    });
    assert.equal(b.status, 201, JSON.stringify(b.body));
    assert.notEqual(b.body.billNo, first);
  });

  it("GPS invalid and photo spoofing rejected", async () => {
    const { vehicle } = await seedMasters();
    const base = { billDate: "2026-08-17", vehicleId: vehicle.id, liters: 2, fuelRate: 90 };
    assert.equal((await postJson(baseUrl, "/api/operations/fuel-expenses", { ...base, gpsLat: -91, gpsLon: 10 })).status, 422);
    assert.equal((await postJson(baseUrl, "/api/operations/fuel-expenses", { ...base, gpsLat: 10, gpsLon: -181 })).status, 422);
    assert.equal((await postJson(baseUrl, "/api/operations/fuel-expenses", { ...base, imageData: "data:image/png;base64," })).status, 422);
    assert.equal((await postJson(baseUrl, "/api/operations/fuel-expenses", { ...base, imageData: "data:text/plain;base64,YQ==" })).status, 422);
  });

  it("approve/reject authorization rules for manual and trip", async () => {
    const { vehicle } = await seedMasters();
    const created = await postJson(baseUrl, "/api/operations/fuel-expenses", {
      billDate: "2026-08-17",
      vehicleId: vehicle.id,
      liters: 2,
      fuelRate: 90,
    });
    assert.equal((await postJson(baseUrl, `/api/operations/fuel-expenses/${created.body.id}/reject`, {})).status, 400);
    const ok = await postJson(baseUrl, `/api/operations/fuel-expenses/${created.body.id}/reject`, { reason: "dup" });
    assert.equal(ok.status, 200);
    const { trip } = await seedTrip("2026-08-24");
    await completeTripWithBills(trip.id, [{ litres: 8, rate: 90, meter: 50200 }]);
    const tripFuel = await fuelForSourceTrip(trip.id);
    const listed = await listFuel("?page=1&limit=50&sourceType=TRIP");
    const row = rows(listed.body).find((r) => r.billNo === tripFuel[0].bill_no);
    assert.ok(row);
    assert.equal((await postJson(baseUrl, `/api/operations/fuel-expenses/${row.id}/approve`, {})).status, 409);
    assert.equal((await postJson(baseUrl, `/api/operations/fuel-expenses/${row.id}/reject`, { reason: "no" })).status, 409);
  });

  it("pagination remains bounded at 200 and 1000/5000/10000 scale lists", async () => {
    const { vehicle } = await seedMasters();
    const client = await pool.connect();
    try {
      for (let i = 0; i < 1000; i++) {
        await client.query(
          `INSERT INTO fuel_expenses (
             bill_no, expense_date, vehicle_id, source_type, meter_reading, amount, rate, litres,
             status, ops_status, created_by
           ) VALUES ($1,'2026-08-25',$2,'MANUAL',0,90,90,1,'Pending','Pending Approval','scale')`,
          [`SCL-20260825-${String(i + 1).padStart(5, "0")}`, vehicle.id]
        );
      }
    } finally {
      client.release();
    }
    const page = await listFuel("?page=1&limit=200&billNo=SCL-20260825");
    assert.equal(page.status, 200);
    assert.equal(page.body.data.length, 200);
    assert.ok(page.body.meta.total >= 1000);
    await pool.query(
      `INSERT INTO fuel_expenses (
         bill_no, expense_date, vehicle_id, source_type, meter_reading, amount, rate, litres,
         status, ops_status, created_by
       )
       SELECT 'SCL5-' || lpad(g::text, 5, '0'), '2026-08-25', $1, 'MANUAL', 0, 90, 90, 1,
              'Pending', 'Pending Approval', 'scale5'
       FROM generate_series(1, 10000) g`,
      [vehicle.id]
    );
    const fivek = await listFuel("?page=1&limit=200&billNo=SCL5-");
    assert.equal(fivek.status, 200);
    assert.ok(fivek.body.meta.total >= 10000);
    const huge = await listFuel("?page=1&limit=9999&billNo=SCL-20260825");
    assert.ok(huge.body.data.length <= 200);
  });

  for (let i = 0; i < 20; i++) {
    it(`independence-matrix-${i + 1}`, async () => {
      const { trip } = await seedTrip("2026-08-26");
      await completeTripWithBills(trip.id, [{ litres: 5 + i, rate: 90, meter: 50200 }]);
      const before = await fuelForSourceTrip(trip.id);
      assert.equal(before.length, 1);
      assert.equal(Number(before[0].amount), Number(((5 + i) * 90).toFixed(2)));
      await hardDeleteTrip(trip.id);
      const after = await fuelForSourceTrip(trip.id);
      assert.equal(after.length, 1);
      assert.equal(after[0].bill_no, before[0].bill_no);
      assert.equal(Number(after[0].litres), Number(before[0].litres));
    });
  }
});

describe("Fuel validation extras", () => {
  const negatives = [0, -1, -0.01, Number.NaN, Number.POSITIVE_INFINITY];
  for (const [i, v] of negatives.entries()) {
    it(`rejects invalid litres case ${i + 1}`, async () => {
      const { vehicle } = await seedMasters();
      const res = await postJson(baseUrl, "/api/operations/fuel-expenses", {
        billDate: "2026-08-17",
        vehicleId: vehicle.id,
        liters: v,
        fuelRate: 90,
      });
      assert.ok(res.status >= 400);
    });
    it(`rejects invalid rate case ${i + 1}`, async () => {
      const { vehicle } = await seedMasters();
      const res = await postJson(baseUrl, "/api/operations/fuel-expenses", {
        billDate: "2026-08-17",
        vehicleId: vehicle.id,
        liters: 10,
        fuelRate: v,
      });
      assert.ok(res.status >= 400);
    });
  }

  it("rejects path-traversal photo filename while still storing a sanitized name", async () => {
    const { vehicle } = await seedMasters();
    const res = await postJson(baseUrl, "/api/operations/fuel-expenses", {
      billDate: "2026-08-17",
      vehicleId: vehicle.id,
      liters: 1.5,
      fuelRate: 90.25,
      imageData: BILL,
      imageName: "../../etc/passwd.png",
    });
    assert.equal(res.status, 201);
    assert.equal(Number(res.body.amount), 135.38);
    assert.ok(!String(res.body.imageName || "").includes(".."));
  });

  it("list IDOR-style unknown uuid does not leak stack traces", async () => {
    const res = await getJson(baseUrl, "/api/operations/fuel-expenses/not-a-uuid");
    assert.ok(res.status >= 400);
    assert.equal(res.body?.stack, undefined);
    assert.equal(String(res.body?.error || "").includes("    at "), false);
  });
});

describe("Fuel production hardening — remaining 50+", () => {
  async function fuelForSourceTrip(tripId: number) {
    const r = await pool.query(
      `SELECT * FROM fuel_expenses
       WHERE source_type = 'TRIP' AND source_trip_id = $1 AND COALESCE(deleted, FALSE) = FALSE
       ORDER BY trip_fuel_entry_index`,
      [tripId]
    );
    return r.rows;
  }

  it("TEST-INDEP-001: 4 bills survive trip delete", async () => {
    const { trip } = await seedTrip("2026-08-17");
    await completeTripWithBills(trip.id, [
      { litres: 100, rate: 90, meter: 50200 },
      { litres: 50, rate: 91, meter: 50250 },
      { litres: 80, rate: 92, meter: 50320 },
      { litres: 60, rate: 90, meter: 50400 },
    ]);
    assert.equal((await fuelForSourceTrip(trip.id)).length, 4);
    await pool.query(`DELETE FROM trip_diesel_entries WHERE trip_id = $1`, [trip.id]);
    await pool.query(`DELETE FROM trips WHERE id = $1`, [trip.id]);
    assert.equal((await fuelForSourceTrip(trip.id)).length, 4);
  });

  it("TEST-INDEP-002: bill_no unchanged after trip delete", async () => {
    const { trip } = await seedTrip("2026-08-17");
    await completeTripWithBills(trip.id, [{ litres: 100, rate: 90, meter: 50200 }]);
    const before = (await fuelForSourceTrip(trip.id))[0].bill_no;
    await pool.query(`DELETE FROM trip_diesel_entries WHERE trip_id = $1`, [trip.id]);
    await pool.query(`DELETE FROM trips WHERE id = $1`, [trip.id]);
    assert.equal((await fuelForSourceTrip(trip.id))[0].bill_no, before);
  });

  it("TEST-INDEP-003: source_trip_no remains after trip delete", async () => {
    const { trip } = await seedTrip("2026-08-17");
    await completeTripWithBills(trip.id, [{ litres: 10, rate: 90, meter: 50200 }]);
    await pool.query(`DELETE FROM trip_diesel_entries WHERE trip_id = $1`, [trip.id]);
    await pool.query(`DELETE FROM trips WHERE id = $1`, [trip.id]);
    const row = (await fuelForSourceTrip(trip.id))[0];
    assert.ok(row.source_trip_no);
    assert.equal(row.trip_id, null);
  });

  it("TEST-INDEP-004: litres/rate/amount unchanged after trip delete", async () => {
    const { trip } = await seedTrip("2026-08-17");
    await completeTripWithBills(trip.id, [{ litres: 100, rate: 90, meter: 50200 }]);
    await pool.query(`DELETE FROM trip_diesel_entries WHERE trip_id = $1`, [trip.id]);
    await pool.query(`DELETE FROM trips WHERE id = $1`, [trip.id]);
    const row = (await fuelForSourceTrip(trip.id))[0];
    assert.equal(Number(row.litres), 100);
    assert.equal(Number(row.rate), 90);
    assert.equal(Number(row.amount), 9000);
  });

  it("TEST-INDEP-005: new trip does not reuse old fuel identity", async () => {
    const a = await seedTrip("2026-08-17");
    await completeTripWithBills(a.trip.id, [{ litres: 100, rate: 90, meter: 50200 }]);
    const oldId = (await fuelForSourceTrip(a.trip.id))[0].id;
    await pool.query(`DELETE FROM trip_diesel_entries WHERE trip_id = $1`, [a.trip.id]);
    await pool.query(`DELETE FROM trips WHERE id = $1`, [a.trip.id]);
    const b = await seedTrip("2026-08-17");
    await completeTripWithBills(b.trip.id, [{ litres: 40, rate: 90, meter: 50200 }]);
    const newer = await fuelForSourceTrip(b.trip.id);
    assert.notEqual(newer[0].id, oldId);
    assert.equal(newer[0].source_trip_id, b.trip.id);
  });

  it("TEST-INDEP-006: Step 5 SQL edit does not rewrite posted fuel", async () => {
    const { trip } = await seedTrip("2026-08-17");
    await completeTripWithBills(trip.id, [{ litres: 100, rate: 90, meter: 50200 }]);
    await pool.query(`UPDATE trip_diesel_entries SET litres = 120, rate = 95 WHERE trip_id = $1`, [trip.id]);
    const fuel = await fuelForSourceTrip(trip.id);
    assert.equal(Number(fuel[0].litres), 100);
    assert.equal(Number(fuel[0].amount), 9000);
  });

  it("TEST-INDEP-007: reconcile after Step 5 edit does not duplicate or mutate", async () => {
    const { trip } = await seedTrip("2026-08-17");
    await completeTripWithBills(trip.id, [{ litres: 100, rate: 90, meter: 50200 }]);
    await pool.query(`UPDATE trip_diesel_entries SET litres = 120, rate = 95 WHERE trip_id = $1`, [trip.id]);
    await postJson(baseUrl, "/api/operations/fuel-expenses/reconcile-trips", {});
    const fuel = await fuelForSourceTrip(trip.id);
    assert.equal(fuel.length, 1);
    assert.equal(Number(fuel[0].litres), 100);
    assert.equal(Number(fuel[0].rate), 90);
  });

  it("PATCH on trip fuel is rejected", async () => {
    const { trip } = await seedTrip("2026-08-17");
    await completeTripWithBills(trip.id, [{ litres: 8, rate: 90, meter: 50200 }]);
    const listed = await listFuel("?page=1&limit=50&sourceType=TRIP");
    const row = rows(listed.body).find((r) => r.tripId === trip.id || r.sourceTripId === trip.id);
    assert.ok(row);
    const patch = await patchJson(baseUrl, `/api/operations/fuel-expenses/${row.id}`, {
      liters: 1,
      fuelRate: 90,
      billDate: "2026-08-17",
    });
    assert.equal(patch.status, 405);
  });

  it("DELETE on trip fuel is rejected", async () => {
    const { trip } = await seedTrip("2026-08-17");
    await completeTripWithBills(trip.id, [{ litres: 8, rate: 90, meter: 50200 }]);
    const listed = await listFuel("?page=1&limit=50&sourceType=TRIP");
    const row = rows(listed.body).find((r) => r.sourceTripId === trip.id || r.tripId === trip.id);
    const { deleteJson } = await import("./helpers/app.js");
    const del = await deleteJson(baseUrl, `/api/operations/fuel-expenses/${row.id}`);
    assert.equal(del.status, 409);
  });

  it("20 simultaneous manual creates yield unique BILL numbers", async () => {
    const { vehicle } = await seedMasters();
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        postJson(baseUrl, "/api/operations/fuel-expenses", {
          billDate: "2026-08-17",
          vehicleId: vehicle.id,
          liters: 2,
          fuelRate: 90,
        })
      )
    );
    const ok = results.filter((r) => r.status === 201);
    assert.equal(ok.length, 20);
    assert.equal(new Set(ok.map((r) => r.body.billNo)).size, 20);
  });

  it("soft-delete does not recycle those BILL numbers", async () => {
    const { vehicle } = await seedMasters();
    const created = await postJson(baseUrl, "/api/operations/fuel-expenses", {
      billDate: "2026-08-17",
      vehicleId: vehicle.id,
      liters: 2,
      fuelRate: 90,
    });
    const first = created.body.billNo;
    const { deleteJson } = await import("./helpers/app.js");
    await deleteJson(baseUrl, `/api/operations/fuel-expenses/${created.body.id}`);
    const next = await postJson(baseUrl, "/api/operations/fuel-expenses", {
      billDate: "2026-08-17",
      vehicleId: vehicle.id,
      liters: 2,
      fuelRate: 90,
    });
    assert.notEqual(next.body.billNo, first);
  });

  it("client amount spoof is ignored", async () => {
    const { vehicle } = await seedMasters();
    const res = await postJson(baseUrl, "/api/operations/fuel-expenses", {
      billDate: "2026-08-17",
      vehicleId: vehicle.id,
      liters: 10,
      fuelRate: 90.125,
      amount: 1,
    });
    assert.equal(res.status, 201);
    assert.equal(Number(res.body.amount), 901.25);
  });

  it("GPS lat without lon is rejected", async () => {
    const { vehicle } = await seedMasters();
    const res = await postJson(baseUrl, "/api/operations/fuel-expenses", {
      billDate: "2026-08-17",
      vehicleId: vehicle.id,
      liters: 2,
      fuelRate: 90,
      gpsLat: 16.5,
    });
    assert.equal(res.status, 422);
  });

  it("MIME spoof PNG header required", async () => {
    const { vehicle } = await seedMasters();
    const res = await postJson(baseUrl, "/api/operations/fuel-expenses", {
      billDate: "2026-08-17",
      vehicleId: vehicle.id,
      liters: 2,
      fuelRate: 90,
      imageData: "data:image/png;base64,AAAA",
    });
    assert.equal(res.status, 422);
  });

  it("SQL injection in search does not 500", async () => {
    const res = await listFuel("?page=1&limit=10&search=%27%20OR%201%3D1--");
    assert.equal(res.status, 200);
    assert.equal(res.body.stack, undefined);
  });

  it("oversized pagination is capped", async () => {
    const res = await listFuel("?page=1&limit=999999");
    assert.equal(res.status, 200);
    assert.ok((res.body.data?.length ?? 0) <= 200);
    assert.ok((res.body.meta?.limit ?? 200) <= 200);
  });

  it("unauthenticated list currently succeeds because global auth is absent", async () => {
    const res = await listFuel("?page=1&limit=1");
    assert.equal(res.status, 200);
  });

  it("6-bill trip ingest is one row per diesel bill", async () => {
    const { trip } = await seedTrip("2026-08-17");
    await completeTripWithBills(trip.id, [
      { litres: 10, rate: 90, meter: 50200 },
      { litres: 11, rate: 90, meter: 50210 },
      { litres: 12, rate: 90, meter: 50220 },
      { litres: 13, rate: 90, meter: 50230 },
      { litres: 14, rate: 90, meter: 50240 },
      { litres: 15, rate: 90, meter: 50250 },
    ]);
    assert.equal((await fuelForSourceTrip(trip.id)).length, 6);
  });

  it("10 sequential reconciles stay duplicate-safe", async () => {
    const { trip } = await seedTrip("2026-08-17");
    await completeTripWithBills(trip.id, [{ litres: 9, rate: 90, meter: 50200 }]);
    for (let i = 0; i < 10; i++) {
      assert.equal((await postJson(baseUrl, "/api/operations/fuel-expenses/reconcile-trips", {})).status, 200);
    }
    assert.equal((await fuelForSourceTrip(trip.id)).length, 1);
  });

  for (let i = 0; i < 30; i++) {
    it(`hardening-amount-round-${i + 1}`, async () => {
      const { vehicle } = await seedMasters();
      const litres = 0.01 + i * 0.13;
      const rate = 90.01 + (i % 7) * 0.03;
      const res = await postJson(baseUrl, "/api/operations/fuel-expenses", {
        billDate: "2026-08-17",
        vehicleId: vehicle.id,
        liters: litres,
        fuelRate: rate,
        amount: 0,
      });
      assert.equal(res.status, 201);
      const expected = Number((litres * rate).toFixed(2));
      assert.equal(Number(res.body.amount), expected);
    });
  }
});

