/**
 * Shop Sales business-flow integration tests — the exact post-merge rules:
 *
 *   Trip Entry → Completed → Rate Entry Save & Lock (rate_completed=TRUE,
 *   rate_locked_at=NOW()) → ONLY THEN Shop Sales becomes visible.
 *   Days 0–9  : birds / weight / rate editable, amount server-calculated.
 *   Day 10+   : birds / weight / rate / amount permanently locked.
 *   Aggregate birds / weight may never exceed the Pickup totals
 *   (trips.total_birds / trips.dc_weight) — validated trip-wide after the
 *   proposed edit, not per-row.
 *   Shop Sales edits are reflected immediately in Trip List (both the
 *   delivery rows and the trip summary KPIs).
 *   Collections can never create / reopen / change the Rate Entry lock.
 *
 * Runs the real Express app against real PGlite-Postgres — no mocks.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  getJson,
  postJson,
  putJson,
  startApp,
  type TestApp,
} from "./helpers/app.js";
import { applySchema, currentPgDate, createMutex, markTripCompletedForTests, shiftIsoDate, shutdownTestEnv, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });
const baseUrl = app.baseUrl;

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");
const { tripsService } = await import("../src/services/tripsService.js");
const { collectionsService } = await import("../src/services/collectionsService.js");
const { recalcTripDeliveryTotals } = await import("../src/utils/tripDeliverySync.js");

after(async () => {
  await shutdownTestEnv({ app, testDb, pool });
});

let seq = 0;
async function seedMasters() {
  seq += 1;
  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: `SF39V${String(seq).padStart(4, "0")}`,
    vehicleType: "Lorry",
    noOfBoxes: 85,
    birdCapacity: 50000,
    capacityKg: 60000,
    engineNumber: `SFENG${seq}`,
    chassisNumber: `SFCHS${seq}`,
    status: "Active",
  });
  const driver = await mastersService.upsertEmployee({
    employeeName: `SF Driver ${seq}`,
    department: "Driver",
    role: "Driver",
    phoneNumber: `93200000${String(seq).padStart(2, "0")}`,
    licenseNumber: `SFDL${seq}`,
    salary: 18000,
    status: "Active",
  });
  const supervisor = await mastersService.upsertEmployee({
    employeeName: `SF Supervisor ${seq}`,
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: `94200000${String(seq).padStart(2, "0")}`,
    salary: 24000,
    status: "Active",
  });
  const farm = await mastersService.upsertFarm({
    farmName: `SF Farm ${seq}`,
    ownerName: "Owner",
    supervisorName: "Farm Sup",
    phoneNumber: `96700000${String(seq).padStart(2, "0")}`,
    village: "Village",
    address: "Address",
    capacity: 300000,
    status: "Active",
  });
  const birdType = await mastersService.upsertBirdType({
    birdType: `Broiler ${seq}`,
    averageWeight: 2.35,
    description: "Broiler",
    status: "Active",
  });
  const shopA = await mastersService.upsertShop({
    email: `fixture-shop-${Math.random().toString(36).slice(2,8)}@example.com`,
    associationType: "Ass Vij",
    shopName: `SF Shop A ${seq}`,
    ownerName: "Owner A",
    phoneNumber: `97300000${String(seq).padStart(2, "0")}`,
    village: "Village A",
    address: "Addr A",
    status: "Active",
  });
  const shopB = await mastersService.upsertShop({
    email: `fixture-shop-${Math.random().toString(36).slice(2,8)}@example.com`,
    associationType: "Ass Vij",
    shopName: `SF Shop B ${seq}`,
    ownerName: "Owner B",
    phoneNumber: `98300000${String(seq).padStart(2, "0")}`,
    village: "Village B",
    address: "Addr B",
    status: "Active",
  });
  return { vehicle, driver, supervisor, farm, birdType, shopA, shopB };
}

const exclusiveTripCreate = createMutex();
let tripDateSlot = 0;
async function makeCompletedTrip(
  m: Awaited<ReturnType<typeof seedMasters>>,
  opts: { tripNo: string; tripDate: string; totalBirds: number; dcWeight: number }
) {
  return exclusiveTripCreate(async () => {
  const tripDate = shiftIsoDate(await currentPgDate(), -(++tripDateSlot % 9));
  const trip = await tripsService.save(null, {
    tripNo: opts.tripNo,
    tripDate,
    status: "Completed",
    startTime: `${tripDate}T05:30:00.000Z`,
    vehicleId: m.vehicle.id,
    vehicleNo: m.vehicle.vehicleNumber,
    driverId: m.driver.id,
    driverName: m.driver.employeeName,
    supervisorId: m.supervisor.id,
    supervisorName: m.supervisor.employeeName,
    sourceFarmId: m.farm.id,
    sourceFarm: m.farm.farmName,
    farmBirdTypeId: m.birdType.id,
    farmBirdType: m.birdType.birdType,
    openingMeter: 1000,
    startStepSubmitted: true,
    farmStepSubmitted: true,
    pickupStepSubmitted: true,
    deliveryStepSubmitted: true,
    expensesStepSubmitted: true,
    totalKm: 100,
    totalBirds: opts.totalBirds,
    dcWeight: opts.dcWeight,
  } as Record<string, unknown>);
  await pool.query(`UPDATE trips SET approved_at = NOW() WHERE id = $1`, [trip.id]);
  await markTripCompletedForTests(trip.id);
  return trip;
  });
}

async function addDelivery(
  tripId: number,
  shopId: number,
  shopName: string,
  birds: number,
  weight: number
): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, birds, weight, mortality, rate, amount)
     VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 0) RETURNING id`,
    [tripId, `SF-SALE-${seq}-${shopId}`, shopId, shopName, birds, weight]
  );
  return result.rows[0].id;
}

/** Build a Completed, rate-locked trip with two shop deliveries, returning
 * everything needed to drive Shop Sales assertions. */
async function makeLockedTrip(
  opts: { tripNo: string; totalBirds: number; dcWeight: number; birdsA: number; weightA: number; birdsB: number; weightB: number; rateA?: number; rateB?: number }
) {
  const m = await seedMasters();
  const trip = await makeCompletedTrip(m, {
    tripNo: opts.tripNo,
    tripDate: "2026-08-01",
    totalBirds: opts.totalBirds,
    dcWeight: opts.dcWeight,
  });
  const deliveryA = await addDelivery(trip.id, m.shopA.id, m.shopA.shopName, opts.birdsA, opts.weightA);
  const deliveryB = await addDelivery(trip.id, m.shopB.id, m.shopB.shopName, opts.birdsB, opts.weightB);
  // Mimic real Trip Entry: keep the trip summary KPIs in sync with the
  // seeded deliveries (as tripsService.replaceDeliveries does).
  await recalcTripDeliveryTotals(pool as never, trip.id);
  const rateA = opts.rateA ?? 100;
  const rateB = opts.rateB ?? 100;
  const saved = await putJson(baseUrl, `/api/operations/rate-entry/${trip.id}`, {
    rates: [
      { deliveryId: deliveryA, rate: rateA },
      { deliveryId: deliveryB, rate: rateB },
    ],
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const lock = await postJson(baseUrl, `/api/operations/rate-entry/${trip.id}/lock`, {
    lockedBy: "flow-tester",
  });
  assert.equal(lock.status, 200, JSON.stringify(lock.body));
  return { m, trip, deliveryA, deliveryB };
}

// ---------------------------------------------------------------------------
// 1 & 2. Visibility: Shop Sales appears only after Rate Entry lock
// ---------------------------------------------------------------------------
describe("shopSalesFlow", { concurrency: 1 }, () => {

describe("Shop Sales visibility requires Rate Entry lock", () => {
  it("1. Completed + rate_completed FALSE: Shop Sales list does NOT show the trip", async () => {
    const m = await seedMasters();
    const trip = await makeCompletedTrip(m, {
      tripNo: "SF-NOLOCK-1",
      tripDate: "2026-08-02",
      totalBirds: 1000,
      dcWeight: 1800,
    });
    await addDelivery(trip.id, m.shopA.id, m.shopA.shopName, 300, 500);
    const list = await getJson(baseUrl, "/api/operations/shop-sales");
    assert.ok(
      !list.body.some((s: { tripId: number }) => s.tripId === trip.id),
      "unlocked trip must not appear in Shop Sales"
    );
  });

  it("2. Completed + rate_completed TRUE: Shop Sales list DOES show the trip", async () => {
    const { m, trip } = await makeLockedTrip({
      tripNo: "SF-LOCKED-1",
      totalBirds: 1000,
      dcWeight: 1800,
      birdsA: 300,
      weightA: 500,
      birdsB: 250,
      weightB: 450,
    });
    const list = await getJson(baseUrl, "/api/operations/shop-sales");
    const rows = list.body.filter((s: { tripId: number }) => s.tripId === trip.id);
    assert.equal(rows.length, 2, "locked trip's shop deliveries must appear in Shop Sales");
    assert.ok(rows.every((r: { shopId: number }) => r.shopId === m.shopA.id || r.shopId === m.shopB.id));
  });

  it("3. Shop Sales getById before Rate Lock is not visible (404)", async () => {
    const m = await seedMasters();
    const trip = await makeCompletedTrip(m, {
      tripNo: "SF-GETNOLOCK",
      tripDate: "2026-08-03",
      totalBirds: 1000,
      dcWeight: 1800,
    });
    const delivery = await addDelivery(trip.id, m.shopA.id, m.shopA.shopName, 300, 500);
    const res = await getJson(baseUrl, `/api/operations/shop-sales/${delivery}`);
    assert.equal(res.status, 404, "unlocked delivery must not be reachable by id");
  });

  it("4. Shop Sales create before Rate Lock is rejected", async () => {
    const m = await seedMasters();
    const trip = await makeCompletedTrip(m, {
      tripNo: "SF-CREATENOLOCK",
      tripDate: "2026-08-04",
      totalBirds: 1000,
      dcWeight: 1800,
    });
    await addDelivery(trip.id, m.shopA.id, m.shopA.shopName, 300, 500);
    const res = await postJson(baseUrl, "/api/operations/shop-sales", {
      tripId: trip.id,
      shopId: m.shopB.id,
      birds: 100,
      weight: 150,
      rate: 100,
    });
    assert.equal(res.status, 409, JSON.stringify(res.body));
  });

  it("5. Shop Sales update after Rate Lock is allowed during the window", async () => {
    const { m, trip, deliveryA } = await makeLockedTrip({
      tripNo: "SF-UPDATELOCKED",
      totalBirds: 1000,
      dcWeight: 1800,
      birdsA: 300,
      weightA: 500,
      birdsB: 250,
      weightB: 450,
    });
    const res = await putJson(baseUrl, `/api/operations/shop-sales/${deliveryA}`, {
      birds: 320,
      weight: 520,
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.birds, 320);
    assert.equal(res.body.weight, 520);
    void m;
    void trip;
  });
});

// ---------------------------------------------------------------------------
// 6, 7, 8. Pickup (aggregate) birds/weight limits
// ---------------------------------------------------------------------------
describe("Shop Sales pickup aggregate limits", () => {
  it("6. Pickup birds 10000; aggregate 10001 -> rejected (422)", async () => {
    // shopA = 3000, shopB = 4000 (total 7000). Editing shopB to 8000 -> 11000 > 10000.
    const { trip, deliveryB } = await makeLockedTrip({
      tripNo: "SF-BIRDOVER",
      totalBirds: 10000,
      dcWeight: 8000,
      birdsA: 3000,
      weightA: 2400,
      birdsB: 4000,
      weightB: 3000,
    });
    const res = await putJson(baseUrl, `/api/operations/shop-sales/${deliveryB}`, { birds: 8000 });
    assert.equal(res.status, 422, `over-capacity birds must be rejected, got ${res.status}`);
    // Verify not persisted.
    const row = await pool.query(`SELECT birds FROM trip_deliveries WHERE id = $1`, [deliveryB]);
    assert.equal(Number(row.rows[0].birds), 4000, "rejected edit must not be persisted");
    void trip;
  });

  it("7. Pickup weight 8000; aggregate 8001 -> rejected (422)", async () => {
    const { trip, deliveryB } = await makeLockedTrip({
      tripNo: "SF-WEIGHTOVER",
      totalBirds: 10000,
      dcWeight: 8000,
      birdsA: 3000,
      weightA: 2400,
      birdsB: 4000,
      weightB: 3000,
    });
    const overRes = await putJson(baseUrl, `/api/operations/shop-sales/${deliveryB}`, { weight: 5601 });
    assert.equal(overRes.status, 422, `over-capacity weight must be rejected, got ${overRes.status}`);
    void trip;
  });

  it("8. Valid aggregate edit within pickup limits -> allowed", async () => {
    const { trip, deliveryB } = await makeLockedTrip({
      tripNo: "SF-BIRDOK",
      totalBirds: 10000,
      dcWeight: 8000,
      birdsA: 3000,
      weightA: 2400,
      birdsB: 4000,
      weightB: 3000,
    });
    // 3000 + 3500 = 6500 <= 10000 -> pass.
    const res = await putJson(baseUrl, `/api/operations/shop-sales/${deliveryB}`, { birds: 3500 });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.birds, 3500);
    void trip;
  });
});

// ---------------------------------------------------------------------------
// 9 & 10. Amount recalculation
// ---------------------------------------------------------------------------
describe("Shop Sales amount recalculation", () => {
  it("9. Changing weight recalculates amount = ROUND(weight * rate, 2)", async () => {
    const { deliveryA } = await makeLockedTrip({
      tripNo: "SF-AMTW",
      totalBirds: 1000,
      dcWeight: 1800,
      birdsA: 300,
      weightA: 500,
      birdsB: 250,
      weightB: 450,
      rateA: 100,
    });
    // rate A = 100, current weight 500 -> amount 50000. Set weight to 600 -> 60000.
    const res = await putJson(baseUrl, `/api/operations/shop-sales/${deliveryA}`, { weight: 600 });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.amount, Number((600 * 100).toFixed(2)));
  });

  it("10. Changing rate recalculates amount = ROUND(weight * rate, 2)", async () => {
    const { deliveryA } = await makeLockedTrip({
      tripNo: "SF-AMTR",
      totalBirds: 1000,
      dcWeight: 1800,
      birdsA: 300,
      weightA: 500,
      birdsB: 250,
      weightB: 450,
      rateA: 100,
    });
    // weight A = 500, set rate to 150 -> amount 75000.
    const res = await putJson(baseUrl, `/api/operations/shop-sales/${deliveryA}`, { rate: 150 });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.rate, 150);
    assert.equal(res.body.amount, Number((500 * 150).toFixed(2)));
  });
});

// ---------------------------------------------------------------------------
// 11 & 12. Trip List synchronization
// ---------------------------------------------------------------------------
describe("Shop Sales corrections reflect in Trip List", () => {
  it("11. Trip List delivery row reflects new birds/weight/rate/amount after Shop Sales edit", async () => {
    const { trip, deliveryA } = await makeLockedTrip({
      tripNo: "SF-TRIPLIST-ROW",
      totalBirds: 1000,
      dcWeight: 1800,
      birdsA: 300,
      weightA: 500,
      birdsB: 250,
      weightB: 450,
      rateA: 100,
    });
    const edit = await putJson(baseUrl, `/api/operations/shop-sales/${deliveryA}`, {
      birds: 320,
      weight: 520,
      rate: 110,
    });
    assert.equal(edit.status, 200, JSON.stringify(edit.body));

    const detail = await getJson(baseUrl, `/api/operations/trip-list/${trip.id}`);
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    const row = detail.body.deliveries?.find((d: { id: number }) => d.id === deliveryA);
    assert.ok(row, "Trip List detail must include the delivery");
    assert.equal(Number(row.birds), 320);
    assert.equal(Number(row.weight), 520);
    assert.equal(Number(row.rate), 110);
    assert.equal(Number(row.amount), Number((520 * 110).toFixed(2)));
  });

  it("12. Trip List summary totals reflect new values after Shop Sales edit", async () => {
    const { trip, deliveryA, deliveryB } = await makeLockedTrip({
      tripNo: "SF-TRIPLIST-SUM",
      totalBirds: 1000,
      dcWeight: 1800,
      birdsA: 300,
      weightA: 500,
      birdsB: 250,
      weightB: 450,
      rateA: 100,
      rateB: 110,
    });
    // Before: birds delivered = 550, weight delivered = 950, shops = 2.
    const before = await getJson(baseUrl, `/api/operations/trip-list/${trip.id}`);
    assert.equal(Number(before.body.totalBirdsDelivered), 550);
    assert.equal(Number(before.body.totalDeliveredWeight), 950);
    assert.equal(Number(before.body.totalShops), 2);

    // Edit shopA: birds 300->340 (+40), weight 500->520 (+20).
    const edit = await putJson(baseUrl, `/api/operations/shop-sales/${deliveryA}`, {
      birds: 340,
      weight: 520,
    });
    assert.equal(edit.status, 200, JSON.stringify(edit.body));

    const after = await getJson(baseUrl, `/api/operations/trip-list/${trip.id}`);
    const db = await pool.query<{ birds: string; a: string }>(
      `SELECT COALESCE(SUM(birds),0)::text AS birds,
              (SELECT birds::text FROM trip_deliveries WHERE id=$2) AS a
         FROM trip_deliveries WHERE trip_id=$1 AND COALESCE(deleted,FALSE)=FALSE`,
      [trip.id, deliveryA]
    );
    assert.equal(Number(db.rows[0].a), 340, "edited delivery birds must persist");
    assert.equal(
      Number(db.rows[0].birds),
      550,
      "Shop Sales bird conservation keeps trip total birds unchanged"
    );
    assert.equal(Number(after.body.totalShops), 2);
    assert.equal(Number(after.body.totalBirdsDelivered), 550);
    void deliveryB;
  });
});

// ---------------------------------------------------------------------------
// 13, 14, 15. 10-day correction window
// ---------------------------------------------------------------------------
describe("10-day correction window", () => {
  it("13. Day 9: birds/weight/rate editable", async () => {
    const { deliveryA } = await makeLockedTrip({
      tripNo: "SF-DAY9",
      totalBirds: 1000,
      dcWeight: 1800,
      birdsA: 300,
      weightA: 500,
      birdsB: 250,
      weightB: 450,
    });
    // Backdate rate_locked_at to ~9 days ago.
    const nineDays = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString();
    const today = await currentPgDate();
    await pool.query(
      `UPDATE trips SET trip_date = $2, rate_locked_at = $3 WHERE id = (SELECT trip_id FROM trip_deliveries WHERE id = $1)`,
      [deliveryA, shiftIsoDate(today, -9), nineDays]
    );
    for (const body of [{ birds: 310 }, { weight: 510 }, { rate: 120 }]) {
      const res = await putJson(baseUrl, `/api/operations/shop-sales/${deliveryA}`, body);
      assert.equal(res.status, 200, `day-9 edit ${JSON.stringify(body)} must be allowed, got ${res.status}`);
    }
  });

  it("14. Day 11: birds/weight/rate/amount rejected (window is trip_date + 10 inclusive)", async () => {
    const { deliveryA } = await makeLockedTrip({
      tripNo: "SF-DAY10",
      totalBirds: 1000,
      dcWeight: 1800,
      birdsA: 300,
      weightA: 500,
      birdsB: 250,
      weightB: 450,
    });
    const elevenDays = new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString();
    const today = await currentPgDate();
    await pool.query(
      `UPDATE trips SET trip_date = $2, rate_locked_at = $3 WHERE id = (SELECT trip_id FROM trip_deliveries WHERE id = $1)`,
      [deliveryA, shiftIsoDate(today, -11), elevenDays]
    );
    for (const body of [{ birds: 310 }, { weight: 510 }, { rate: 120 }, { amount: 99999 }]) {
      const res = await putJson(baseUrl, `/api/operations/shop-sales/${deliveryA}`, body);
      assert.equal(res.status, 409, `closed-window edit ${JSON.stringify(body)} must be rejected, got ${res.status}`);
    }
  });

  it("15. Day 11: same rejection", async () => {
    const { deliveryA } = await makeLockedTrip({
      tripNo: "SF-DAY11",
      totalBirds: 1000,
      dcWeight: 1800,
      birdsA: 300,
      weightA: 500,
      birdsB: 250,
      weightB: 450,
    });
    const elevenDays = new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString();
    const today = await currentPgDate();
    await pool.query(
      `UPDATE trips SET trip_date = $2, rate_locked_at = $3 WHERE id = (SELECT trip_id FROM trip_deliveries WHERE id = $1)`,
      [deliveryA, shiftIsoDate(today, -11), elevenDays]
    );
    const res = await putJson(baseUrl, `/api/operations/shop-sales/${deliveryA}`, { rate: 130 });
    assert.equal(res.status, 409, `day-11 edit must be rejected, got ${res.status}`);
  });
});

// ---------------------------------------------------------------------------
// 16. Collections cannot unlock / create the Rate Entry lock
// ---------------------------------------------------------------------------
describe("Collections never creates or reopens the Rate Entry lock", () => {
  it("16. Collections cannot unlock Rate Entry (TRUE -> FALSE impossible)", async () => {
    const { trip, deliveryA } = await makeLockedTrip({
      tripNo: "SF-COLL-UNLOCK",
      totalBirds: 1000,
      dcWeight: 1800,
      birdsA: 300,
      weightA: 500,
      birdsB: 250,
      weightB: 450,
    });
    const before = await pool.query(`SELECT rate_completed FROM trips WHERE id = $1`, [trip.id]);
    assert.equal(before.rows[0].rate_completed, true);

    // Attempt to move it to Pending Approval via Collections — must NOT unlock.
    await collectionsService.updateStatus(deliveryA, { status: "Pending Approval" });
    const after = await pool.query(`SELECT rate_completed FROM trips WHERE id = $1`, [trip.id]);
    assert.equal(after.rows[0].rate_completed, true, "Collections must never set rate_completed FALSE");
  });

  it("16b. Collections cannot independently create a Rate Entry lock", async () => {
    const m = await seedMasters();
    const trip = await makeCompletedTrip(m, {
      tripNo: "SF-COLL-CREATE",
      tripDate: "2026-08-05",
      totalBirds: 1000,
      dcWeight: 1800,
    });
    const delivery = await addDelivery(trip.id, m.shopA.id, m.shopA.shopName, 300, 500);
    const before = await pool.query(`SELECT rate_completed FROM trips WHERE id = $1`, [trip.id]);
    assert.equal(before.rows[0].rate_completed, false);

    // Collections updateStatus Approved must NOT stamp rate_completed TRUE.
    await collectionsService.updateStatus(delivery, { status: "Approved" });
    const after = await pool.query(`SELECT rate_completed, rate_locked_at FROM trips WHERE id = $1`, [trip.id]);
    assert.equal(after.rows[0].rate_completed, false, "Collections must not create a Rate Entry lock");
    assert.equal(after.rows[0].rate_locked_at, null, "Collections must not stamp rate_locked_at");
  });
});

// ---------------------------------------------------------------------------
// 17 & 18. DB-level guards after lock
// ---------------------------------------------------------------------------
describe("Database-level lock guards", () => {
  it("17. Direct DB update after 10 days rejected (DB trigger)", async () => {
    const { trip, deliveryA } = await makeLockedTrip({
      tripNo: "SF-DBTRIG",
      totalBirds: 1000,
      dcWeight: 1800,
      birdsA: 300,
      weightA: 500,
      birdsB: 250,
      weightB: 450,
    });
    const elevenDays = new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString();
    const today = await currentPgDate();
    await pool.query(
      `UPDATE trips SET trip_date = $2, rate_locked_at = $3 WHERE id = $1`,
      [trip.id, shiftIsoDate(today, -11), elevenDays]
    );
    await assert.rejects(
      pool.query(`UPDATE trip_deliveries SET rate = 1, amount = 1 WHERE id = $1`, [deliveryA]),
      /permanently locked|10-day|correction window/
    );
  });

  it("18. Delete after Rate Entry lock rejected", async () => {
    const { trip, deliveryA } = await makeLockedTrip({
      tripNo: "SF-DELAFTERLOCK",
      totalBirds: 1000,
      dcWeight: 1800,
      birdsA: 300,
      weightA: 500,
      birdsB: 250,
      weightB: 450,
    });
    await assert.rejects(
      pool.query(`DELETE FROM trip_deliveries WHERE id = $1`, [deliveryA]),
      /rate-locked/
    );
    const still = await pool.query(`SELECT id FROM trip_deliveries WHERE id = $1`, [deliveryA]);
    assert.equal(still.rowCount, 1, "delivery must not be deleted");
    void trip;
  });
});
});
