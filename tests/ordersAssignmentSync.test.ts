/**
 * Orders ↔ Trip Entry — Assignment → Step 4 → delivery-count sync.
 *
 * Proves, against the real service + real PGlite-Postgres (no mocks):
 *
 *   1. Order Assignment PERSISTS the day's collected shops as `[ORDER]` plan
 *      rows onto the SAME existing vehicle trip — no second trip, no new
 *      trip number, no duplicate shop rows, and Step 4 is NOT submitted.
 *   2. Those exact rows are what Trip Entry Step 4 loads (same trip_id).
 *   3. Delivering one shop in Step 4 (real delivered weight + a pickup box)
 *      turns exactly one plan row into a captured delivery — 5 → 4 → 3 → 2
 *      → 1 → 0 remaining — while every other plan row is untouched.
 *   4. The collection container is never mutated by any of this.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startApp, type TestApp } from "./helpers/app.js";
import { applySchema, shutdownTestEnv, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");
const { tripsService } = await import("../src/services/tripsService.js");

after(async () => {
  await shutdownTestEnv({ app, testDb, pool });
});

const ORD_NO = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-01`;
const SHOP_COUNT = 5;

let shopIds: number[] = [];
let vehicleTripId = 0;

before(async () => {
  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: "OASV-01",
    vehicleType: "Lorry",
    noOfBoxes: 60,
    birdCapacity: 5000,
    capacityKg: 9000,
    engineNumber: "OASV-ENG-1",
    chassisNumber: "OASV-CHS-1",
    status: "Active",
  });
  const driver = await mastersService.upsertEmployee({
    employeeName: "OAS Driver",
    department: "Driver",
    role: "Driver",
    phoneNumber: "9333300001",
    licenseNumber: "OAS-DL-1",
    salary: 18000,
    status: "Active",
  });
  const supervisor = await mastersService.upsertEmployee({
    employeeName: "OAS Supervisor",
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: "9333300002",
    salary: 24000,
    status: "Active",
  });
  const farm = await mastersService.upsertFarm({
    farmName: "OAS Farm",
    ownerName: "Owner",
    supervisorName: "Farm Sup",
    phoneNumber: "9333300003",
    village: "Village",
    address: "Addr",
    capacity: 30000,
    status: "Active",
  });
  const birdType = await mastersService.upsertBirdType({
    birdType: "OAS Broiler",
    averageWeight: 2,
    status: "Active",
  });
  for (let i = 1; i <= SHOP_COUNT; i += 1) {
    const shop = await mastersService.upsertShop({
      associationType: "Ass Vij",
      shopName: `OAS Shop ${i}`,
      ownerName: "Owner",
      phoneNumber: `93333100${String(i).padStart(2, "0")}`,
      city: "Village",
      address: "Addr",
      email: `oas-shop-${i}@test.local`,
      status: "Active",
    });
    shopIds.push(shop.id);
  }

  // The Steps-1→3-complete vehicle trip (10 pickup boxes @ 30 birds / 60 kg).
  const trip = await tripsService.save(null, {
    tripNo: "IGNORED",
    tripDate: new Date().toISOString().slice(0, 10),
    status: "Draft",
    vehicleId: vehicle.id,
    vehicleNo: vehicle.vehicleNumber,
    driverId: driver.id,
    driverName: driver.employeeName,
    supervisorId: supervisor.id,
    supervisorName: supervisor.employeeName,
    sourceFarmId: farm.id,
    sourceFarm: farm.farmName,
    birdTypeId: birdType.id,
    birdType: birdType.birdType,
    openingMeter: 1000,
    avgBirdWeight: 2,
    startStepSubmitted: true,
    farmStepSubmitted: true,
    pickupStepSubmitted: true,
    boxDetails: Array.from({ length: 10 }, (_, i) => ({ boxNo: i + 1, birds: 30, weight: 60 })),
  } as Record<string, unknown>);
  vehicleTripId = Number((trip as { id: number }).id);
});

/** One assignment plan row (box-less, weight-0, `[ORDER] O:<container>` tagged). */
function planRow(i: number) {
  return {
    id: 0,
    clientKey: `oas-${i}`,
    serialNo: i,
    boxNo: 2,
    shopId: shopIds[i - 1],
    shopName: `OAS Shop ${i}`,
    birdType: "",
    birds: 20,
    weight: 0,
    mortality: 0,
    mortKg: 0,
    rate: null,
    amount: 0,
    remarks: `[ORDER] O:${ORD_NO}`,
    deliveryMode: "box" as const,
    selectedBoxIds: [] as number[],
  };
}

async function vehicleRows() {
  const r = await pool.query(
    `SELECT shop_id, remarks, birds, weight, delivery_mode,
            (SELECT COUNT(*) FROM trip_delivery_boxes b WHERE b.delivery_id = d.id)::int AS box_count
       FROM trip_deliveries d WHERE trip_id = $1 ORDER BY serial_no, id`,
    [vehicleTripId]
  );
  return r.rows as Array<{
    shop_id: number;
    remarks: string;
    birds: number;
    weight: string;
    delivery_mode: string;
    box_count: number;
  }>;
}

/** The Orders "captured / delivered" rule, mirrored from ordersUtils.isCapturedRow. */
const isCaptured = (row: { weight: string; box_count: number }) =>
  Number(row.weight) > 0 || row.box_count > 0;

async function countTrips(like: string) {
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM trips WHERE trip_no LIKE $1`,
    [like]
  );
  return Number(r.rows[0].c);
}

describe("Orders Assignment → Step 4 → delivery count", () => {
  it("Finish Collection creates one vehicle-less ORD container with 5 [ORDER] rows", async () => {
    const container = await tripsService.submitStep(0, "deliveries", {
      mode: "save",
      tripNo: ORD_NO,
      startStepSubmitted: true,
      deliveries: Array.from({ length: SHOP_COUNT }, (_, i) => ({
        ...planRow(i + 1),
        clientKey: `oasc-${i + 1}`,
      })),
    } as Record<string, unknown>);
    assert.equal(container.startStepSubmitted, true);
    assert.ok(!container.vehicleId);
    assert.equal(container.deliveries.length, SHOP_COUNT);
  });

  it("Finish Assignment persists the 5 plan rows onto the SAME vehicle trip — no new trip / no Step 4 submit", async () => {
    const trCountBefore = await countTrips("%");
    const saved = await tripsService.submitStep(vehicleTripId, "deliveries", {
      mode: "save",
      deliveries: Array.from({ length: SHOP_COUNT }, (_, i) => planRow(i + 1)),
    } as Record<string, unknown>);

    assert.equal(saved.id, vehicleTripId, "same trip id");
    assert.equal(saved.deliveryStepSubmitted, false, "assignment does NOT submit Step 4");
    assert.equal(await countTrips("%"), trCountBefore, "no new trip row");

    const rows = await vehicleRows();
    assert.equal(rows.length, SHOP_COUNT, "exactly one row per assigned shop (no duplicates)");
    assert.deepEqual(
      rows.map((r) => r.shop_id).sort((a, b) => a - b),
      [...shopIds].sort((a, b) => a - b)
    );
    assert.ok(rows.every((r) => r.remarks.startsWith("[ORDER]")), "every row keeps the [ORDER] marker");
    assert.equal(rows.filter(isCaptured).length, 0, "nothing delivered yet → 5 pending");
  });

  it("delivering each shop in Step 4 drops remaining 5 → 4 → 3 → 2 → 1 → 0", async () => {
    for (let delivered = 1; delivered <= SHOP_COUNT; delivered += 1) {
      await tripsService.saveDeliveries(vehicleTripId, {
        deliveries: Array.from({ length: SHOP_COUNT }, (_, i) => {
          const k = i + 1;
          if (k > delivered) return planRow(k); // still just planned
          return {
            ...planRow(k),
            deliveryMode: "box" as const,
            selectedBoxIds: [k], // one real pickup box
            birds: 30,
            weight: 60,
            mortality: 0,
            mortKg: 0,
          };
        }),
      } as Parameters<typeof tripsService.saveDeliveries>[1]);

      const rows = await vehicleRows();
      const capturedCount = rows.filter(isCaptured).length;
      assert.equal(capturedCount, delivered, `captured after delivering ${delivered}`);
      assert.equal(
        SHOP_COUNT - capturedCount,
        SHOP_COUNT - delivered,
        `remaining after delivering ${delivered}`
      );
      // Undelivered rows stay untouched plan rows.
      for (const r of rows) {
        if (!isCaptured(r)) {
          assert.equal(Number(r.weight), 0);
          assert.equal(r.box_count, 0);
        }
      }
      const trip = await tripsService.getById(vehicleTripId);
      assert.equal(trip.deliveryStepSubmitted, false, "still not Step-4-submitted mid-delivery");
    }
  });

  it("the collection container is never mutated by assignment or delivery", async () => {
    const containers = await pool.query(
      `SELECT id, start_step_submitted,
              (SELECT COUNT(*)::int FROM trip_deliveries d WHERE d.trip_id = t.id) AS rows
         FROM trips t WHERE trip_no = $1`,
      [ORD_NO]
    );
    assert.equal(containers.rowCount, 1, "still exactly one container");
    assert.equal(containers.rows[0].start_step_submitted, true);
    assert.equal(containers.rows[0].rows, SHOP_COUNT, "container still has its 5 collected shops");
  });
});
