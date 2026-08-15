import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../config/db.js";
import { AppError } from "../../middleware/errorHandler.js";
import { shopSalesService } from "../shopSalesService.js";
import { rateEntryService } from "../rateEntryService.js";
import { collectionsService } from "../collectionsService.js";
import type { ShopSale } from "../../types/operations.js";

/**
 * Integration tests against the real PostgreSQL database (the backend has no
 * separate test harness â€” these run with the project's `tsx` + Node's
 * built-in `node:test` runner, e.g. `npx tsx --test src/services/__tests__/shopSalesService.test.ts`).
 *
 * Required business flow under test:
 *   Trip Completed â†’ Rate Entry â†’ Enter rate â†’ Save & Lock â†’ Shop Sales.
 * A trip being Completed alone must NOT surface its deliveries in Shop Sales;
 * they become visible only once the trip's rate_entry row exists (the
 * existing authoritative "saved & locked" state â€” no new field invented).
 */

const used = new Map<number, number>();
let uniqSeq = 0;
const uniqBase = (Date.now() % 1_000_000) * 1000 + Math.floor(Math.random() * 1000);
function uniqueInt(): number {
  // shop_no / bird_type_no are INTEGER (32-bit) columns â€” stay safely below
  // 2^31 and unique within this run.
  let v = uniqBase + ++uniqSeq;
  while (used.has(v)) v = uniqBase + ++uniqSeq;
  used.set(v, 1);
  return v;
}

const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
  now.getDate()
).padStart(2, "0")}`;

interface Fixture {
  tripIds: number[];
  shopIds: number[];
  birdTypeIds: number[];
}

function newFixture(): Fixture {
  return { tripIds: [], shopIds: [], birdTypeIds: [] };
}

async function cleanup(f: Fixture): Promise<void> {
  if (f.tripIds.length) {
    await pool.query(`DELETE FROM trips WHERE id = ANY($1::int[])`, [f.tripIds]);
  }
  if (f.shopIds.length) {
    await pool.query(`DELETE FROM shops WHERE id = ANY($1::int[])`, [f.shopIds]);
  }
  if (f.birdTypeIds.length) {
    await pool.query(`DELETE FROM bird_types WHERE id = ANY($1::int[])`, [f.birdTypeIds]);
  }
}

async function makeShop(f: Fixture, name: string): Promise<{ id: number }> {
  const r = await pool.query<{ id: number }>(
    `INSERT INTO shops (shop_no, shop_name) VALUES ($1, $2) RETURNING id`,
    [uniqueInt(), name]
  );
  f.shopIds.push(r.rows[0].id);
  return r.rows[0];
}

async function makeBirdType(f: Fixture, name: string): Promise<{ id: number }> {
  const r = await pool.query<{ id: number }>(
    `INSERT INTO bird_types (bird_type_no, bird_type) VALUES ($1, $2) RETURNING id`,
    [uniqueInt(), name]
  );
  f.birdTypeIds.push(r.rows[0].id);
  return r.rows[0];
}

/**
 * Creates a Completed trip (approved now, within the 10-day edit window) with
 * one delivery. Capacity is generously sized so later Shop Sales creates stay
 * within bounds.
 */
async function makeCompletedTrip(
  f: Fixture,
  opts: {
    tripNo: string;
    shopId: number | null;
    shopName: string;
    birdTypeId: number | null;
    birdType: string;
    birds: number;
    weight: number;
  }
): Promise<{ tripId: number; tripNo: string; deliveryId: number }> {
  const t = await pool.query<{ id: number }>(
    `INSERT INTO trips (trip_no, trip_date, status, approved_at, deleted, total_birds, dc_weight)
     VALUES ($1, CURRENT_DATE, 'Completed', NOW(), FALSE, 1000, 2000)
     RETURNING id`,
    [opts.tripNo]
  );
  const tripId = t.rows[0].id;
  f.tripIds.push(tripId);
  const d = await pool.query<{ id: number }>(
    `INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, bird_type_id, bird_type, birds, weight, rate)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)
     RETURNING id`,
    [
      tripId,
      `${opts.tripNo}-S01`,
      opts.shopId,
      opts.shopName,
      opts.birdTypeId,
      opts.birdType,
      opts.birds,
      opts.weight,
    ]
  );
  return { tripId, tripNo: opts.tripNo, deliveryId: d.rows[0].id };
}

/** Adds one more delivery row to an existing trip (e.g. one created by
 * makeCompletedTrip), for tests that need a second/extra shop delivery. */
async function addDelivery(
  tripId: number,
  opts: { shopId: number | null; shopName: string; birds: number; weight: number }
): Promise<number> {
  const d = await pool.query<{ id: number }>(
    `INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, birds, weight, rate)
     VALUES ($1, $2, $3, $4, $5, $6, NULL)
     RETURNING id`,
    [tripId, `SALE-${Date.now()}-${Math.floor(Math.random() * 100000)}`, opts.shopId, opts.shopName, opts.birds, opts.weight]
  );
  return d.rows[0].id;
}

async function assertAppErrorStatus(promise: Promise<unknown>, status: number): Promise<void> {
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof AppError, `expected AppError, got: ${String(err)}`);
    assert.equal((err as AppError).status, status);
    return true;
  });
}

after(async () => {
  await pool.end();
});

describe("Shop Sales visibility vs Rate Entry lock", () => {
  test("Completed trip WITHOUT a locked Rate Entry does NOT surface its deliveries in Shop Sales", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));

    const shop = await makeShop(f, "no-lock-shop");
    const bt = await makeBirdType(f, "no-lock-bird");
    const trip = await makeCompletedTrip(f, {
      tripNo: `T-NOLOCK-${uniqueInt()}`,
      shopId: shop.id,
      shopName: "no-lock-shop",
      birdTypeId: bt.id,
      birdType: "no-lock-bird",
      birds: 100,
      weight: 200,
    });

    // Authoritative pre-lock state: trips.rate_completed is false for the trip.
    const preLock = await pool.query<{ rate_completed: boolean }>(
      `SELECT COALESCE(rate_completed, FALSE) AS rate_completed FROM trips WHERE id = $1`,
      [trip.tripId]
    );
    assert.equal(preLock.rows[0].rate_completed, false);

    const list = (await shopSalesService.list({ shopId: shop.id })) as ShopSale[];
    assert.equal(list.length, 0);
    assert.ok(!list.some((s) => s.tripId === trip.tripId));

    // The delivery is also unreachable by id.
    await assertAppErrorStatus(shopSalesService.getById(trip.deliveryId), 404);
  });

  test("Completed trip WITH a locked Rate Entry DOES surface its deliveries in Shop Sales", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));

    const shop = await makeShop(f, "locked-shop");
    const bt = await makeBirdType(f, "locked-bird");
    const trip = await makeCompletedTrip(f, {
      tripNo: `T-LOCKED-${uniqueInt()}`,
      shopId: shop.id,
      shopName: "locked-shop",
      birdTypeId: bt.id,
      birdType: "locked-bird",
      birds: 100,
      weight: 200,
    });

    // Save shop-wise rates, then explicitly Lock via the Rate Entry service.
    const saved = await rateEntryService.save(trip.tripId, {
      rates: [{ deliveryId: trip.deliveryId, rate: 62.5 }],
    });
    assert.equal(saved.id, trip.tripId);
    assert.equal(saved.ratesEntered, 1);
    assert.equal(saved.rateLocked, false, "saving alone must not lock the trip");
    const locked = await rateEntryService.lock(trip.tripId, { lockedBy: "tester" });
    assert.equal(locked.rateLocked, true);

    const list = (await shopSalesService.list({ shopId: shop.id })) as ShopSale[];
    const sale = list.find((s) => s.tripId === trip.tripId);
    assert.ok(sale, "locked trip's delivery should appear in Shop Sales");
    assert.equal(sale.id, trip.deliveryId);
    assert.equal(sale.status, "Approved");
    assert.equal(sale.editable, true);

    // Rate Entry "Save" writes the shop-wise rate directly onto the
    // delivery row, so Shop Sales reads it straight from trip_deliveries.
    assert.equal(sale.rate, 62.5);
    assert.equal(sale.amount, Number((200 * 62.5).toFixed(2)));

    const byId = await shopSalesService.getById(trip.deliveryId);
    assert.equal(byId.id, trip.deliveryId);
  });

  test("Existing Shop Sales create/edit/soft-delete continue to work once the Rate Entry is locked", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));

    const shop = await makeShop(f, "existing-fn-shop");
    const bt = await makeBirdType(f, "existing-fn-bird");
    const trip = await makeCompletedTrip(f, {
      tripNo: `T-EXIST-${uniqueInt()}`,
      shopId: shop.id,
      shopName: "existing-fn-shop",
      birdTypeId: bt.id,
      birdType: "existing-fn-bird",
      birds: 100,
      weight: 200,
    });
    await rateEntryService.save(trip.tripId, {
      rates: [{ deliveryId: trip.deliveryId, rate: 55.5 }],
    });
    await rateEntryService.lock(trip.tripId, { lockedBy: "tester" });

    const created = await shopSalesService.create({
      tripId: trip.tripId,
      shopId: shop.id,
      shopName: "existing-fn-shop",
      birdTypeId: bt.id,
      birdType: "existing-fn-bird",
      birds: 20,
      weight: 40,
    });
    assert.ok(created.id > 0);
    assert.equal(created.saleNo, `${trip.tripNo}-S02`);
    // rate falls back to the locked Rate Entry when not supplied by the caller.
    assert.equal(created.rate, 55.5);
    assert.equal(created.amount, Number((40 * 55.5).toFixed(2)));
    assert.equal(created.status, "Approved");
    assert.equal(created.editable, true);

    // Rate Entry LOCKED moves the trip into Shop Sales â€” it does NOT make
    // the rate immutable. Within the 10-day edit window, birds/weight/rate
    // may all be corrected together, subject to their own validation
    // (capacity for birds/weight, â‚¹50â€“â‚¹300 for rate).
    const updated = await shopSalesService.update(created.id, {
      birds: 25,
      weight: 50,
      rate: 60,
    });
    assert.equal(updated.birds, 25);
    assert.equal(updated.weight, 50);
    assert.equal(updated.rate, 60);
    assert.equal(updated.amount, Number((50 * 60).toFixed(2)));

    // Shop/trip reassignment remains permanently blocked, independent of
    // the edit window.
    await assert.rejects(
      () => shopSalesService.update(created.id, { shopId: shop.id }),
      (err: unknown) => err instanceof AppError && err.status === 409
    );

    const removed = await shopSalesService.softDelete(created.id, "test cleanup");
    assert.equal(removed.deleted, true);

    const list = (await shopSalesService.list({ shopId: shop.id })) as ShopSale[];
    assert.ok(!list.some((s) => s.id === created.id), "soft-deleted sale must not appear by default");
  });

  test("Shop Sales create is rejected on a Completed trip with no locked Rate Entry", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));

    const shop = await makeShop(f, "enforce-shop");
    const trip = await makeCompletedTrip(f, {
      tripNo: `T-ENF-C-${uniqueInt()}`,
      shopId: shop.id,
      shopName: "enforce-shop",
      birdTypeId: null,
      birdType: "",
      birds: 100,
      weight: 200,
    });

    await assertAppErrorStatus(
      shopSalesService.create({
        tripId: trip.tripId,
        shopId: shop.id,
        shopName: "enforce-shop",
        birds: 10,
        weight: 20,
      }),
      409
    );
  });

  test("Shop Sales update/softDelete are rejected on a Completed trip with no locked Rate Entry", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));

    const shop = await makeShop(f, "enforce-mut-shop");
    const trip = await makeCompletedTrip(f, {
      tripNo: `T-ENF-M-${uniqueInt()}`,
      shopId: shop.id,
      shopName: "enforce-mut-shop",
      birdTypeId: null,
      birdType: "",
      birds: 100,
      weight: 200,
    });

    await assertAppErrorStatus(shopSalesService.update(trip.deliveryId, { weight: 999 }), 409);
    await assertAppErrorStatus(shopSalesService.softDelete(trip.deliveryId, "not allowed"), 409);
  });
});

describe("Existing Rate Entry behavior", () => {
  test("Save is repeatable while unlocked; Lock is explicit and duplicate locks are rejected (no duplication)", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));

    const trip = await makeCompletedTrip(f, {
      tripNo: `T-RATE-${uniqueInt()}`,
      shopId: null,
      shopName: "",
      birdTypeId: null,
      birdType: "",
      birds: 100,
      weight: 200,
    });

    // No rate entry yet â†’ rate_completed is false (Pending).
    const pre = await pool.query<{ rate_completed: boolean }>(
      `SELECT COALESCE(rate_completed, FALSE) AS rate_completed FROM trips WHERE id = $1`,
      [trip.tripId]
    );
    assert.equal(pre.rows[0].rate_completed, false);

    // Save (including the shop-wise rate on the trip's one delivery, so it
    // meets the completeness check the later lock() call performs).
    const saved = await rateEntryService.save(trip.tripId, {
      rates: [{ deliveryId: trip.deliveryId, rate: 40 }],
    });
    assert.equal(saved.ratesEntered, 1);
    assert.equal(saved.rateLocked, false);

    // Read back via the same single record.
    const read = await rateEntryService.getById(trip.tripId);
    assert.ok(read);
    assert.equal(read.id, saved.id);
    assert.equal(read.ratesEntered, 1);

    // Saving again while unlocked updates the same row (never a 2nd row â€”
    // UNIQUE trip_id guarantees this even under a raw INSERT race).
    const resaved = await rateEntryService.save(trip.tripId, { rates: [] });
    assert.equal(resaved.id, saved.id);
    assert.equal(resaved.rateLocked, false);

    // Editing the existing rate record still works pre-lock.
    const updated = await rateEntryService.save(trip.tripId, {
      rates: [{ deliveryId: trip.deliveryId, rate: 45.25 }],
    });
    assert.equal(updated.id, saved.id);
    assert.equal(updated.ratesEntered, 1);
    assert.equal(
      (await rateEntryService.getById(trip.tripId)).deliveries.find((d) => d.id === trip.deliveryId)?.rate,
      45.25
    );

    // Lock.
    const locked = await rateEntryService.lock(trip.tripId, { lockedBy: "tester" });
    assert.equal(locked.id, saved.id);
    assert.equal(locked.rateLocked, true);

    // A second lock for the same trip is rejected â€” already locked.
    await assertAppErrorStatus(rateEntryService.lock(trip.tripId, { lockedBy: "tester2" }), 409);

    // Save/update are rejected once locked â€” no silent overwrite.
    await assertAppErrorStatus(rateEntryService.save(trip.tripId, { rates: [] }), 409);
    await assertAppErrorStatus(rateEntryService.save(trip.tripId, { rates: [{ deliveryId: trip.deliveryId, rate: 99 }] }), 409);
  });
});

describe("Phase A/B backend integrity", () => {
  test("A/B. Draft and Pending trips are rejected from Shop Sales create", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));

    const shop = await makeShop(f, "phase-ab-shop");
    const draftTripId = await pool
      .query<{ id: number }>(
        `INSERT INTO trips (trip_no, trip_date, status, deleted) VALUES ($1, CURRENT_DATE, 'Draft', FALSE) RETURNING id`,
        [`T-DRAFT-${uniqueInt()}`]
      )
      .then((r) => r.rows[0].id);
    f.tripIds.push(draftTripId);
    const pendingTripId = await pool
      .query<{ id: number }>(
        `INSERT INTO trips (trip_no, trip_date, status, deleted) VALUES ($1, CURRENT_DATE, 'Pending', FALSE) RETURNING id`,
        [`T-PEND-${uniqueInt()}`]
      )
      .then((r) => r.rows[0].id);
    f.tripIds.push(pendingTripId);

    await assertAppErrorStatus(
      shopSalesService.create({ tripId: draftTripId, shopId: shop.id, birds: 10, weight: 20 }),
      409
    );
    await assertAppErrorStatus(
      shopSalesService.create({ tripId: pendingTripId, shopId: shop.id, birds: 10, weight: 20 }),
      409
    );
  });

  test("C. Approved trip without a locked rate is rejected from Shop Sales", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));

    const shop = await makeShop(f, "phase-ab-approved-shop");
    const tripId = await pool
      .query<{ id: number }>(
        `INSERT INTO trips (trip_no, trip_date, status, deleted, total_birds, dc_weight)
         VALUES ($1, CURRENT_DATE, 'Approved', FALSE, 1000, 2000) RETURNING id`,
        [`T-APPR-${uniqueInt()}`]
      )
      .then((r) => r.rows[0].id);
    f.tripIds.push(tripId);

    await assertAppErrorStatus(
      shopSalesService.create({ tripId, shopId: shop.id, birds: 10, weight: 20 }),
      409
    );

    // ...but once Rate Entry is saved AND locked, an Approved (not just
    // Completed) trip becomes eligible too â€” matching Rate Entry's own
    // eligibility (Approved or Completed).
    const d = await addDelivery(tripId, { shopId: shop.id, shopName: "phase-ab-approved-shop", birds: 100, weight: 200 });
    await rateEntryService.save(tripId, { rates: [{ deliveryId: d, rate: 70 }] });
    await rateEntryService.lock(tripId, { lockedBy: "tester" });

    const sale = await shopSalesService.getById(d);
    assert.equal(sale.tripId, tripId);
  });

  test("G. Deleted trip is rejected from Shop Sales even with a locked rate on record", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));

    const shop = await makeShop(f, "phase-ab-deleted-shop");
    const trip = await makeCompletedTrip(f, {
      tripNo: `T-DEL-${uniqueInt()}`,
      shopId: shop.id,
      shopName: "phase-ab-deleted-shop",
      birdTypeId: null,
      birdType: "",
      birds: 100,
      weight: 200,
    });
    await rateEntryService.save(trip.tripId, { rates: [{ deliveryId: trip.deliveryId, rate: 65 }] });
    await rateEntryService.lock(trip.tripId, { lockedBy: "tester" });

    // Confirm it's reachable before deletion.
    assert.ok(await shopSalesService.getById(trip.deliveryId));

    await pool.query(`UPDATE trips SET deleted = TRUE, status = 'Deleted' WHERE id = $1`, [trip.tripId]);

    await assertAppErrorStatus(
      shopSalesService.update(trip.deliveryId, { weight: 999 }),
      409
    );
    await assertAppErrorStatus(
      shopSalesService.create({ tripId: trip.tripId, shopId: shop.id, birds: 5, weight: 5 }),
      409
    );
  });

  test("H. Invalid/nonexistent trip is rejected (404)", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const shop = await makeShop(f, "phase-ab-notrip-shop");

    await assert.rejects(
      () => shopSalesService.create({ tripId: 999999999, shopId: shop.id, birds: 10, weight: 20 }),
      (err: unknown) => err instanceof AppError && err.status === 404
    );
  });

  test("I. Inactive shop is rejected from new Shop Sales creation", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));

    const shop = await makeShop(f, "phase-ab-inactive-shop");
    await pool.query(`UPDATE shops SET status = 'Inactive' WHERE id = $1`, [shop.id]);

    const trip = await makeCompletedTrip(f, {
      tripNo: `T-INACT-${uniqueInt()}`,
      shopId: null,
      shopName: "",
      birdTypeId: null,
      birdType: "",
      birds: 100,
      weight: 200,
    });
    await rateEntryService.save(trip.tripId, { rates: [{ deliveryId: trip.deliveryId, rate: 50 }] });
    await rateEntryService.lock(trip.tripId, { lockedBy: "tester" });

    await assert.rejects(
      () => shopSalesService.create({ tripId: trip.tripId, shopId: shop.id, birds: 10, weight: 20 }),
      (err: unknown) => err instanceof AppError && err.status === 422
    );
  });

  test("J. A delivery id belonging to a different trip cannot be rated as part of this trip's save", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));

    const shop = await makeShop(f, "phase-ab-wrongtrip-shop");
    const tripA = await makeCompletedTrip(f, {
      tripNo: `T-WRONGA-${uniqueInt()}`,
      shopId: shop.id,
      shopName: "phase-ab-wrongtrip-shop",
      birdTypeId: null,
      birdType: "",
      birds: 100,
      weight: 200,
    });
    const tripBId = await pool
      .query<{ id: number }>(
        `INSERT INTO trips (trip_no, trip_date, status, deleted) VALUES ($1, CURRENT_DATE, 'Completed', FALSE) RETURNING id`,
        [`T-WRONGB-${uniqueInt()}`]
      )
      .then((r) => r.rows[0].id);
    f.tripIds.push(tripBId);

    // tripA's delivery id supplied while saving rates for tripB â€” must be rejected.
    await assert.rejects(
      () => rateEntryService.save(tripBId, { rates: [{ deliveryId: tripA.deliveryId, rate: 50 }] }),
      (err: unknown) => err instanceof AppError && err.status === 422
    );
  });

  test("K. Duplicate Shop Sales create is rejected â€” no duplicate row created", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));

    const shop = await makeShop(f, "phase-ab-dup-shop");
    const trip = await makeCompletedTrip(f, {
      tripNo: `T-DUP-${uniqueInt()}`,
      shopId: null,
      shopName: "",
      birdTypeId: null,
      birdType: "",
      birds: 100,
      weight: 200,
    });
    await rateEntryService.save(trip.tripId, { rates: [{ deliveryId: trip.deliveryId, rate: 50 }] });
    await rateEntryService.lock(trip.tripId, { lockedBy: "tester" });

    const first = await shopSalesService.create({
      tripId: trip.tripId,
      shopId: shop.id,
      shopName: "phase-ab-dup-shop",
      birds: 30,
      weight: 60,
    });
    assert.ok(first.id > 0);

    await assertAppErrorStatus(
      shopSalesService.create({
        tripId: trip.tripId,
        shopId: shop.id,
        shopName: "phase-ab-dup-shop",
        birds: 30,
        weight: 60,
      }),
      409
    );

    const list = (await shopSalesService.list({ shopId: shop.id })) as ShopSale[];
    assert.equal(list.filter((s) => s.tripId === trip.tripId).length, 1, "exactly one sale, not two");
  });

  test("M/N/O. Locked amount/shop/trip reassignment via update() is rejected (409)", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));

    const shop = await makeShop(f, "phase-ab-immutable-shop");
    const otherShop = await makeShop(f, "phase-ab-other-shop");
    const trip = await makeCompletedTrip(f, {
      tripNo: `T-IMMUT-${uniqueInt()}`,
      shopId: shop.id,
      shopName: "phase-ab-immutable-shop",
      birdTypeId: null,
      birdType: "",
      birds: 100,
      weight: 200,
    });
    await rateEntryService.save(trip.tripId, { rates: [{ deliveryId: trip.deliveryId, rate: 45 }] });
    await rateEntryService.lock(trip.tripId, { lockedBy: "tester" });

    await assertAppErrorStatus(shopSalesService.update(trip.deliveryId, { amount: 99999 }), 409);
    await assertAppErrorStatus(shopSalesService.update(trip.deliveryId, { shopId: otherShop.id }), 409);
    await assertAppErrorStatus(shopSalesService.update(trip.deliveryId, { shopName: "renamed" }), 409);
    await assertAppErrorStatus(shopSalesService.update(trip.deliveryId, { tripId: trip.tripId }), 409);

    // Confirm nothing actually changed.
    const unchanged = await shopSalesService.getById(trip.deliveryId);
    assert.equal(unchanged.shopId, shop.id);
    assert.equal(unchanged.rate, 45);
  });

  test("P/Q. Invalid and negative rate are rejected on Rate Entry save", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const shop = await makeShop(f, "phase-ab-badrate-shop");
    const trip = await makeCompletedTrip(f, {
      tripNo: `T-BADRATE-${uniqueInt()}`,
      shopId: shop.id,
      shopName: "phase-ab-badrate-shop",
      birdTypeId: null,
      birdType: "",
      birds: 100,
      weight: 200,
    });

    await assert.rejects(
      () => rateEntryService.save(trip.tripId, { rates: [{ deliveryId: trip.deliveryId, rate: -10 }] }),
      (err: unknown) => err instanceof AppError && (err.status === 400 || err.status === 409)
    );
    await assert.rejects(
      () => rateEntryService.save(trip.tripId, { rates: [{ deliveryId: trip.deliveryId, rate: 0 }] }),
      (err: unknown) => err instanceof AppError && err.status === 400
    );
  });

  test("R/S. Invalid and negative weight are rejected on Shop Sales create", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const shop = await makeShop(f, "phase-ab-badweight-shop");
    const trip = await makeCompletedTrip(f, {
      tripNo: `T-BADWT-${uniqueInt()}`,
      shopId: null,
      shopName: "",
      birdTypeId: null,
      birdType: "",
      birds: 100,
      weight: 200,
    });
    await rateEntryService.save(trip.tripId, { rates: [{ deliveryId: trip.deliveryId, rate: 50 }] });
    await rateEntryService.lock(trip.tripId, { lockedBy: "tester" });

    await assert.rejects(
      () => shopSalesService.create({ tripId: trip.tripId, shopId: shop.id, birds: 10, weight: -5 }),
      (err: unknown) => err instanceof AppError && err.status === 400
    );
  });

  test("T. Client-supplied amount is ignored â€” server always recomputes weight x rate", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const shop = await makeShop(f, "phase-ab-amount-shop");
    const trip = await makeCompletedTrip(f, {
      tripNo: `T-AMT-${uniqueInt()}`,
      shopId: null,
      shopName: "",
      birdTypeId: null,
      birdType: "",
      birds: 100,
      weight: 200,
    });
    await rateEntryService.save(trip.tripId, { rates: [{ deliveryId: trip.deliveryId, rate: 50 }] });
    await rateEntryService.lock(trip.tripId, { lockedBy: "tester" });

    const sale = await shopSalesService.create({
      tripId: trip.tripId,
      shopId: shop.id,
      birds: 10,
      weight: 33.5,
      rate: 50,
      amount: 999999, // deliberately wrong â€” must be ignored
    } as never);
    assert.equal(sale.amount, Number((33.5 * 50).toFixed(2)));
  });

  test("U. Concurrent Rate Lock attempts on the same trip: exactly one succeeds", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const shop = await makeShop(f, "phase-ab-concurrent-lock-shop");
    const trip = await makeCompletedTrip(f, {
      tripNo: `T-CLOCK-${uniqueInt()}`,
      shopId: shop.id,
      shopName: "phase-ab-concurrent-lock-shop",
      birdTypeId: null,
      birdType: "",
      birds: 100,
      weight: 200,
    });
    await rateEntryService.save(trip.tripId, { rates: [{ deliveryId: trip.deliveryId, rate: 50 }] });

    const results = await Promise.allSettled([
      rateEntryService.lock(trip.tripId, { lockedBy: "userA" }),
      rateEntryService.lock(trip.tripId, { lockedBy: "userB" }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1, "exactly one concurrent lock should succeed");
    assert.equal(rejected.length, 1, "the other concurrent lock should be rejected");

    const finalState = await rateEntryService.getById(trip.tripId);
    assert.equal(finalState.rateLocked, true);
  });

  test("V. Concurrent identical Shop Sales creates: exactly one succeeds", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const shop = await makeShop(f, "phase-ab-concurrent-sale-shop");
    const trip = await makeCompletedTrip(f, {
      tripNo: `T-CSALE-${uniqueInt()}`,
      shopId: null,
      shopName: "",
      birdTypeId: null,
      birdType: "",
      birds: 100,
      weight: 200,
    });
    await rateEntryService.save(trip.tripId, { rates: [{ deliveryId: trip.deliveryId, rate: 50 }] });
    await rateEntryService.lock(trip.tripId, { lockedBy: "tester" });

    const payload = { tripId: trip.tripId, shopId: shop.id, birds: 15, weight: 25 };
    const results = await Promise.allSettled([
      shopSalesService.create(payload),
      shopSalesService.create(payload),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    assert.equal(fulfilled.length, 1, "exactly one of two concurrent identical creates should succeed");

    const list = (await shopSalesService.list({ shopId: shop.id })) as ShopSale[];
    assert.equal(
      list.filter((s) => s.tripId === trip.tripId && s.birds === 15 && s.weight === 25).length,
      1,
      "the unique index must prevent a duplicate row even under a real race"
    );
  });

  test("W/X. Shop Sales status-bypass attempt cannot change trip status or bypass the lock gate", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const shop = await makeShop(f, "phase-ab-bypass-shop");
    // An incomplete (Draft) trip that never submitted the wizard steps.
    const tripId = await pool
      .query<{ id: number }>(
        `INSERT INTO trips (trip_no, trip_date, status, deleted) VALUES ($1, CURRENT_DATE, 'Draft', FALSE) RETURNING id`,
        [`T-BYPASS-${uniqueInt()}`]
      )
      .then((r) => r.rows[0].id);
    f.tripIds.push(tripId);
    const deliveryId = await addDelivery(tripId, { shopId: shop.id, shopName: "phase-ab-bypass-shop", birds: 10, weight: 20 });

    // Attempting to force-approve via the Shop Sales status endpoint must
    // be rejected â€” it must NOT be able to flip the trip to Completed,
    // bypassing assertTripReadyForCompletion.
    await assertAppErrorStatus(shopSalesService.updateStatus(deliveryId, { status: "Approved" }), 409);
    await assertAppErrorStatus(shopSalesService.updateStatus(deliveryId, { status: "Pending Approval" }), 409);

    const tripRow = await pool.query<{ status: string }>(`SELECT status FROM trips WHERE id = $1`, [tripId]);
    assert.equal(tripRow.rows[0].status, "Draft", "trip status must be untouched by the bypass attempt");

    // Only "Deleted" is a legitimate Shop Sales status action, and even
    // that still goes through the same guards as softDelete() (Rate Entry
    // must be locked) â€” a Draft trip's delivery cannot be "deleted" this
    // way either, since assertTripCompletedForShopSales/assertRateEntryLocked
    // still apply.
    await assertAppErrorStatus(shopSalesService.updateStatus(deliveryId, { status: "Deleted" }), 409);
  });
});

describe("Collections cannot independently declare a trip rate-complete", () => {
  test("Y. Collections create/update/updateStatus all reject â€” no independent write path to rate state", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const trip = await makeCompletedTrip(f, {
      tripNo: `T-COLBYPASS-${uniqueInt()}`,
      shopId: null,
      shopName: "",
      birdTypeId: null,
      birdType: "",
      birds: 100,
      weight: 200,
    });

    await assertAppErrorStatus(
      collectionsService.create({ tripId: trip.tripId, amountDue: 1000, amountCollected: 1000 }),
      409
    );
    await assertAppErrorStatus(
      collectionsService.update(trip.deliveryId, { amountCollected: 1000 }),
      409
    );
    await assertAppErrorStatus(
      collectionsService.updateStatus(trip.deliveryId, { status: "Approved" }),
      409
    );

    // Confirm the trip's rate_completed truly never flipped via any of the above.
    const row = await pool.query<{ rate_completed: boolean; status: string }>(
      `SELECT rate_completed, status FROM trips WHERE id = $1`,
      [trip.tripId]
    );
    assert.equal(row.rows[0].rate_completed, false);
    assert.equal(row.rows[0].status, "Completed", "trip status must be untouched by the Collections bypass attempt");
  });
});
