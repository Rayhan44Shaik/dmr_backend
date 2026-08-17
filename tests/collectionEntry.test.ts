/**
 * Collection Entry — real financial collections, integration-tested against a
 * real PostgreSQL engine (PGlite behind pg-gateway). No mocks.
 *
 * Validates the production business flow:
 *   Shop opening balance → Completed Trip → Rate Entry Save & Lock →
 *   Shop Sales (DEBIT baked at lock) → Collection (CREDIT at approval) →
 *   Shop Ledger reconcile → permanent unique Col-YYYYMMDD-NNN numbers.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { postJson, patchJson, startApp, type TestApp } from "./helpers/app.js";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";

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
  await app.close();
  await testDb.close();
  await pool.end();
});

let seq = 0;

async function seedShop(opening: number): Promise<{ id: number; name: string }> {
  seq += 1;
  const shop = await mastersService.upsertShop({
    shopName: `CE Shop ${seq}`,
    ownerName: "Owner",
    phoneNumber: `97300001${String(seq).padStart(2, "0")}`,
    village: "Village",
    address: "Addr",
    status: "Active",
    openingBalance: opening,
  });
  // Establish the authoritative starting outstanding.
  await pool.query(
    `UPDATE shops SET opening_balance = $2, current_balance = $2 WHERE id = $1`,
    [shop.id, opening]
  );
  return { id: shop.id, name: shop.shopName };
}

async function seedSupport() {
  seq += 1;
  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: `CEV${String(seq).padStart(4, "0")}`,
    vehicleType: "Lorry",
    noOfBoxes: 85,
    birdCapacity: 50000,
    capacityKg: 60000,
    engineNumber: `CEENG${seq}`,
    chassisNumber: `CECHS${seq}`,
    status: "Active",
  });
  const driver = await mastersService.upsertEmployee({
    employeeName: `CE Driver ${seq}`,
    department: "Driver",
    role: "Driver",
    phoneNumber: `93215555${String(seq).padStart(2, "0")}`,
    licenseNumber: `CEDL${seq}`,
    salary: 18000,
    status: "Active",
  });
  const supervisor = await mastersService.upsertEmployee({
    employeeName: `CE Sup ${seq}`,
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: `94215555${String(seq).padStart(2, "0")}`,
    salary: 24000,
    status: "Active",
  });
  const farm = await mastersService.upsertFarm({
    farmName: `CE Farm ${seq}`,
    ownerName: "Owner X",
    supervisorName: "Supervisor X",
    phoneNumber: `96715555${String(seq).padStart(2, "0")}`,
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

async function addDelivery(tripId: number, shopId: number, shopName: string, amount: number): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, birds, weight, mortality, rate, amount)
     VALUES ($1, $2, $3, $4, 300, 500, 0, 200, ROUND($5::numeric, 2))
     RETURNING id`,
    // rate 200 × weight 500 = 100000 base; we force `amount` directly to the
    // desired value to keep the test focused on the ledger, not sales math.
    [tripId, `CE-SALE-${seq}-${shopId}`, shopId, shopName, amount]
  );
  return result.rows[0].id;
}

/**
 * Opens a shop at `opening`, creates a Completed + Rate-Locked trip carrying a
 * delivery worth `saleAmount`. The rate-lock trigger bakes the sale DEBIT, so
 * current outstanding = opening + saleAmount.
 */
async function seedShopWithDebit(
  opening: number,
  saleAmount: number,
  date = "2026-08-06"
): Promise<{ shop: { id: number; name: string }; tripId: number }> {
  const shop = await seedShop(opening);
  const sup = await seedSupport();
  const trip = await makeCompletedTrip(sup, {
    tripNo: `CE-TRIP-${seq}`,
    tripDate: date,
    totalBirds: 1000,
    dcWeight: 1800,
  });
  await addDelivery(trip.id, shop.id, shop.name, saleAmount);
  await recalcTripDeliveryTotals(pool as never, trip.id);
  const lock = await rateEntryService.lock(trip.id, { lockedBy: "ce-test" });
  assert.ok(lock.rateLocked, "trip must be rate-locked to expose Shop Sales");
  await pool.query(`UPDATE trips SET approved_at = NOW() WHERE id = $1`, [trip.id]);
  return { shop, tripId: trip.id };
}

function round(n: number): number {
  return Number(n.toFixed(2));
}

async function currentOutstanding(shopId: number): Promise<number> {
  const r = await pool.query<{ current_balance: string }>(
    `SELECT current_balance FROM shops WHERE id = $1`,
    [shopId]
  );
  return Number(r.rows[0].current_balance);
}

async function ledgerNet(shopId: number): Promise<number> {
  const r = await pool.query<{ n: string }>(
    `SELECT COALESCE(SUM(debit) - SUM(credit), 0) AS n FROM shop_ledger WHERE shop_id = $1`,
    [shopId]
  );
  return Number(r.rows[0].n);
}

// ---------------------------------------------------------------------------
// 1–4. Unique collection numbering (Col-YYYYMMDD-001, no reuse, gaps allowed)
// ---------------------------------------------------------------------------
describe("Collection numbering — permanent, unique, no reuse", () => {
  it("1-3. Col-YYYYMMDD-001, -002 then delete #002, next = #003", async () => {
    const { shop } = await seedShopWithDebit(10000, 5000);
    const c1 = await collectionEntryService.create({
      collectionDate: "2026-08-16",
      shopId: shop.id,
      amount: 2000,
      collector: "Alpha",
    });
    const c2 = await collectionEntryService.create({
      collectionDate: "2026-08-16",
      shopId: shop.id,
      amount: 1000,
      collector: "Alpha",
    });
    assert.equal(c1.collectionNo, "Col-20260816-001");
    assert.equal(c2.collectionNo, "Col-20260816-002");

    await collectionEntryService.softDelete(c2.id, { reason: "test" });
    const c3 = await collectionEntryService.create({
      collectionDate: "2026-08-16",
      shopId: shop.id,
      amount: 500,
      collector: "Alpha",
    });
    // Deleted #002 is never reused — next is #003.
    assert.equal(c3.collectionNo, "Col-20260816-003");
  });

  it("4. Status transitions (approve/reject/delete) preserve the same number", async () => {
    const { shop } = await seedShopWithDebit(10000, 5000);
    const c = await collectionEntryService.create({
      collectionDate: "2026-08-16",
      shopId: shop.id,
      amount: 2000,
    });
    const no = c.collectionNo;
    const approved = await collectionEntryService.approve(c.id);
    assert.equal(approved.collectionNo, no);
    const again = await collectionEntryService.approve(c.id); // idempotent
    assert.equal(again.collectionNo, no);
    const rejected = await collectionEntryService.reject(c.id, { reason: "dup" });
    assert.equal(rejected.collectionNo, no);
    const afterDelete = await collectionEntryService.softDelete(c.id, { reason: "test" });
    assert.equal(afterDelete.collectionNo, no);
  });

  it("Game: concurrent creates on the same day yield distinct, gap-free numbers", async () => {
    const { shop } = await seedShopWithDebit(100000, 0);
    const results = await Promise.all(
      [1, 2, 3, 4].map((i) =>
        collectionEntryService.create({
          collectionDate: "2026-08-17",
          shopId: shop.id,
          amount: 100 * i,
          collector: `C${i}`,
        })
      )
    );
    const nos = results.map((r) => r.collectionNo).sort();
    assert.deepEqual(nos, ["Col-20260817-001", "Col-20260817-002", "Col-20260817-003", "Col-20260817-004"]);
  });

  it("DB UNIQUE enforces uniqueness of collection_no", async () => {
    await assert.rejects(
      pool.query(`INSERT INTO collections (collection_no, collection_date, shop_id, status, amount_collected, amount)
                  VALUES ('Col-DUPLICATE-1', '2026-08-18', 1, 'Pending Approval', 100, 100)
                         ,('Col-DUPLICATE-1', '2026-08-18', 1, 'Pending Approval', 100, 100)`),
      /unique/i
    );
  });
});

// ---------------------------------------------------------------------------
// 5–9. Balance snapshot & Shop Master outstanding synchronization
// ---------------------------------------------------------------------------
describe("Collection approval credits the Shop and snapshots balances", () => {
  it("5-9. opening 10000 + sale 5000 → 15000; collect 2000 → 13000, snapshots correct", async () => {
    const { shop } = await seedShopWithDebit(10000, 5000, "2026-08-20");
    assert.equal(await currentOutstanding(shop.id), 15000, "sale debit baked at rate lock");

    const c1 = await collectionEntryService.create({
      collectionDate: "2026-08-20",
      shopId: shop.id,
      amount: 2000,
      collector: "Alpha",
    });
    // Pending → no financial effect yet.
    assert.equal(await currentOutstanding(shop.id), 15000);
    assert.equal(c1.isFinancial, false);

    const approved = await collectionEntryService.approve(c1.id, { approvedBy: "auditor" });
    assert.equal(approved.openingBalance, 15000);
    assert.equal(approved.amount, 2000);
    assert.equal(approved.closingBalance, 13000);
    assert.equal(approved.status, "Approved");
    assert.equal(approved.approvedBy, "auditor");
    assert.equal(await currentOutstanding(shop.id), 13000, "Shop Master outstanding synced");

    // Second collection #002 from 13000.
    const c2 = await collectionEntryService.create({
      collectionDate: "2026-08-20",
      shopId: shop.id,
      amount: 3000,
      collector: "Beta",
    });
    const approved2 = await collectionEntryService.approve(c2.id, { approvedBy: "auditor" });
    assert.equal(approved2.collectionNo, "Col-20260820-002");
    assert.equal(approved2.openingBalance, 13000);
    assert.equal(approved2.closingBalance, 10000);
    assert.equal(await currentOutstanding(shop.id), 10000, "two collections credit correctly");
  });

  it("Ledger reconciles: opening + sale − collections = current outstanding", async () => {
    const { shop } = await seedShopWithDebit(10000, 5000, "2026-08-06");
    const c = await collectionEntryService.create({ collectionDate: "2026-08-16", shopId: shop.id, amount: 2000 });
    await collectionEntryService.approve(c.id);
    const net = await ledgerNet(shop.id);
    const opening = (await pool.query(`SELECT opening_balance FROM shops WHERE id=$1`, [shop.id])).rows[0].opening_balance;
    assert.equal(round(Number(opening) + net), round(await currentOutstanding(shop.id)));
    assert.equal(await currentOutstanding(shop.id), 13000);
  });
});

// ---------------------------------------------------------------------------
// 10–11. Shop Sale debit & differential correction
// ---------------------------------------------------------------------------
describe("Shop Sales debit and correction synchronization", () => {
  it("10. Sale debit increases outstanding once at rate lock", async () => {
    const { shop } = await seedShopWithDebit(10000, 5000, "2026-08-06");
    assert.equal(await currentOutstanding(shop.id), 15000);
    // Locking again is rejected (no double bake).
    await assert.rejects(rateEntryService.lock((await pool.query(`SELECT trip_id FROM trip_deliveries WHERE shop_id=$1 LIMIT 1`, [shop.id])).rows[0].trip_id, {}), /already rate-locked/i);
  });

  it("11. Shop Sale correction changes the Shop outstanding by the DIFFERENCE", async () => {
    // Consistent baseline: weight 10 × rate 50 → amount 500.
    const shop = await seedShop(10000);
    const sup = await seedSupport();
    const trip = await makeCompletedTrip(sup, {
      tripNo: `CE-DIFF-${seq}`, tripDate: "2026-08-06", totalBirds: 1000, dcWeight: 1800,
    });
    const ins = await pool.query<{ id: number }>(
      `INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, birds, weight, mortality, rate, amount)
       VALUES ($1, $2, $3, $4, 300, 10, 0, 50, 500) RETURNING id`,
      [trip.id, `CE-DIFF-SALE-${seq}`, shop.id, shop.name]
    );
    const saleId = ins.rows[0].id;
    await rateEntryService.lock(trip.id, { lockedBy: "ce-test" });
    // Outstanding = 10000 + 500 (sale debit baked at lock).
    assert.equal(await currentOutstanding(shop.id), 10500);

    // Correct rate 50 → 55 → new amount = 10 × 55 = 550 → outstanding +50 only.
    await shopSalesService.update(saleId, { rate: 55 });
    assert.equal(await currentOutstanding(shop.id), 10550, "only the +50 difference applied");

    // Correct rate 55 → 51 → new amount = 510 → outstanding −40 only.
    await shopSalesService.update(saleId, { rate: 51 });
    assert.equal(await currentOutstanding(shop.id), 10510, "only the −40 difference applied");
  });
});

// ---------------------------------------------------------------------------
// 12–15. Edit difference, approval idempotency, delete idempotency
// ---------------------------------------------------------------------------
describe("Collection edit/approve/delete idempotency", () => {
  it("12. Editing an approved collection applies the DIFFERENCE only", async () => {
    const { shop } = await seedShopWithDebit(10000, 5000, "2026-08-06");
    const c = await collectionEntryService.create({ collectionDate: "2026-08-16", shopId: shop.id, amount: 2000 });
    await collectionEntryService.approve(c.id);
    assert.equal(await currentOutstanding(shop.id), 13000);
    // 2000 → 2500 : outstanding must drop by exactly 500 → 12500.
    await collectionEntryService.update(c.id, { amount: 2500 });
    assert.equal(await currentOutstanding(shop.id), 12500);
    await collectionEntryService.update(c.id, { amount: 1500 });
    assert.equal(await currentOutstanding(shop.id), 13500);
  });

  it("13. Approving twice never credits twice", async () => {
    const { shop } = await seedShopWithDebit(10000, 5000, "2026-08-06");
    const c = await collectionEntryService.create({ collectionDate: "2026-08-16", shopId: shop.id, amount: 2000 });
    await collectionEntryService.approve(c.id);
    const bal1 = await currentOutstanding(shop.id); // 13000
    await collectionEntryService.approve(c.id);
    const bal2 = await currentOutstanding(shop.id);
    assert.equal(bal2, 13000);
    assert.equal(bal1, bal2, "second approval must be a no-op");
  });

  it("14. Deleting twice never reverses twice", async () => {
    const { shop } = await seedShopWithDebit(10000, 5000, "2026-08-06");
    const c = await collectionEntryService.create({ collectionDate: "2026-08-16", shopId: shop.id, amount: 2000 });
    await collectionEntryService.approve(c.id);
    assert.equal(await currentOutstanding(shop.id), 13000);
    await collectionEntryService.softDelete(c.id, { reason: "remove" });
    assert.equal(await currentOutstanding(shop.id), 15000, "credit reversed once on delete");
    await collectionEntryService.softDelete(c.id, { reason: "again" });
    assert.equal(await currentOutstanding(shop.id), 15000, "second delete must not reverse again");
  });

  it("15. Rejecting a pending collection has no financial effect", async () => {
    const { shop } = await seedShopWithDebit(10000, 5000, "2026-08-06");
    const c = await collectionEntryService.create({ collectionDate: "2026-08-16", shopId: shop.id, amount: 2000 });
    const before = await currentOutstanding(shop.id);
    await collectionEntryService.reject(c.id, { reason: "n/a" });
    assert.equal(await currentOutstanding(shop.id), before, "rejected pending collection has no effect");
  });
});

// ---------------------------------------------------------------------------
// 16–17. Rate-Entry / Shop-Sales gating and validation
// ---------------------------------------------------------------------------
describe("Collection prerequisite gating cannot be bypassed", () => {
  it("16. Collection against a non-rate-locked trip is rejected", async () => {
    const shop = await seedShop(10000);
    const sup = await seedSupport();
    const trip = await makeCompletedTrip(sup, { tripNo: `CE-GATE-${seq}`, tripDate: "2026-08-07", totalBirds: 1000, dcWeight: 1800 });
    await addDelivery(trip.id, shop.id, shop.name, 5000);
    await pool.query(`UPDATE trips SET approved_at = NOW() WHERE id = $1`, [trip.id]);
    await assert.rejects(
      collectionEntryService.create({ collectionDate: "2026-08-16", shopId: shop.id, saleId: (await pool.query(`SELECT id FROM trip_deliveries WHERE trip_id=$1 LIMIT 1`, [trip.id])).rows[0].id, amount: 1000 }),
      /locked/i
    );
  });

  it("17. Amount > outstanding and amount = 0 are rejected", async () => {
    const { shop } = await seedShopWithDebit(10000, 0, "2026-08-06");
    await assert.rejects(
      collectionEntryService.create({ collectionDate: "2026-08-16", shopId: shop.id, amount: 20000 }),
      /exceeds/i
    );
    await assert.rejects(
      collectionEntryService.create({ collectionDate: "2026-08-16", shopId: shop.id, amount: 0 }),
      /amount|Validation|greater/i
    );
  });
});

// ---------------------------------------------------------------------------
// 18. Concurrent approvals for the same shop serialize safely
// ---------------------------------------------------------------------------
describe("Concurrency", () => {
  it("18. Two simultaneous approvals for one shop end with the correct balance", async () => {
    const { shop } = await seedShopWithDebit(10000, 0, "2026-08-06"); // outstanding 10000
    const a = await collectionEntryService.create({ collectionDate: "2026-08-16", shopId: shop.id, amount: 6000 });
    const b = await collectionEntryService.create({ collectionDate: "2026-08-16", shopId: shop.id, amount: 3000 });
    await Promise.all([
      collectionEntryService.approve(a.id),
      collectionEntryService.approve(b.id),
    ]);
    // Serialized via shop row lock: final = 10000 − 6000 − 3000 = 1000.
    assert.equal(await currentOutstanding(shop.id), 1000);
    // Each paid exactly once.
    const ledgerRows = await pool.query(`SELECT SUM(credit) AS c FROM shop_ledger WHERE reference_type='collection' AND reference_id=$1`, [a.id]);
    assert.equal(Number(ledgerRows.rows[0].c), 6000);
  });
});

// ---------------------------------------------------------------------------
// 19–20. HTTP API compatibility & transaction rollback
// ---------------------------------------------------------------------------
describe("HTTP API and transaction safety", () => {
  it("19. POST /collection-entry then live-status reasons about the number and status", async () => {
    const { shop } = await seedShopWithDebit(10000, 5000, "2026-08-06");
    const created = await postJson(baseUrl, "/api/operations/collection-entry", {
      collectionDate: "2026-08-16",
      shopId: shop.id,
      amount: 2000,
      collector: "HTTP",
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.match(created.body.collectionNo, /^Col-20260816-\d{3}$/);
    assert.equal(created.body.status, "Pending Approval");
    // Approve through the HTTP API (status route is PATCH).
    const approved = await patchJson(baseUrl, `/api/operations/collection-entry/${created.body.id}/status`, { status: "Approved", approvedBy: "web" });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.status, "Approved");
  });

  it("20. Transaction rollback: failed approval leaves no partial financial state", async () => {
    const { shop } = await seedShopWithDebit(10000, 5000, "2026-08-06");
    // Two valid collections at create time (outstanding 15000), but approving
    // the first drains enough to make the second exceed the balance at
    // approval — so approve() must fail AFTER locking the shop and roll back.
    const a = await collectionEntryService.create({ collectionDate: "2026-08-16", shopId: shop.id, amount: 12000 });
    const b = await collectionEntryService.create({ collectionDate: "2026-08-16", shopId: shop.id, amount: 12000 });
    await collectionEntryService.approve(b.id); // outstanding 15000 → 3000
    await assert.rejects(collectionEntryService.approve(a.id), /exceeds/i);
    const row = await pool.query(`SELECT is_financial, status FROM collections WHERE id=$1`, [a.id]);
    assert.equal(row.rows[0].is_financial, false, "failed approval must not be financial");
    assert.equal(await currentOutstanding(shop.id), 3000, "only the approved (b) credit persisted");
    assert.equal(await ledgerNet(shop.id), 5000 - 12000, "ledger holds sale debit and b-credit only");
  });
});