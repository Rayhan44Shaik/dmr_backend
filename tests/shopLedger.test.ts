/**
 * Shop Ledger — complete financial history read (shop_ledger is the single
 * source of truth). Integration-tested against a real PostgreSQL engine
 * (PGlite behind pg-gateway). No mocks.
 *
 * Validates:
 *   • Recent-10 is ONLY a display window — all records stay in PostgreSQL.
 *   • Ledger includes BOTH Shop Sales DEBITs and Collection CREDITs.
 *   • Custom date ranges return the complete matching range (no hard limit).
 *   • Opening / running balances stay authoritative across filtered subsets
 *     and across pagination pages.
 *   • Pending collections are NOT in the ledger; the approved credit appears
 *     exactly once.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { startApp, type TestApp } from "./helpers/app.js";
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
const { shopLedgerService } = await import("../src/services/shopLedgerService.js");
const { recalcTripDeliveryTotals } = await import("../src/utils/tripDeliverySync.js");

after(async () => {
  await shutdownTestEnv({ app, testDb, pool });
});

let seq = 0;

async function seedShop(opening: number): Promise<{ id: number; name: string }> {
  seq += 1;
  const shop = await mastersService.upsertShop({
    email: `fixture-shop-${Math.random().toString(36).slice(2,8)}@example.com`,
    associationType: "Ass Vij",
    shopName: `LG Shop ${seq}`,
    ownerName: "Owner",
    phoneNumber: `974300${String(seq).padStart(4, "0")}`,
    village: "Village",
    address: "Addr",
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
    vehicleNumber: `LGV${String(seq).padStart(4, "0")}`,
    vehicleType: "Lorry",
    noOfBoxes: 85,
    birdCapacity: 50000,
    capacityKg: 60000,
    engineNumber: `LGENG${seq}`,
    chassisNumber: `LGCHS${seq}`,
    status: "Active",
  });
  const driver = await mastersService.upsertEmployee({
    employeeName: `LG Driver ${seq}`,
    department: "Driver",
    role: "Driver",
    phoneNumber: `9333${String(seq).padStart(6, "0")}`,
    licenseNumber: `LGDL${seq}`,
    salary: 18000,
    status: "Active",
  });
  const supervisor = await mastersService.upsertEmployee({
    employeeName: `LG Sup ${seq}`,
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: `9433${String(seq).padStart(6, "0")}`,
    salary: 24000,
    status: "Active",
  });
  const farm = await mastersService.upsertFarm({
    farmName: `LG Farm ${seq}`,
    ownerName: "Owner X",
    supervisorName: "Supervisor X",
    phoneNumber: `9673${String(seq).padStart(6, "0")}`,
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
    [tripId, `LG-SALE-${seq}-${shopId}`, shopId, shopName, amount]
  );
  return result.rows[0].id;
}

async function seedShopWithDebit(
  opening: number,
  saleAmount: number,
  date = "2026-08-06"
): Promise<{ shop: { id: number; name: string }; tripId: number }> {
  const shop = await seedShop(opening);
  const sup = await seedSupport();
  const trip = await makeCompletedTrip(sup, {
    tripNo: `LG-TRIP-${seq}`,
    tripDate: date,
    totalBirds: 1000,
    dcWeight: 1800,
  });
  await addDelivery(trip.id, shop.id, shop.name, saleAmount);
  await recalcTripDeliveryTotals(pool as never, trip.id);
  const lock = await rateEntryService.lock(trip.id, { lockedBy: "lg-test" });
  assert.ok(lock.rateLocked, "trip must be rate-locked to expose Shop Sales");
  await pool.query(`UPDATE trips SET approved_at = NOW() WHERE id = $1`, [trip.id]);
  return { shop, tripId: trip.id };
}

describe("Shop Ledger — complete history with shop + custom date range", () => {
  it("1. Recent-10 is display-only: backend can still return all 12 collections", async () => {
    const { shop } = await seedShopWithDebit(100000, 0);
    const created: { id: number; collectionNo: string }[] = [];
    for (let i = 0; i < 12; i += 1) {
      created.push(
        await collectionEntryService.create({
          collectionDate: "2026-08-16",
          shopId: shop.id,
          amount: 1000,
          collector: `C${i}`,
        })
      );
    }

    // The recent-10 view — backend LIMIT 10, newest first.
    const recent = await collectionEntryService.list({
      shopId: shop.id,
      pagination: { page: 1, limit: 10, offset: 0 },
    });
    assert.ok(!Array.isArray(recent) && "data" in recent, "paginated list has meta");
    assert.equal(recent.data.length, 10);
    assert.equal(recent.data[0].collectionNo, created[11].collectionNo, "newest at top");
    assert.equal(recent.data[9].collectionNo, created[2].collectionNo);

    // The FULL history stays complete — nothing was removed.
    const full = await collectionEntryService.list({ shopId: shop.id });
    assert.ok(Array.isArray(full));
    assert.equal(full.length, 12);
    const dbCount = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM collections WHERE shop_id = $1 AND deleted = FALSE`,
      [shop.id]
    );
    assert.equal(Number(dbCount.rows[0].c), 12, "all 12 records remain in PostgreSQL");
  });

  it("2. Ledger includes BOTH the sale DEBIT and the collection CREDIT with running balances", async () => {
    const { shop } = await seedShopWithDebit(10000, 5000, "2026-08-06");
    const c = await collectionEntryService.create({
      collectionDate: "2026-08-10",
      shopId: shop.id,
      amount: 2000,
      collector: "Auditor",
    });
    await collectionEntryService.approve(c.id, { approvedBy: "auditor" });

    const ledger = await shopLedgerService.list({
      shopId: shop.id,
      fromDate: "2026-08-06",
      toDate: "2026-08-16",
    });
    assert.equal(ledger.openingBalance, 10000, "opening as-of range start (no ledger before 08-06)");
    assert.ok(Array.isArray(ledger.data));
    assert.equal(ledger.data.length, 2);
    assert.equal(ledger.data[0].type, "sale");
    assert.equal(ledger.data[0].debit, 5000);
    assert.equal(ledger.data[0].credit, 0);
    assert.equal(ledger.data[0].balance, 15000);
    assert.equal(ledger.data[1].type, "collection");
    assert.equal(ledger.data[1].credit, 2000);
    assert.equal(ledger.data[1].debit, 0);
    assert.equal(ledger.data[1].balance, 13000);
    assert.equal(ledger.data[1].referenceNo, c.collectionNo);
  });

  it("3. Custom date range is complete — a late range returns only its matching tail", async () => {
    const { shop } = await seedShopWithDebit(10000, 5000, "2026-08-06");
    const c = await collectionEntryService.create({
      collectionDate: "2026-08-10",
      shopId: shop.id,
      amount: 2000,
    });
    await collectionEntryService.approve(c.id);

    const tail = await shopLedgerService.list({
      shopId: shop.id,
      fromDate: "2026-08-10",
      toDate: "2026-08-16",
    });
    assert.equal(tail.openingBalance, 15000, "opening = balance at the range start (sale debit included)");
    assert.equal(tail.data.length, 1, "only the in-range collection credit");
    assert.equal(tail.data[0].type, "collection");
    assert.equal(tail.data[0].credit, 2000);
    assert.equal(tail.data[0].balance, 13000, "running balance stays authoritative for the subset");

    // Wider range (08-06 → 08-09) returns only the sale debit.
    const head = await shopLedgerService.list({
      shopId: shop.id,
      fromDate: "2026-08-06",
      toDate: "2026-08-09",
    });
    assert.equal(head.data.length, 1);
    assert.equal(head.data[0].type, "sale");
    assert.equal(head.data[0].debit, 5000);
  });

  it("4. Pagination never breaks the running balance (opening is full-history-derived)", async () => {
    const { shop } = await seedShopWithDebit(10000, 5000, "2026-08-06");
    const c = await collectionEntryService.create({
      collectionDate: "2026-08-10",
      shopId: shop.id,
      amount: 2000,
    });
    await collectionEntryService.approve(c.id);

    const page1 = await shopLedgerService.list({
      shopId: shop.id,
      fromDate: "2026-08-06",
      toDate: "2026-08-16",
      pagination: { page: 1, limit: 1, offset: 0 },
    });
    assert.equal(page1.meta?.total, 2);
    assert.equal(page1.data.length, 1);
    assert.equal(page1.data[0].balance, 15000);
    assert.equal(page1.openingBalance, 10000);

    const page2 = await shopLedgerService.list({
      shopId: shop.id,
      fromDate: "2026-08-06",
      toDate: "2026-08-16",
      pagination: { page: 2, limit: 1, offset: 1 },
    });
    assert.equal(page2.data.length, 1);
    assert.equal(page2.data[0].balance, 13000, "row 2 keeps the correct cumulative balance");
  });

  it("5. Pending collection is NOT a ledger credit; approval adds it exactly once", async () => {
    const { shop } = await seedShopWithDebit(10000, 5000, "2026-08-06");
    const c = await collectionEntryService.create({
      collectionDate: "2026-08-10",
      shopId: shop.id,
      amount: 2000,
    });

    // Pending → ledger unchanged (sale debit only).
    const pending = await shopLedgerService.list({
      shopId: shop.id,
      fromDate: "2026-08-06",
      toDate: "2026-08-16",
    });
    assert.equal(pending.data.length, 1);
    assert.equal(pending.data[0].type, "sale");

    await collectionEntryService.approve(c.id);
    const after = await shopLedgerService.list({
      shopId: shop.id,
      fromDate: "2026-08-06",
      toDate: "2026-08-16",
    });
    const credits = after.data.filter((r) => r.type === "collection" && r.referenceId === c.id);
    assert.equal(credits.length, 1, "approved credit appears exactly once");
    assert.equal(credits[0].credit, 2000);
    assert.equal(after.data[after.data.length - 1].balance, 13000);
  });

  it("6. HTTP GET /operations/shop-ledger returns opening + complete range", async () => {
    const { shop } = await seedShopWithDebit(10000, 5000, "2026-08-06");
    const c = await collectionEntryService.create({
      collectionDate: "2026-08-10",
      shopId: shop.id,
      amount: 2000,
    });
    await collectionEntryService.approve(c.id);

    const res = await fetch(
      `${baseUrl}/api/operations/shop-ledger?shopId=${shop.id}&fromDate=2026-08-06&toDate=2026-08-16`
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      openingBalance: number;
      data: { type: string; debit: number; credit: number; balance: number; referenceNo: string }[];
    };
    assert.equal(body.openingBalance, 10000);
    assert.equal(body.data.length, 2);
    assert.equal(body.data[0].debit, 5000);
    assert.equal(body.data[1].credit, 2000);
    assert.equal(body.data[1].balance, 13000);
    assert.equal(body.data[1].referenceNo, c.collectionNo);
  });

  it("7. REQUIRED — 11 approved collections: view = latest 10 only, ledger = all 11 credits + sale, transaction #1 never deleted", async () => {
    const { shop } = await seedShopWithDebit(100000, 5000, "2026-08-01"); // outstanding 105000

    // Create AND approve 11 collections (newest on the latest date).
    const nos: { id: number; collectionNo: string }[] = [];
    for (let i = 1; i <= 11; i += 1) {
      const day = String(9 + i).padStart(2, "0"); // 2026-08-10 … 2026-08-20
      const created = await collectionEntryService.create({
        collectionDate: `2026-08-${day}`,
        shopId: shop.id,
        amount: 1000,
        collector: `Deposit${i}`,
      });
      // While PENDING the ledger has NO credit (financial rule).
      const pendingLedger = await shopLedgerService.list({
        shopId: shop.id,
        fromDate: "2026-08-01",
        toDate: "2026-08-31",
      });
      assert.equal(
        pendingLedger.data.filter((r) => r.referenceId === created.id).length,
        0,
        `collection #${i} must not credit the ledger while pending`
      );
      await collectionEntryService.approve(created.id, { approvedBy: "reporter" });
      nos.push({ id: created.id, collectionNo: created.collectionNo });
    }

    // -- PENDING/VIEW: exactly the latest 10, newest → oldest --------
    const recent = await collectionEntryService.list({
      shopId: shop.id,
      pagination: { page: 1, limit: 10, offset: 0 },
    });
    assert.ok(!Array.isArray(recent) && "data" in recent, "paginated list has meta");
    assert.equal(recent.data.length, 10, "view shows exactly 10");
    assert.equal(recent.data[0].collectionNo, nos[10].collectionNo, "newest first");
    assert.equal(recent.data[9].collectionNo, nos[1].collectionNo, "10th row shows #2");
    assert.ok(
      !recent.data.some((r) => r.id === nos[0].id),
      "oldest #1 is NOT in the recent-10 list"
    );

    // #1 still exists permanently in PostgreSQL — limit is display-only.
    const oldestRow = await pool.query(
      `SELECT id, deleted FROM collections WHERE id = $1`,
      [nos[0].id]
    );
    assert.equal(oldestRow.rowCount, 1, "transaction #1 remains in the database");
    assert.equal(oldestRow.rows[0].deleted, false, "transaction #1 is not soft-deleted");

    const dbCount = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM collections WHERE shop_id = $1 AND deleted = FALSE`,
      [shop.id]
    );
    assert.equal(Number(dbCount.rows[0].c), 11, "all 11 records remain in the database");

    // -- SHOP LEDGER: full date range = ALL 11 credits + the sale DEBIT --
    const ledger = await shopLedgerService.list({
      shopId: shop.id,
      fromDate: "2026-08-01",
      toDate: "2026-08-31",
    });
    assert.equal(ledger.openingBalance, 100000, "opening as-of range start");
    const saleRows = ledger.data.filter((r) => r.type === "sale");
    assert.equal(saleRows.length, 1);
    assert.equal(saleRows[0].debit, 5000);
    const creditRows = ledger.data.filter((r) => r.type === "collection");
    assert.equal(creditRows.length, 11, "ALL 11 credits visible — NO recent-10 limit");
    for (const no of nos) {
      assert.equal(
        creditRows.filter((r) => r.referenceId === no.id).length,
        1,
        `${no.collectionNo} credited exactly once`
      );
    }
    const sumCredits = creditRows.reduce((s, r) => s + r.credit, 0);
    assert.equal(ledger.data[ledger.data.length - 1].balance, 100000 + 5000 - sumCredits);

    // Financial balances are never affected by the recent-10 display limit.
    const shopRow = await pool.query<{ current_balance: string }>(
      `SELECT current_balance FROM shops WHERE id = $1`,
      [shop.id]
    );
    assert.equal(
      Number(shopRow.rows[0].current_balance),
      100000 + 5000 - sumCredits,
      "Shop Master outstanding driven by the full ledger, not by the recent-10 window"
    );
  });
});