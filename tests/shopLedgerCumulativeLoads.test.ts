/**
 * Shop Ledger cumulative per-load breakdown (deliveriesByLoad).
 *
 * Covers one-load (legacy, no legs), two-load and three-load trips, zero
 * mortality, box vs weight mortality modes, sub-shop merging, and the core
 * data-integrity invariant: per-load actuals always sum back to the shop
 * totals, legacy totals are never split across loads, and nothing is
 * double-counted.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { startApp, type TestApp } from "./helpers/app.js";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");
const { tripsService } = await import("../src/services/tripsService.js");
const { shopLedgerService } = await import("../src/services/shopLedgerService.js");

after(async () => {
  await app.close();
  await testDb.close();
  await pool.end();
});

let seq = 0;

async function seedShop(opening: number): Promise<{ id: number; shopName: string }> {
  seq += 1;
  const shop = await mastersService.upsertShop({
    shopName: `LD Shop ${seq}`,
    ownerName: "Owner",
    phoneNumber: `975300${String(seq).padStart(4, "0")}`,
    village: "Village",
    address: "Addr",
    status: "Active",
    openingBalance: opening,
  });
  await pool.query(
    `UPDATE shops SET opening_balance = $2, current_balance = $2 WHERE id = $1`,
    [shop.id, opening]
  );
  return { id: shop.id, shopName: shop.shopName };
}

async function seedSupport() {
  seq += 1;
  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: `LDV${String(seq).padStart(4, "0")}`,
    vehicleType: "Lorry",
    noOfBoxes: 85,
    birdCapacity: 50000,
    capacityKg: 60000,
    engineNumber: `LDENG${seq}`,
    chassisNumber: `LDCHS${seq}`,
    status: "Active",
  });
  const driver = await mastersService.upsertEmployee({
    employeeName: `LD Driver ${seq}`,
    department: "Driver",
    role: "Driver",
    phoneNumber: `9344${String(seq).padStart(6, "0")}`,
    licenseNumber: `LDDL${seq}`,
    salary: 18000,
    status: "Active",
  });
  const supervisor = await mastersService.upsertEmployee({
    employeeName: `LD Sup ${seq}`,
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: `9444${String(seq).padStart(6, "0")}`,
    salary: 24000,
    status: "Active",
  });
  const farm = await mastersService.upsertFarm({
    farmName: `LD Farm ${seq}`,
    ownerName: "Owner X",
    supervisorName: "Supervisor X",
    phoneNumber: `9684${String(seq).padStart(6, "0")}`,
    village: "V",
    address: "A",
    capacity: 300000,
    status: "Active",
  });
  return { vehicle, driver, supervisor, farm };
}

async function makeCompletedTrip(
  sup: Awaited<ReturnType<typeof seedSupport>>,
  opts: { tripNo: string; tripDate: string; totalBirds: number; dcWeight: number }
) {
  return tripsService.save(null, {
    tripNo: opts.tripNo,
    tripDate: opts.tripDate,
    status: "Completed",
    startTime: `${opts.tripDate}T05:30:00.000Z`,
    vehicleId: sup.vehicle.id,
    vehicleNo: sup.vehicle.vehicleNumber,
    driverId: sup.driver.id,
    driverName: sup.driver.employeeName,
    supervisorId: sup.supervisor.id,
    supervisorName: sup.supervisor.employeeName,
    sourceFarmId: sup.farm.id,
    sourceFarm: sup.farm.farmName,
    openingMeter: 1000,
    startStepSubmitted: true,
    farmStepSubmitted: true,
    pickupStepSubmitted: true,
    deliveryStepSubmitted: true,
    expensesStepSubmitted: true,
    totalKm: 60,
    totalBirds: opts.totalBirds,
    dcWeight: opts.dcWeight,
  } as unknown as Record<string, unknown>);
}

async function addLeg(
  tripId: number,
  legIndex: number,
  opts: { totalBirds: number; dcWeight: number }
): Promise<number> {
  // tripsService.save already creates leg 1 — upsert so fixtures control its totals.
  const result = await pool.query<{ id: number }>(
    `INSERT INTO trip_legs (trip_id, leg_index, total_birds, dc_weight, pickup_step_submitted)
     VALUES ($1, $2, $3, $4, TRUE)
     ON CONFLICT (trip_id, leg_index)
     DO UPDATE SET total_birds = $3, dc_weight = $4, pickup_step_submitted = TRUE
     RETURNING id`,
    [tripId, legIndex, opts.totalBirds, opts.dcWeight]
  );
  return result.rows[0].id;
}

async function addDelivery(
  tripId: number,
  legId: number | null,
  shop: { id: number; shopName: string },
  opts: {
    birds: number;
    weight: number;
    mortality?: number;
    mortKg?: number;
    mode?: "box" | "weight";
    subShop?: string;
  }
): Promise<void> {
  seq += 1;
  const rate = 100;
  await pool.query(
    `INSERT INTO trip_deliveries
       (trip_id, leg_id, sale_no, shop_id, shop_name, sub_shop_name,
        birds, weight, mortality, mort_kg, delivery_mode, rate, amount)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      tripId, legId, `LD-SALE-${seq}`, shop.id, shop.shopName, opts.subShop ?? "",
      opts.birds, opts.weight, opts.mortality ?? 0, opts.mortKg ?? 0,
      opts.mode ?? "box", rate, Math.round(opts.weight * rate * 100) / 100,
    ]
  );
}

async function finishTrip(tripId: number): Promise<void> {
  await pool.query(`UPDATE trips SET rate_completed = TRUE WHERE id = $1`, [tripId]);
}

function sums(loads: Array<{ birds: number; weight: number; mortalityBirds: number; mortalityWeight: number; weightLoss: number }>) {
  return {
    birds: loads.reduce((s, l) => s + l.birds, 0),
    weight: Math.round(loads.reduce((s, l) => s + l.weight, 0) * 100) / 100,
    mortalityBirds: loads.reduce((s, l) => s + l.mortalityBirds, 0),
    mortalityWeight: Math.round(loads.reduce((s, l) => s + l.mortalityWeight, 0) * 100) / 100,
    weightLoss: Math.round(loads.reduce((s, l) => s + l.weightLoss, 0) * 100) / 100,
  };
}

describe("Shop Ledger cumulative per-load breakdown", () => {
  it("1. legacy single-load trip keeps its whole total on Load 1", async () => {
    const shop = await seedShop(0);
    const sup = await seedSupport();
    const trip = await makeCompletedTrip(sup, {
      tripNo: `LD-LEGACY-${seq}`, tripDate: "2026-08-08",
      totalBirds: 100, dcWeight: 200,
    });
    // No legs at all — the legacy combined total must not be split.
    await addDelivery(trip.id, null, shop, { birds: 90, weight: 180, mortality: 10, mortKg: 5 });
    await finishTrip(trip.id);

    const row = (await shopLedgerService.cumulativeQuantities({
      fromDate: "2026-08-08", toDate: "2026-08-08",
    })).find((r) => r.shopId === shop.id);
    assert.ok(row);
    assert.deepEqual(row.deliveriesByLoad, [
      { load: 1, birds: 90, weight: 180, mortalityBirds: 10, mortalityWeight: 5, weightLoss: 15 },
    ]);
    assert.deepEqual(sums(row.deliveriesByLoad), {
      birds: row.birds, weight: row.weight, mortalityBirds: row.mortalityBirds,
      mortalityWeight: row.mortalityWeight, weightLoss: row.weightLoss,
    });
  });

  it("2. two-load trip exposes actual per-load values that sum to the totals", async () => {
    const shop = await seedShop(0);
    const sup = await seedSupport();
    const trip = await makeCompletedTrip(sup, {
      tripNo: `LD-TWO-${seq}`, tripDate: "2026-08-08",
      totalBirds: 150, dcWeight: 300,
    });
    const leg1 = await addLeg(trip.id, 1, { totalBirds: 100, dcWeight: 200 });
    const leg2 = await addLeg(trip.id, 2, { totalBirds: 50, dcWeight: 100 });
    await addDelivery(trip.id, leg1, shop, { birds: 90, weight: 180, mortality: 10, mortKg: 5, mode: "box" });
    await addDelivery(trip.id, leg2, shop, { birds: 45, weight: 90, mortality: 5, mortKg: 99, mode: "weight" });
    await finishTrip(trip.id);

    const row = (await shopLedgerService.cumulativeQuantities({
      fromDate: "2026-08-08", toDate: "2026-08-08",
    })).find((r) => r.shopId === shop.id);
    assert.ok(row);
    assert.deepEqual(row.deliveriesByLoad, [
      { load: 1, birds: 90, weight: 180, mortalityBirds: 10, mortalityWeight: 5, weightLoss: 15 },
      { load: 2, birds: 45, weight: 90, mortalityBirds: 5, mortalityWeight: 0, weightLoss: 10 },
    ]);
    assert.deepEqual(sums(row.deliveriesByLoad), {
      birds: row.birds, weight: row.weight, mortalityBirds: row.mortalityBirds,
      mortalityWeight: row.mortalityWeight, weightLoss: row.weightLoss,
    });
    assert.equal(row.birds, 135);
    assert.equal(row.mortalityBirds, 15);
  });

  it("3. three-load trip with zero mortality reports zeros without tooltips data loss", async () => {
    const shop = await seedShop(0);
    const sup = await seedSupport();
    const trip = await makeCompletedTrip(sup, {
      tripNo: `LD-THREE-${seq}`, tripDate: "2026-08-08",
      totalBirds: 300, dcWeight: 600,
    });
    const legs = await Promise.all([1, 2, 3].map((index) =>
      addLeg(trip.id, index, { totalBirds: 100, dcWeight: 200 })));
    await addDelivery(trip.id, legs[0], shop, { birds: 100, weight: 200 });
    await addDelivery(trip.id, legs[1], shop, { birds: 100, weight: 200 });
    await addDelivery(trip.id, legs[2], shop, { birds: 100, weight: 200 });
    await finishTrip(trip.id);

    const row = (await shopLedgerService.cumulativeQuantities({
      fromDate: "2026-08-08", toDate: "2026-08-08",
    })).find((r) => r.shopId === shop.id);
    assert.ok(row);
    assert.equal(row.deliveriesByLoad.length, 3);
    assert.deepEqual(row.deliveriesByLoad.map((l) => l.load), [1, 2, 3]);
    assert.deepEqual(sums(row.deliveriesByLoad), {
      birds: 300, weight: 600, mortalityBirds: 0, mortalityWeight: 0, weightLoss: 0,
    });
    assert.equal(row.mortalityBirds, 0);
  });

  it("4. sub-shop deliveries merge into one main-shop row, one entry per load", async () => {
    const shop = await seedShop(0);
    const sup = await seedSupport();
    const trip = await makeCompletedTrip(sup, {
      tripNo: `LD-SUB-${seq}`, tripDate: "2026-08-08",
      totalBirds: 100, dcWeight: 200,
    });
    const leg = await addLeg(trip.id, 1, { totalBirds: 100, dcWeight: 200 });
    await addDelivery(trip.id, leg, shop, { birds: 40, weight: 80, subShop: "COUNTER A" });
    await addDelivery(trip.id, leg, shop, { birds: 60, weight: 120, subShop: "COUNTER B" });
    await finishTrip(trip.id);

    const rows = (await shopLedgerService.cumulativeQuantities({
      fromDate: "2026-08-08", toDate: "2026-08-08",
    })).filter((r) => r.shopId === shop.id);
    assert.equal(rows.length, 1, "sub-shops must not split the main-shop row");
    assert.equal(rows[0].deliveriesByLoad.length, 1);
    assert.equal(rows[0].deliveriesByLoad[0].load, 1);
    assert.equal(rows[0].deliveriesByLoad[0].birds, 100);
  });

  it("5. cumulative() carries the breakdown with identical financial totals", async () => {
    const shop = await seedShop(1000);
    const sup = await seedSupport();
    const trip = await makeCompletedTrip(sup, {
      tripNo: `LD-FIN-${seq}`, tripDate: "2026-08-08",
      totalBirds: 100, dcWeight: 200,
    });
    const leg1 = await addLeg(trip.id, 1, { totalBirds: 60, dcWeight: 120 });
    const leg2 = await addLeg(trip.id, 2, { totalBirds: 40, dcWeight: 80 });
    await addDelivery(trip.id, leg1, shop, { birds: 54, weight: 108, mortality: 6, mortKg: 3 });
    await addDelivery(trip.id, leg2, shop, { birds: 36, weight: 72, mortality: 4, mortKg: 2 });
    // Flipping rate_completed fires trg_trip_rate_lock_sales_ledger, which
    // bakes one ledger DEBIT per delivery (10800 + 7200) — the real path.
    // No manual ledger insert: that would double-count the sale.
    await finishTrip(trip.id);

    const row = (await shopLedgerService.cumulative({
      fromDate: "2026-08-08", toDate: "2026-08-08",
    })).find((r) => r.shopId === shop.id);
    assert.ok(row);
    assert.equal(row.deliveriesByLoad.length, 2);
    assert.deepEqual(sums(row.deliveriesByLoad), {
      birds: row.birds, weight: row.weight, mortalityBirds: row.mortalityBirds,
      mortalityWeight: row.mortalityWeight, weightLoss: row.weightLoss,
    });
    assert.equal(row.openingBalance, 1000);
    assert.equal(row.sale, 18000);
    assert.equal(row.closingBalance, 19000);
  });
});
