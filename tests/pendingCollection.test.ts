/**
 * Pending Collection — operations view over Collection Entry accounting.
 * Does not change Collection Entry delete, weekly-summaries, or ledger helpers.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { deleteJson, getJson, startApp, type TestApp } from "./helpers/app.js";
import { applySchema, markTripCompletedForTests, shutdownTestEnv, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });
const baseUrl = app.baseUrl;

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");
const { tripsService } = await import("../src/services/tripsService.js");
const { rateEntryService } = await import("../src/services/rateEntryService.js");
const { collectionEntryService } = await import("../src/services/collectionEntryService.js");
const { shopSalesService } = await import("../src/services/shopSalesService.js");
const { recalcTripDeliveryTotals } = await import("../src/utils/tripDeliverySync.js");

after(async () => {
  await shutdownTestEnv({ app, testDb, pool });
});

let seq = 0;

async function seedShop(opening: number, name?: string): Promise<{ id: number; name: string }> {
  seq += 1;
  const shop = await mastersService.upsertShop({
    shopName: name ?? `PC Shop ${seq}`,
    ownerName: "Owner",
    phoneNumber: `97310001${String(seq).padStart(2, "0")}`,
    village: "Village",
    address: "Addr",
    email: `pc${seq}@test.local`,
    status: "Active",
    openingBalance: opening,
  });
  await pool.query(
    `UPDATE shops SET opening_balance = $2, current_balance = $2 WHERE id = $1`,
    [shop.id, opening]
  );
  return { id: shop.id, name: shop.shopName };
}

async function seedSupport() {
  seq += 1;
  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: `PCV${String(seq).padStart(4, "0")}`,
    vehicleType: "Lorry",
    noOfBoxes: 85,
    birdCapacity: 50000,
    capacityKg: 60000,
    engineNumber: `PCENG${seq}`,
    chassisNumber: `PCCHS${seq}`,
    status: "Active",
  });
  const driver = await mastersService.upsertEmployee({
    employeeName: `PC Driver ${seq}`,
    department: "Driver",
    role: "Driver",
    phoneNumber: `93216666${String(seq).padStart(2, "0")}`,
    licenseNumber: `PCDL${seq}`,
    salary: 18000,
    status: "Active",
  });
  const supervisor = await mastersService.upsertEmployee({
    employeeName: `PC Sup ${seq}`,
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: `94216666${String(seq).padStart(2, "0")}`,
    salary: 24000,
    status: "Active",
  });
  const farm = await mastersService.upsertFarm({
    farmName: `PC Farm ${seq}`,
    ownerName: "Owner X",
    supervisorName: "Supervisor X",
    phoneNumber: `96716666${String(seq).padStart(2, "0")}`,
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
  const trip = await tripsService.save(null, {
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
  await markTripCompletedForTests(trip.id);
  return { ...trip, status: "Completed" as const };
}

async function addDelivery(tripId: number, shopId: number, shopName: string, amount: number): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, birds, weight, mortality, rate, amount)
     VALUES ($1, $2, $3, $4, 300, 500, 0, 200, ROUND($5::numeric, 2))
     RETURNING id`,
    [tripId, `PC-SALE-${seq}-${shopId}`, shopId, shopName, amount]
  );
  return result.rows[0].id;
}

async function seedShopWithDebit(
  opening: number,
  saleAmount: number,
  date = "2026-08-18",
  shopName?: string
): Promise<{ shop: { id: number; name: string }; tripId: number; saleId: number }> {
  const shop = await seedShop(opening, shopName);
  const sup = await seedSupport();
  const trip = await makeCompletedTrip(sup, {
    tripNo: `PC-TRIP-${seq}`,
    tripDate: date,
    totalBirds: 1000,
    dcWeight: 1800,
  });
  const saleId = await addDelivery(trip.id, shop.id, shop.name, saleAmount);
  await recalcTripDeliveryTotals(pool as never, trip.id);
  const lock = await rateEntryService.lock(trip.id, { lockedBy: "pc-test" });
  assert.ok(lock.rateLocked);
  await pool.query(`UPDATE trips SET approved_at = NOW() WHERE id = $1`, [trip.id]);
  return { shop, tripId: trip.id, saleId };
}

async function currentOutstanding(shopId: number): Promise<number> {
  const r = await pool.query<{ current_balance: string; opening_balance: string }>(
    `SELECT current_balance, opening_balance FROM shops WHERE id = $1`,
    [shopId]
  );
  return Number(r.rows[0].current_balance);
}

async function openingBalance(shopId: number): Promise<number> {
  const r = await pool.query<{ opening_balance: string }>(
    `SELECT opening_balance FROM shops WHERE id = $1`,
    [shopId]
  );
  return Number(r.rows[0].opening_balance);
}

async function pgToday(): Promise<string> {
  const r = await pool.query<{ d: string }>(`SELECT CURRENT_DATE::text AS d`);
  return r.rows[0].d;
}

function pendingSummaryShops(body: unknown): Array<{ shopId: number } & Record<string, unknown>> {
  assert.ok(body && typeof body === "object" && "shops" in body, "pending-summary must return { shops, totals }");
  const shops = (body as { shops: Array<{ shopId: number }> }).shops;
  assert.ok(Array.isArray(shops), "pending-summary.shops must be an array");
  return shops;
}

function pendingSummaryTotals(body: unknown): Record<string, unknown> {
  assert.ok(body && typeof body === "object" && "totals" in body, "pending-summary must return totals");
  return (body as { totals: Record<string, unknown> }).totals;
}

function findShop(
  body: unknown,
  shopId: number
): Record<string, unknown> {
  const row = pendingSummaryShops(body).find((r) => r.shopId === shopId);
  assert.ok(row, `shop ${shopId} missing from pending-summary`);
  return row;
}

describe("Pending Collection pending-summary", () => {
  it("week bounds for 2026-08-18 are Monday 17 → Sunday 23", async () => {
    const { shop } = await seedShopWithDebit(0, 1000, "2026-08-18");
    const res = await getJson(baseUrl, `/api/operations/collection-entry/pending-summary?date=2026-08-18`);
    assert.equal(res.status, 200);
    const row = findShop(res.body, shop.id);
    assert.equal(row.weekStart, "2026-08-17");
    assert.equal(row.weekEnd, "2026-08-23");
    assert.equal(row.overdueDays, null);
  });

  it("aggregates weekly sales, approved, pending; pending does not reduce balance", async () => {
    const { shop } = await seedShopWithDebit(0, 100000, "2026-08-18");
    await collectionEntryService.create({
      collectionDate: "2026-08-18", shopId: shop.id, amount: 5000,
    });
    const c90 = await collectionEntryService.create({
      collectionDate: "2026-08-18", shopId: shop.id, amount: 90000,
    });
    await collectionEntryService.approve(c90.id);

    const res = await getJson(baseUrl, `/api/operations/collection-entry/pending-summary?date=2026-08-18`);
    const row = findShop(res.body, shop.id);
    assert.equal(row.weeklySales, 100000);
    assert.equal(row.weeklyApprovedCollections, 90000);
    assert.equal(row.weeklyPendingCollections, 5000);
    assert.equal(row.balance, 10000);
    assert.equal(row.recoveryPercentage, 90);
    assert.equal(row.hasPendingCollections, true);
  });

  it("recovery is 0 when weekly sales are 0", async () => {
    const shop = await seedShop(25000);
    const res = await getJson(baseUrl, `/api/operations/collection-entry/pending-summary?date=2026-08-18`);
    const row = findShop(res.body, shop.id);
    assert.equal(row.weeklySales, 0);
    assert.equal(row.recoveryPercentage, 0);
    assert.equal(row.balance, 25000);
  });

  it("recovery may exceed 100% on overpayment", async () => {
    const { shop } = await seedShopWithDebit(0, 100000, "2026-08-18");
    const c = await collectionEntryService.create({
      collectionDate: "2026-08-18", shopId: shop.id, amount: 120000,
    });
    await collectionEntryService.approve(c.id);
    const res = await getJson(baseUrl, `/api/operations/collection-entry/pending-summary?date=2026-08-18`);
    const row = findShop(res.body, shop.id);
    assert.equal(row.recoveryPercentage, 120);
    assert.equal(row.balance, -20000);
  });

  it("negative balance is returned as a negative number", async () => {
    const { shop } = await seedShopWithDebit(0, 100000, "2026-08-18");
    const c = await collectionEntryService.create({
      collectionDate: "2026-08-18", shopId: shop.id, amount: 102000,
    });
    await collectionEntryService.approve(c.id);
    const res = await getJson(baseUrl, `/api/operations/collection-entry/pending-summary?date=2026-08-18`);
    const row = findShop(res.body, shop.id);
    assert.equal(row.balance, -2000);
  });

  it("shops are ordered A → Z", async () => {
    await seedShop(0, `PC Zebra ${seq + 1}`);
    await seedShop(0, `PC Alpha ${seq + 2}`);
    const res = await getJson(baseUrl, `/api/operations/collection-entry/pending-summary?date=2026-08-18`);
    assert.equal(res.status, 200);
    const names = pendingSummaryShops(res.body).map((r) => String(r.shopName));
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    assert.deepEqual(names, sorted);
  });

  it("historical week is not the current week's live outstanding", async () => {
    const { shop } = await seedShopWithDebit(0, 100000, "2026-08-11");
    const c = await collectionEntryService.create({
      collectionDate: "2026-08-11", shopId: shop.id, amount: 90000,
    });
    await collectionEntryService.approve(c.id);

    const week1 = await getJson(baseUrl, `/api/operations/collection-entry/pending-summary?date=2026-08-11`);
    const w1 = findShop(week1.body, shop.id);
    assert.equal(w1.weekStart, "2026-08-10");
    assert.equal(w1.balance, 10000);

    const sup = await seedSupport();
    const trip = await makeCompletedTrip(sup, {
      tripNo: `PC-W2-${seq}`, tripDate: "2026-08-18", totalBirds: 1000, dcWeight: 1800,
    });
    await addDelivery(trip.id, shop.id, shop.name, 50000);
    await recalcTripDeliveryTotals(pool as never, trip.id);
    await rateEntryService.lock(trip.id, { lockedBy: "pc-test" });

    const week1Again = await getJson(baseUrl, `/api/operations/collection-entry/pending-summary?date=2026-08-11`);
    const week2 = await getJson(baseUrl, `/api/operations/collection-entry/pending-summary?date=2026-08-18`);
    assert.equal(findShop(week1Again.body, shop.id).balance, 10000);
    assert.equal(findShop(week2.body, shop.id).balance, 60000);
    assert.equal(await currentOutstanding(shop.id), 60000);
  });

  it("Shop Sales correction updates weekly sales and balance", async () => {
    const { shop, saleId } = await seedShopWithDebit(0, 100000, "2026-08-18");
    let res = await getJson(baseUrl, `/api/operations/collection-entry/pending-summary?date=2026-08-18`);
    assert.equal(findShop(res.body, shop.id).weeklySales, 100000);
    await shopSalesService.update(saleId, { rate: 210 });
    res = await getJson(baseUrl, `/api/operations/collection-entry/pending-summary?date=2026-08-18`);
    assert.equal(findShop(res.body, shop.id).weeklySales, 105000);
    assert.equal(findShop(res.body, shop.id).balance, 105000);
  });

  it("matches Collection Entry weekly-summary for the same shop/week", async () => {
    const { shop } = await seedShopWithDebit(0, 100000, "2026-08-18");
    const pending = await getJson(baseUrl, `/api/operations/collection-entry/pending-summary?date=2026-08-18`);
    const weekly = await collectionEntryService.getWeeklySummary(shop.id, "2026-08-18");
    const row = findShop(pending.body, shop.id);
    assert.equal(row.openingBalance, weekly.openingBalance);
    assert.equal(row.balance, weekly.currentOutstanding);
    assert.equal(row.weeklySales, weekly.weeklySales);
    assert.equal(row.weeklyApprovedCollections, weekly.approvedCollections);
    assert.equal(row.weeklyPendingCollections, weekly.pendingCollections);
  });

  it("returns backend-authoritative all-shop totals including recovery", async () => {
    const { shop } = await seedShopWithDebit(0, 100000, "2026-08-18");
    const c = await collectionEntryService.create({
      collectionDate: "2026-08-18", shopId: shop.id, amount: 90000,
    });
    await collectionEntryService.approve(c.id);
    const res = await getJson(baseUrl, `/api/operations/collection-entry/pending-summary?date=2026-08-18`);
    const totals = pendingSummaryTotals(res.body);
    assert.ok(typeof totals.weeklySales === "number");
    assert.ok(typeof totals.recoveryPercentage === "number");
    assert.equal(res.body.weekStart, "2026-08-17");
    assert.equal(res.body.weekEnd, "2026-08-23");
    const row = findShop(res.body, shop.id);
    assert.ok(Number(totals.weeklySales) >= Number(row.weeklySales));
    assert.ok(Number(totals.weeklyApprovedCollections) >= Number(row.weeklyApprovedCollections));
  });
});

describe("Pending Collection recent 10", () => {
  it("returns at most 10 newest collections and retains older rows in the database", async () => {
    const { shop } = await seedShopWithDebit(0, 100000, "2026-08-18");
    const ids: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      const c = await collectionEntryService.create({
        collectionDate: "2026-08-18",
        shopId: shop.id,
        amount: 100 + i,
      });
      ids.push(c.id);
    }
    const res = await getJson(
      baseUrl,
      `/api/operations/collection-entry/recent?shopId=${shop.id}&limit=50`
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 10);
    const count = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM collections WHERE shop_id = $1 AND deleted = FALSE`,
      [shop.id]
    );
    assert.equal(Number(count.rows[0].c), 12);

    const first = res.body[0];
    const last = res.body[9];
    assert.ok(first.amount >= last.amount);
    assert.equal(typeof first.canDelete, "boolean");
    assert.ok(!("password" in first));
    const nos = res.body.map((r: { collectionNo: string }) => r.collectionNo);
    const sortedNos = [...nos].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    assert.deepEqual(nos, sortedNos);
  });

  it("excludes soft-deleted collections from recent but keeps the row stored", async () => {
    const { shop } = await seedShopWithDebit(0, 100000, "2026-08-18");
    const keep = await collectionEntryService.create({
      collectionDate: "2026-08-18", shopId: shop.id, amount: 111,
    });
    const gone = await collectionEntryService.create({
      collectionDate: "2026-08-18", shopId: shop.id, amount: 222,
    });
    await collectionEntryService.softDelete(gone.id, { reason: "cleanup" });
    const res = await getJson(baseUrl, `/api/operations/collection-entry/recent?shopId=${shop.id}`);
    const ids = (res.body as Array<{ id: number }>).map((r) => r.id);
    assert.ok(ids.includes(keep.id));
    assert.ok(!ids.includes(gone.id));
    const stored = await pool.query(`SELECT deleted FROM collections WHERE id = $1`, [gone.id]);
    assert.equal(stored.rows[0].deleted, true);
  });
});

describe("Pending Collection 7-day delete", () => {
  it("allows pending-path delete within 7 days; pending delete does not reverse ledger", async () => {
    const today = await pgToday();
    const { shop } = await seedShopWithDebit(0, 100000, today);
    const liveBefore = await currentOutstanding(shop.id);
    const pending = await collectionEntryService.create({
      collectionDate: today, shopId: shop.id, amount: 5000,
    });
    const del = await deleteJson(baseUrl, `/api/operations/collection-entry/pending/${pending.id}`);
    assert.equal(del.status, 200, JSON.stringify(del.body));
    assert.equal(del.body.deleted, true);
    assert.equal(await currentOutstanding(shop.id), liveBefore);
    const summary = await getJson(
      baseUrl,
      `/api/operations/collection-entry/pending-summary?date=${today}`
    );
    const row = findShop(summary.body, shop.id);
    assert.equal(row.weeklyPendingCollections, 0);
    assert.equal(row.weeklyApprovedCollections, 0);
    assert.equal(row.balance, liveBefore);
  });

  it("approved delete within 7 days reverses credit once; opening_balance unchanged", async () => {
    const today = await pgToday();
    const { shop } = await seedShopWithDebit(0, 100000, today);
    const approved = await collectionEntryService.create({
      collectionDate: today, shopId: shop.id, amount: 90000,
    });
    await collectionEntryService.approve(approved.id);
    assert.equal(await currentOutstanding(shop.id), 10000);
    assert.equal(await openingBalance(shop.id), 0);

    const del = await deleteJson(baseUrl, `/api/operations/collection-entry/pending/${approved.id}`);
    assert.equal(del.status, 200, JSON.stringify(del.body));
    assert.equal(await currentOutstanding(shop.id), 100000);
    assert.equal(await openingBalance(shop.id), 0);

    const again = await deleteJson(baseUrl, `/api/operations/collection-entry/pending/${approved.id}`);
    assert.equal(again.status, 200);
    assert.equal(await currentOutstanding(shop.id), 100000);

    const summary = await getJson(
      baseUrl,
      `/api/operations/collection-entry/pending-summary?date=${today}`
    );
    const row = findShop(summary.body, shop.id);
    assert.equal(row.weeklyApprovedCollections, 0);
    assert.equal(row.balance, 100000);
    assert.equal(row.recoveryPercentage, 0);

    const recent = await getJson(baseUrl, `/api/operations/collection-entry/recent?shopId=${shop.id}`);
    assert.equal((recent.body as Array<{ id: number }>).some((r) => r.id === approved.id), false);
  });

  it("rejects pending-path delete after 7 days; Collection Entry delete still works", async () => {
    const { shop } = await seedShopWithDebit(0, 100000, "2026-08-18");
    const oldDate = await pool.query<{ d: string }>(
      `SELECT (CURRENT_DATE - 8)::text AS d`
    );
    const c = await collectionEntryService.create({
      collectionDate: oldDate.rows[0].d, shopId: shop.id, amount: 1000,
    });
    await collectionEntryService.approve(c.id);
    const before = await currentOutstanding(shop.id);

    const denied = await deleteJson(baseUrl, `/api/operations/collection-entry/pending/${c.id}`);
    assert.equal(denied.status, 409);
    assert.equal(await currentOutstanding(shop.id), before);

    const recent = await getJson(baseUrl, `/api/operations/collection-entry/recent?shopId=${shop.id}`);
    const rec = (recent.body as Array<{ id: number; canDelete: boolean }>).find((r) => r.id === c.id);
    assert.ok(rec);
    assert.equal(rec.canDelete, false);

    const entryDelete = await deleteJson(baseUrl, `/api/operations/collection-entry/${c.id}`);
    assert.equal(entryDelete.status, 200, JSON.stringify(entryDelete.body));
    assert.equal(entryDelete.body.deleted, true);
    assert.ok(await currentOutstanding(shop.id) > before - 0.001);
  });

  // Exhaustive boundary sweep: the gate is `CURRENT_DATE <= collection_date + 7`,
  // so every day from 0 through 7 (inclusive) must allow deletion, and day 8
  // must reject (covered by the 409 test above). Day 0 is covered by the
  // "within 7 days" tests further up; this fills in the untested middle and,
  // critically, the exact inclusive edge at day 7.
  for (const offsetDays of [1, 6, 7]) {
    it(`allows pending-path delete exactly ${offsetDays} day(s) after the collection date (inclusive boundary)`, async () => {
      const { shop } = await seedShopWithDebit(0, 100000, "2026-08-18");
      const dateRow = await pool.query<{ d: string }>(
        `SELECT (CURRENT_DATE - $1::int)::text AS d`,
        [offsetDays]
      );
      const c = await collectionEntryService.create({
        collectionDate: dateRow.rows[0].d, shopId: shop.id, amount: 1000,
      });
      await collectionEntryService.approve(c.id);
      const before = await currentOutstanding(shop.id);

      const recent = await getJson(baseUrl, `/api/operations/collection-entry/recent?shopId=${shop.id}`);
      const rec = (recent.body as Array<{ id: number; canDelete: boolean }>).find((r) => r.id === c.id);
      assert.ok(rec, `expected collection ${c.id} in recent list`);
      assert.equal(rec!.canDelete, true, `canDelete should be true at day ${offsetDays}`);

      const del = await deleteJson(baseUrl, `/api/operations/collection-entry/pending/${c.id}`);
      assert.equal(del.status, 200, JSON.stringify(del.body));
      assert.equal(await currentOutstanding(shop.id), before + 1000);
    });
  }
});

describe("Pending Collection collectors (existing Masters API)", () => {
  it("GET /employees?department=Collection returns Collection dept only, A→Z", async () => {
    seq += 1;
    await mastersService.upsertEmployee({
      employeeName: `Zulu Collector ${seq}`,
      department: "Collection",
      role: "Collector",
      phoneNumber: `98110001${String(seq).padStart(2, "0")}`,
      licenseNumber: `PCCOL-Z-${seq}`,
      salary: 15000,
      status: "Active",
    });
    await mastersService.upsertEmployee({
      employeeName: `Alpha Collector ${seq}`,
      department: "Collection",
      role: "Collector",
      phoneNumber: `98110002${String(seq).padStart(2, "0")}`,
      licenseNumber: `PCCOL-A-${seq}`,
      salary: 15000,
      status: "Active",
    });
    await mastersService.upsertEmployee({
      employeeName: `Not Collector ${seq}`,
      department: "Driver",
      role: "Driver",
      phoneNumber: `98110003${String(seq).padStart(2, "0")}`,
      licenseNumber: `PCDL-COL-${seq}`,
      salary: 15000,
      status: "Active",
    });
    const res = await getJson(baseUrl, `/api/masters/employees?department=Collection`);
    assert.equal(res.status, 200);
    const names = (res.body as Array<{ employeeName: string; department: string }>)
      .filter((e) => e.employeeName.includes(`Collector ${seq}`) || e.employeeName === `Not Collector ${seq}`);
    assert.ok(names.every((e) => e.department === "Collection"));
    assert.ok(!names.some((e) => e.employeeName.startsWith("Not Collector")));
    const allCollection = (res.body as Array<{ employeeName: string; department: string }>)
      .filter((e) => e.department === "Collection")
      .map((e) => e.employeeName);
    const sorted = [...allCollection].sort((a, b) => a.localeCompare(b));
    assert.deepEqual(allCollection, sorted);
  });
});
