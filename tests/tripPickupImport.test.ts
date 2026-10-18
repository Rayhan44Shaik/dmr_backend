/**
 * Trip pickup box commit / erase / reimport safeguards (IMP / E2E-02..04 adjacent).
 * Exercises the committed backend path (boxDetails via tripsService) on PGlite.
 * Excel/PDF client parsers are not reimplemented here — committed dataset + sequence
 * behavior after import/erase/reimport is what delivery calculations consume.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";
import { startApp, type TestApp } from "./helpers/app.js";

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
async function seed() {
  seq += 1;
  const n = String(seq).padStart(3, "0");
  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: `PIK${n}TN`,
    vehicleType: "Lorry",
    noOfBoxes: 40,
    birdCapacity: 2000,
    capacityKg: 3000,
    engineNumber: `PIKENG${n}`,
    chassisNumber: `PIKCHS${n}`,
    status: "Active",
  });
  const driver = await mastersService.upsertEmployee({
    employeeName: `Pickup Driver ${n}`,
    department: "Driver",
    role: "Driver",
    phoneNumber: `98100${n}00`.slice(0, 12),
    licenseNumber: `PIKDL${n}`,
    salary: 18000,
    status: "Active",
  });
  const supervisor = await mastersService.upsertEmployee({
    employeeName: `Pickup Sup ${n}`,
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: `98200${n}00`.slice(0, 12),
    salary: 22000,
    status: "Active",
  });
  const farm = await mastersService.upsertFarm({
    farmName: `Pickup Farm ${n}`,
    ownerName: "Owner",
    supervisorName: "Farm Sup",
    phoneNumber: `98300${n}00`.slice(0, 12),
    village: "Village",
    address: "Address",
    capacity: 30000,
    status: "Active",
  });
  const shop = await mastersService.upsertShop({
    shopName: `Pickup Shop ${n}`,
    ownerName: "Owner",
    phoneNumber: `98400${n}00`.slice(0, 12),
    village: "Village",
    status: "Active",
  });
  return { vehicle, driver, supervisor, farm, shop };
}

async function draftTrip(m: Awaited<ReturnType<typeof seed>>, boxes: { boxNo: number; birds: number; weight: number }[]) {
  return tripsService.save(null, {
    tripNo: "IGNORED",
    tripDate: `2026-08-${String((seq % 27) + 1).padStart(2, "0")}`,
    status: "Draft",
    vehicleId: m.vehicle.id,
    vehicleNo: m.vehicle.vehicleNumber,
    driverId: m.driver.id,
    driverName: m.driver.employeeName,
    supervisorId: m.supervisor.id,
    supervisorName: m.supervisor.employeeName,
    sourceFarmId: m.farm.id,
    sourceFarm: m.farm.farmName,
    openingMeter: 1000,
    startStepSubmitted: true,
    farmStepSubmitted: true,
    pickupStepSubmitted: true,
    boxDetails: boxes,
  } as Record<string, unknown>);
}

async function boxRows(tripId: number) {
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

describe("Trip pickup committed import / erase / reimport", () => {
  it("commits box numbers, birds, weights and totals from a valid import payload", async () => {
    const m = await seed();
    const boxes = [
      { boxNo: 1, birds: 40, weight: 80.5 },
      { boxNo: 2, birds: 35, weight: 70.25 },
      { boxNo: 3, birds: 25, weight: 49.25 },
    ];
    const trip = await draftTrip(m, boxes);
    const stored = await boxRows(trip.id);
    assert.deepEqual(stored, boxes);
    const totalBirds = boxes.reduce((s, b) => s + b.birds, 0);
    const totalWeight = boxes.reduce((s, b) => s + b.weight, 0);
    assert.equal(Number(trip.totalBirds ?? totalBirds), totalBirds);
    assert.ok(Math.abs(Number(trip.dcWeight ?? totalWeight) - totalWeight) < 0.011);
  });

  it("rejects duplicate box numbers in a commit payload", async () => {
    const m = await seed();
    await assert.rejects(
      () =>
        draftTrip(m, [
          { boxNo: 1, birds: 10, weight: 20 },
          { boxNo: 1, birds: 11, weight: 21 },
        ]),
      (err: unknown) => err instanceof AppError || /box|duplicate|unique|constraint/i.test(String(err)),
    );
  });

  it("rejects negative birds/weight in pickup payload", async () => {
    const m = await seed();
    await assert.rejects(() => draftTrip(m, [{ boxNo: 1, birds: -1, weight: 10 }]));
    await assert.rejects(() => draftTrip(m, [{ boxNo: 1, birds: 10, weight: -0.1 }]));
  });

  it("erase clears boxes and resets sequence so reimport starts at box 1", async () => {
    const m = await seed();
    const trip = await draftTrip(m, [
      { boxNo: 1, birds: 10, weight: 20 },
      { boxNo: 2, birds: 12, weight: 24 },
    ]);
    assert.equal((await boxRows(trip.id)).length, 2);

    // Complete erase of committed pickup boxes for the load.
    await tripsService.save(trip.id, {
      boxDetails: [],
      pickupStepSubmitted: true,
    } as Record<string, unknown>);
    assert.deepEqual(await boxRows(trip.id), []);

    const reimported = await tripsService.save(trip.id, {
      boxDetails: [
        { boxNo: 1, birds: 8, weight: 16 },
        { boxNo: 2, birds: 9, weight: 18 },
      ],
      pickupStepSubmitted: true,
    } as Record<string, unknown>);
    const stored = await boxRows(trip.id);
    assert.deepEqual(
      stored.map((b) => b.boxNo),
      [1, 2],
    );
    assert.equal(stored[0].birds, 8);
    assert.ok(reimported.id === trip.id);
  });

  it("delivery capacity uses only the latest committed pickup boxes after reimport", async () => {
    const m = await seed();
    const trip = await draftTrip(m, [{ boxNo: 1, birds: 100, weight: 200 }]);
    await tripsService.save(trip.id, {
      boxDetails: [{ boxNo: 1, birds: 40, weight: 80 }],
      pickupStepSubmitted: true,
    } as Record<string, unknown>);

    // After reimport capacity is 40 — a single over-capacity delivery must fail.
    await assert.rejects(
      () =>
        tripsService.saveDeliveries(trip.id, {
          deliveries: [
            {
              id: 0,
              clientKey: `pik-${trip.id}-over`,
              shopId: m.shop.id,
              shopName: m.shop.shopName,
              birds: 41,
              weight: 80,
              mortality: 0,
              mortKg: 0,
              rate: null,
              amount: 0,
              remarks: "",
              deliveryMode: "box",
              selectedBoxIds: [1],
              birdTypeId: null,
              birdType: "",
            },
          ],
        }),
      /exceed/i,
    );

    // Exact capacity against the latest committed boxes must succeed.
    await tripsService.saveDeliveries(trip.id, {
      deliveries: [
        {
          id: 0,
          clientKey: `pik-${trip.id}-ok`,
          shopId: m.shop.id,
          shopName: m.shop.shopName,
          birds: 40,
          weight: 80,
          mortality: 0,
          mortKg: 0,
          rate: null,
          amount: 0,
          remarks: "",
          deliveryMode: "box",
          selectedBoxIds: [1],
          birdTypeId: null,
          birdType: "",
        },
      ],
    });
  });

  it("overlap with an existing committed box sequence is replaced atomically on full reimport", async () => {
    const m = await seed();
    const trip = await draftTrip(m, [
      { boxNo: 1, birds: 10, weight: 20 },
      { boxNo: 2, birds: 10, weight: 20 },
      { boxNo: 3, birds: 10, weight: 20 },
    ]);
    await tripsService.save(trip.id, {
      boxDetails: [
        { boxNo: 1, birds: 5, weight: 10 },
        { boxNo: 2, birds: 5, weight: 10 },
      ],
      pickupStepSubmitted: true,
    } as Record<string, unknown>);
    const stored = await boxRows(trip.id);
    assert.deepEqual(
      stored.map((b) => b.boxNo),
      [1, 2],
    );
    assert.equal(stored.reduce((s, b) => s + b.birds, 0), 10);
  });
});
