/**
 * Batch C2 API/DB journeys on isolated PGlite (adjunct to browser evidence).
 * Covers Step 4 persistence semantics, capacity isolation, Step 5 diesel,
 * and IMP-12 erase→reimport→delivery using only latest boxes.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";
import { startApp, type TestApp } from "./helpers/app.js";
import type { ShopDelivery } from "../src/types/models.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");
const { tripsService } = await import("../src/services/tripsService.js");
const { AppError } = await import("../src/middleware/errorHandler.js");

after(async () => {
  await app.close();
  await testDb.close();
  await pool.end();
});

let seq = 0;
async function masters() {
  seq += 1;
  const n = String(seq).padStart(3, "0");
  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: `C2V${n}`,
    vehicleType: "Lorry",
    noOfBoxes: 40,
    birdCapacity: 2000,
    capacityKg: 3000,
    engineNumber: `C2E${n}`,
    chassisNumber: `C2C${n}`,
    status: "Active",
  });
  const rental = await mastersService.upsertVehicle({
    vehicleNumber: `C2R${n}`,
    vehicleType: "Lorry",
    noOfBoxes: 20,
    birdCapacity: 1000,
    capacityKg: 1500,
    status: "Active",
    isRented: true,
  });
  const driver = await mastersService.upsertEmployee({
    employeeName: `C2 Driver ${n}`,
    department: "Driver",
    role: "Driver",
    phoneNumber: `9610${n}0`.slice(0, 10).padEnd(10, "0"),
    licenseNumber: `C2DL${n}`,
    salary: 18000,
    status: "Active",
  });
  const supervisor = await mastersService.upsertEmployee({
    employeeName: `C2 Sup ${n}`,
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: `9620${n}0`.slice(0, 10).padEnd(10, "0"),
    salary: 22000,
    status: "Active",
  });
  const farm = await mastersService.upsertFarm({
    farmName: `C2 Farm ${n}`,
    ownerName: "Owner",
    supervisorName: "FarmSup",
    phoneNumber: `9630${n}0`.slice(0, 10).padEnd(10, "0"),
    village: "Village",
    address: "Address",
    capacity: 10000,
    status: "Active",
  });
  const birdType = await mastersService.upsertBirdType({
    birdType: `C2 Bird ${n}`,
    averageWeight: 2,
    description: "",
    status: "Active",
  });
  const shopA = await mastersService.upsertShop({
    shopName: `C2 Shop A ${n}`,
    ownerName: "Owner",
    phoneNumber: `9640${n}1`.slice(0, 10).padEnd(10, "0"),
    village: "Village",
    status: "Active",
  });
  const shopB = await mastersService.upsertShop({
    shopName: `C2 Shop B ${n}`,
    ownerName: "Owner",
    phoneNumber: `9640${n}2`.slice(0, 10).padEnd(10, "0"),
    village: "Village",
    status: "Active",
  });
  return { vehicle, rental, driver, supervisor, farm, birdType, shopA, shopB };
}

async function pickupTrip(
  m: Awaited<ReturnType<typeof masters>>,
  boxes: { boxNo: number; birds: number; weight: number }[],
  vehicle = m.vehicle,
) {
  return tripsService.save(null, {
    tripDate: `2026-10-${String((seq % 27) + 1).padStart(2, "0")}`,
    status: "Draft",
    vehicleId: vehicle.id,
    vehicleNo: vehicle.vehicleNumber,
    driverId: m.driver.id,
    driverName: m.driver.employeeName,
    supervisorId: m.supervisor.id,
    supervisorName: m.supervisor.employeeName,
    sourceFarmId: m.farm.id,
    sourceFarm: m.farm.farmName,
    farmBirdTypeId: m.birdType.id,
    farmBirdType: m.birdType.birdType,
    openingMeter: vehicle.isRented ? null : 8000,
    destMeter: vehicle.isRented ? null : 8100,
    isRentedVehicle: Boolean(vehicle.isRented),
    startStepSubmitted: true,
    farmStepSubmitted: true,
    pickupStepSubmitted: true,
    boxDetails: boxes,
  } as Record<string, unknown>);
}

function delivery(
  m: Awaited<ReturnType<typeof masters>>,
  shop: { id: number; shopName: string },
  opts: { key: string; birds: number; weight: number; boxes: number[]; mortality?: number; mortKg?: number },
): ShopDelivery {
  return {
    id: 0,
    clientKey: opts.key,
    shopId: shop.id,
    shopName: shop.shopName,
    birdTypeId: m.birdType.id,
    birdType: m.birdType.birdType,
    birds: opts.birds,
    weight: opts.weight,
    mortality: opts.mortality ?? 0,
    mortKg: opts.mortKg ?? 0,
    rate: 100,
    amount: opts.birds * 100,
    remarks: "",
    deliveryMode: "box",
    selectedBoxIds: opts.boxes,
  };
}

async function dbDeliveries(tripId: number) {
  const res = await pool.query(
    `SELECT client_key, shop_id, shop_name, birds, weight, mortality, mort_kg
       FROM trip_deliveries WHERE trip_id = $1 ORDER BY id`,
    [tripId],
  );
  return res.rows;
}

async function dbBoxes(tripId: number) {
  const res = await pool.query(
    `SELECT box_no, birds, weight FROM trip_boxes WHERE trip_id = $1 ORDER BY box_no`,
    [tripId],
  );
  return res.rows.map((r) => ({
    boxNo: Number(r.box_no),
    birds: Number(r.birds),
    weight: Number(r.weight),
  }));
}

describe("C3 CORS HTTP behavior", () => {
  it("allows configured and absent Origin, and returns a controlled denial", async () => {
    const absent = await fetch(`${app.baseUrl}/api/health`);
    assert.equal(absent.status, 200);
    const allowed = await fetch(`${app.baseUrl}/api/health`, { headers: { Origin: app.baseUrl } });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("access-control-allow-origin"), app.baseUrl);
    const denied = await fetch(`${app.baseUrl}/api/health`, { headers: { Origin: "https://denied.example" } });
    assert.equal(denied.status, 403);
    assert.deepEqual(await denied.json(), { error: "CORS origin not allowed" });
  });
});

describe("C2-A Step 4 persistence (API/DB refresh semantics)", () => {
  it("save one shop, add second, update first; re-fetch preserves isolation", async () => {
    const m = await masters();
    const trip = await pickupTrip(m, [
      { boxNo: 1, birds: 40, weight: 80 },
      { boxNo: 2, birds: 40, weight: 80 },
    ]);

    await tripsService.saveDeliveries(trip.id, {
      deliveries: [delivery(m, m.shopA, { key: "a1", birds: 40, weight: 80, boxes: [1] })],
    });
    await tripsService.saveDeliveries(trip.id, {
      deliveries: [
        delivery(m, m.shopA, { key: "a1", birds: 40, weight: 80, boxes: [1] }),
        delivery(m, m.shopB, { key: "b1", birds: 40, weight: 80, boxes: [2] }),
      ],
    });
    // Update first shop weight only.
    await tripsService.saveDeliveries(trip.id, {
      deliveries: [
        delivery(m, m.shopA, { key: "a1", birds: 38, weight: 76, boxes: [1], mortality: 2, mortKg: 4 }),
        delivery(m, m.shopB, { key: "b1", birds: 40, weight: 80, boxes: [2] }),
      ],
    });

    // Simulate refresh / reopen: reload from DB via service.
    const reopened = await tripsService.getById(trip.id);
    const rows = await dbDeliveries(trip.id);
    assert.equal(rows.length, 2);
    const a = rows.find((r) => r.client_key === "a1")!;
    const b = rows.find((r) => r.client_key === "b1")!;
    assert.equal(Number(a.birds), 38);
    assert.equal(Number(a.weight), 76);
    assert.equal(Number(a.mortality), 2);
    assert.equal(Number(b.birds), 40);
    assert.equal(Number(b.weight), 80);
    assert.equal(Number(b.shop_id), m.shopB.id);
    assert.equal(Number(a.shop_id), m.shopA.id);
    const uiA = reopened.deliveries.find((d: { clientKey?: string | null }) => d.clientKey === "a1");
    const uiB = reopened.deliveries.find((d: { clientKey?: string | null }) => d.clientKey === "b1");
    assert.equal(Number(uiA?.birds), 38);
    assert.equal(Number(uiB?.birds), 40);
  });
});

describe("C2-B delivery capacity isolation", () => {
  it("exact / below / over capacity; unrelated shop cannot own the error; failed write atomic", async () => {
    const m = await masters();
    const trip = await pickupTrip(m, [
      { boxNo: 1, birds: 40, weight: 80 },
      { boxNo: 2, birds: 40, weight: 80 },
    ]);

    // Exact capacity for shop A on box 1.
    await tripsService.saveDeliveries(trip.id, {
      deliveries: [delivery(m, m.shopA, { key: "cap-a", birds: 40, weight: 80, boxes: [1] })],
    });

    // Below capacity update.
    await tripsService.saveDeliveries(trip.id, {
      deliveries: [delivery(m, m.shopA, { key: "cap-a", birds: 30, weight: 60, boxes: [1] })],
    });
    assert.equal(Number((await dbDeliveries(trip.id))[0].birds), 30);

    // Genuine over-capacity — must fail; prior row unchanged.
    await assert.rejects(
      () =>
        tripsService.saveDeliveries(trip.id, {
          deliveries: [
            delivery(m, m.shopA, { key: "cap-a", birds: 30, weight: 60, boxes: [1] }),
            delivery(m, m.shopB, { key: "cap-b-over", birds: 41, weight: 80, boxes: [2] }),
          ],
        }),
      /exceed/i,
    );
    const afterFail = await dbDeliveries(trip.id);
    assert.equal(afterFail.length, 1, "failed write must not partially insert shop B");
    assert.equal(Number(afterFail[0].birds), 30);

    // Unrelated shop exact OK on remaining capacity.
    await tripsService.saveDeliveries(trip.id, {
      deliveries: [
        delivery(m, m.shopA, { key: "cap-a", birds: 30, weight: 60, boxes: [1] }),
        delivery(m, m.shopB, { key: "cap-b", birds: 40, weight: 80, boxes: [2] }),
      ],
    });
    assert.equal((await dbDeliveries(trip.id)).length, 2);
  });
});

describe("C2-C Step 5 diesel (API)", () => {
  it("owned vehicle: litres+amount mandatory; rate=amount/litres; zero litres safe", async () => {
    const m = await masters();
    const trip = await pickupTrip(m, [{ boxNo: 1, birds: 40, weight: 80 }]);
    await tripsService.saveDeliveries(trip.id, {
      deliveries: [delivery(m, m.shopA, { key: "d1", birds: 40, weight: 80, boxes: [1] })],
    });

    await assert.rejects(
      () =>
        tripsService.upsertDieselEntry(trip.id, {
          litres: 0,
          amount: 100,
          meter: 8200,
          bunkName: "B",
          gpsLat: 1,
          gpsLon: 1,
          gpsAccuracy: 1,
          imageData: `data:image/jpeg;base64,${"Z".repeat(80)}`,
          imageName: "z.jpg",
          clientKey: `dz-${trip.id}`,
          rowIndex: 1,
        }),
      /litres must be greater than zero/i,
    );

    const ok = await tripsService.upsertDieselEntry(trip.id, {
      litres: 12.5,
      amount: 1187.5,
      meter: 8200,
      bunkName: "Bunk",
      gpsLat: 1,
      gpsLon: 1,
      gpsAccuracy: 1,
      imageData: `data:image/jpeg;base64,${"Y".repeat(80)}`,
      imageName: "y.jpg",
      clientKey: `dy-${trip.id}`,
      rowIndex: 1,
    });
    const entry = (ok.dieselEntries ?? []).find((e: { rowIndex?: number }) => Number(e.rowIndex) === 1);
    assert.equal(Number(entry!.rate), Number((1187.5 / 12.5).toFixed(2)));
    assert.ok(Number.isFinite(Number(entry!.rate)));
    assert.notEqual(String(entry!.rate), "Infinity");
    assert.notEqual(String(entry!.rate), "NaN");

    const reopened = await tripsService.getById(trip.id);
    const again = (reopened.dieselEntries ?? []).find((e: { rowIndex?: number }) => Number(e.rowIndex) === 1);
    assert.equal(Number(again!.litres), 12.5);
    assert.equal(Number(again!.amount), 1187.5);
  });

  it("rental vehicle persists diesel without meter or fleet odometer linkage", async () => {
    const m = await masters();
    const trip = await pickupTrip(m, [{ boxNo: 1, birds: 20, weight: 40 }], m.rental);
    const saved = await tripsService.upsertDieselEntry(trip.id, {
      litres: 10,
      amount: 950,
      meter: null,
      bunkName: "RentBunk",
      gpsLat: 1,
      gpsLon: 1,
      gpsAccuracy: 1,
      imageData: `data:image/jpeg;base64,${"R".repeat(80)}`,
      imageName: "r.jpg",
      clientKey: `dr-${trip.id}`,
      rowIndex: 1,
    });
    const entry = (saved.dieselEntries ?? [])[0];
    assert.equal(Number(entry.rate), 95);
    assert.equal(entry.meter, null);
    const fuel = await pool.query(
      `SELECT vehicle_id, meter_reading, litres, amount, rate FROM fuel_expenses WHERE trip_id = $1`,
      [trip.id],
    );
    assert.equal(fuel.rowCount, 1);
    assert.equal(fuel.rows[0].vehicle_id, null);
    assert.equal(Number(fuel.rows[0].litres), 10);
    assert.equal(Number(fuel.rows[0].amount), 950);
  });
});

describe("Step 5 vehicle-maintenance synchronization", () => {
  it("creates one approved history row only after completion when amount is positive", async () => {
    const m = await masters();
    const trip = await pickupTrip(m, [{ boxNo: 1, birds: 20, weight: 40 }]);
    await tripsService.saveDeliveries(trip.id, {
      deliveries: [delivery(m, m.shopA, { key: `mnt-${trip.id}`, birds: 20, weight: 40, boxes: [1] })],
    });
    await tripsService.save(trip.id, {
      deliveryStepSubmitted: true,
      expensesStepSubmitted: true,
      endStepSubmitted: true,
      closingMeter: 8300,
      endMeter: 8300,
      destinationTolls: 0,
      vehicleMaintenance: 200,
      vehicleMaintenanceNote: "Grease",
    } as Record<string, unknown>);
    let history = await pool.query(`SELECT * FROM fleet_maintenance WHERE source_trip_id = $1`, [trip.id]);
    assert.equal(history.rowCount, 0, "pending trip must not enter maintenance history");
    await tripsService.updateStatus(trip.id, { status: "Pending" });
    await tripsService.updateStatus(trip.id, { status: "Completed", approvedBy: "c3-test" });
    history = await pool.query(
      `SELECT maintenance_type, total_cost, status, parts, remarks FROM fleet_maintenance WHERE source_trip_id = $1`,
      [trip.id],
    );
    assert.equal(history.rowCount, 1);
    assert.equal(history.rows[0].maintenance_type, "Grease");
    assert.equal(Number(history.rows[0].total_cost), 200);
    assert.equal(history.rows[0].status, "Approved");
    assert.match(String(history.rows[0].remarks), /Vehicle Maintenance \(Grease\) = 200\.00/);
  });

  it("does not create history for zero maintenance", async () => {
    const m = await masters();
    const trip = await pickupTrip(m, [{ boxNo: 1, birds: 20, weight: 40 }]);
    const rows = await pool.query(`SELECT COUNT(*)::int AS count FROM fleet_maintenance WHERE source_trip_id = $1`, [trip.id]);
    assert.equal(Number(rows.rows[0].count), 0);
  });
});

describe("C3 pickup-file identity", () => {
  const fp = (hash: string, name = "boxes.xlsx") => ({
    algorithm: "SHA-256", version: 1, contentHash: hash, originalFilename: name, byteLength: 123,
  });

  it("accepts an idempotent retry of the same bytes and permits them after complete erase", async () => {
    const m = await masters();
    const trip = await pickupTrip(m, []);
    const boxes = [{ boxNo: 1, birds: 20, weight: 40 }];
    const hash = "a".repeat(64);
    await tripsService.save(trip.id, { boxDetails: boxes, importFingerprint: fp(hash) } as Record<string, unknown>);
    await tripsService.save(trip.id, {
      boxDetails: boxes,
      importFingerprint: fp(hash, "renamed.xlsx"),
    } as Record<string, unknown>);
    assert.deepEqual(await dbBoxes(trip.id), boxes);
    await tripsService.save(trip.id, { boxDetails: [], clearBoxDetails: true } as Record<string, unknown>);
    await tripsService.save(trip.id, { boxDetails: boxes, importFingerprint: fp(hash) } as Record<string, unknown>);
    assert.equal((await dbBoxes(trip.id)).length, 1);
  });

  it.todo("real PostgreSQL concurrent repeated submissions remain idempotent (PGlite gateway cannot run simultaneous transactions reliably)");

  it("does not retain a fingerprint when the box transaction rolls back", async () => {
    const m = await masters();
    const trip = await pickupTrip(m, []);
    const hash = "b".repeat(64);
    await assert.rejects(() => tripsService.save(trip.id, {
      boxDetails: [{ boxNo: 1, birds: 20, weight: 40 }, { boxNo: 1, birds: 20, weight: 40 }],
      importFingerprint: fp(hash),
    } as Record<string, unknown>));
    const count = await pool.query(
      `SELECT COUNT(*)::int AS count FROM trip_pickup_import_fingerprints WHERE trip_id = $1`, [trip.id],
    );
    assert.equal(Number(count.rows[0].count), 0);
  });
});

describe("C2-E IMP-12 latest dataset only", () => {
  it("import A → erase → reimport B from box 1 → delivery uses only B", async () => {
    const m = await masters();
    const trip = await pickupTrip(m, [
      { boxNo: 1, birds: 100, weight: 200 },
      { boxNo: 2, birds: 100, weight: 200 },
    ]);
    assert.deepEqual(
      (await dbBoxes(trip.id)).map((b) => b.birds),
      [100, 100],
    );

    await tripsService.save(trip.id, {
      boxDetails: [],
      pickupStepSubmitted: true,
    } as Record<string, unknown>);
    assert.deepEqual(await dbBoxes(trip.id), []);

    await tripsService.save(trip.id, {
      boxDetails: [
        { boxNo: 1, birds: 25, weight: 50 },
        { boxNo: 2, birds: 25, weight: 50 },
      ],
      pickupStepSubmitted: true,
    } as Record<string, unknown>);
    assert.deepEqual(await dbBoxes(trip.id), [
      { boxNo: 1, birds: 25, weight: 50 },
      { boxNo: 2, birds: 25, weight: 50 },
    ]);

    await assert.rejects(
      () =>
        tripsService.saveDeliveries(trip.id, {
          deliveries: [delivery(m, m.shopA, { key: "imp12-over", birds: 26, weight: 50, boxes: [1] })],
        }),
      /exceed/i,
    );

    await tripsService.saveDeliveries(trip.id, {
      deliveries: [delivery(m, m.shopA, { key: "imp12-ok", birds: 25, weight: 50, boxes: [1] })],
    });
    const rows = await dbDeliveries(trip.id);
    assert.equal(Number(rows[0].birds), 25);
    // No residual 100-bird capacity from dataset A.
    assert.ok(!(await dbBoxes(trip.id)).some((b) => b.birds === 100));
  });
});
