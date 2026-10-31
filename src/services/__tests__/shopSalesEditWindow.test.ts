import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../config/db.js";
import { AppError } from "../../middleware/errorHandler.js";
import { rateEntryService } from "../rateEntryService.js";
import { shopSalesService } from "../shopSalesService.js";

/**
 * Shop Sales edit window: two weeks from trip_deliveries.created_at (insert),
 * not the trip date. Boundary is exclusive at 14 days:
 * `now < created_at + 14 days`. Soft-delete stays permanently blocked once
 * Rate Entry is locked.
 */

let uniqSeq = 0;
const uniqBase = (Date.now() % 1_000_000) * 1000 + Math.floor(Math.random() * 1000);
function uniqueInt(): number {
  return uniqBase + ++uniqSeq;
}

interface Fixture {
  tripIds: number[];
  shopIds: number[];
}
function newFixture(): Fixture {
  return { tripIds: [], shopIds: [] };
}
async function cleanup(f: Fixture): Promise<void> {
  if (f.tripIds.length) await pool.query(`DELETE FROM trips WHERE id = ANY($1::int[])`, [f.tripIds]);
  if (f.shopIds.length) await pool.query(`DELETE FROM shops WHERE id = ANY($1::int[])`, [f.shopIds]);
}
async function makeShop(f: Fixture): Promise<number> {
  const r = await pool.query<{ id: number }>(
    `INSERT INTO shops (shop_no, shop_name) VALUES ($1, $2) RETURNING id`,
    [uniqueInt(), `window-shop-${uniqueInt()}`]
  );
  f.shopIds.push(r.rows[0].id);
  return r.rows[0].id;
}

/** Creates a Completed, rate-locked trip+delivery whose insert timestamp
 * (`trip_deliveries.created_at`) is `now - ageOffsetMs`. */
async function makeAgedTrip(f: Fixture, ageOffsetMs: number): Promise<{ tripId: number; deliveryId: number }> {
  const shopId = await makeShop(f);
  const t = await pool.query<{ id: number }>(
    `INSERT INTO trips (trip_no, trip_date, status, deleted, approved_at, total_birds, dc_weight)
     VALUES ($1, CURRENT_DATE, 'Completed', FALSE, NOW(), 1000, 2000)
     RETURNING id`,
    [`T-WIN-${uniqueInt()}`]
  );
  const tripId = t.rows[0].id;
  f.tripIds.push(tripId);
  const d = await pool.query<{ id: number }>(
    `INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, birds, weight, rate)
     VALUES ($1, $2, $3, $4, $5, $6, NULL)
     RETURNING id`,
    [tripId, `SALE-${uniqueInt()}`, shopId, "window-shop", 50, 100]
  );
  const deliveryId = d.rows[0].id;
  await rateEntryService.save(tripId, { rates: [{ deliveryId, rate: 40 }] });
  await rateEntryService.lock(tripId, { lockedBy: "window-tester" });
  await pool.query(
    `UPDATE trip_deliveries SET created_at = NOW() - ($2 || ' milliseconds')::interval WHERE id = $1`,
    [deliveryId, String(ageOffsetMs)]
  );
  return { tripId, deliveryId };
}

const DAY = 24 * 60 * 60 * 1000;

async function assertStatus(promise: Promise<unknown>, status: number): Promise<void> {
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof AppError, `expected AppError, got: ${String(err)}`);
    assert.equal((err as AppError).status, status);
    return true;
  });
}

describe("2-week-from-insert EDIT window (direct API/service calls, not frontend visibility)", () => {
  test("1. Same-day edit: PASS", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await makeAgedTrip(f, 0);
    const updated = await shopSalesService.update(deliveryId, { birds: 51 });
    assert.equal(updated.birds, 51);
  });

  test("2. 1 day old: PASS", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await makeAgedTrip(f, 1 * DAY);
    const updated = await shopSalesService.update(deliveryId, { birds: 51 });
    assert.equal(updated.birds, 51);
  });

  test("3. 5 days old: PASS", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await makeAgedTrip(f, 5 * DAY);
    const updated = await shopSalesService.update(deliveryId, { birds: 51 });
    assert.equal(updated.birds, 51);
  });

  test("4. 9 days old: PASS", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await makeAgedTrip(f, 9 * DAY);
    const updated = await shopSalesService.update(deliveryId, { birds: 51 });
    assert.equal(updated.birds, 51);
  });

  test("5. 13 days old: still inside 2 weeks -> PASS", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await makeAgedTrip(f, 13 * DAY);
    const updated = await shopSalesService.update(deliveryId, { birds: 51 });
    assert.equal(updated.birds, 51);
  });

  test("6. Exactly 14 days old: window closed (now >= created_at+14d) -> FAIL", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await makeAgedTrip(f, 14 * DAY);
    await assertStatus(shopSalesService.update(deliveryId, { birds: 51 }), 409);
  });

  test("7. 15 days old: FAIL", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await makeAgedTrip(f, 15 * DAY);
    await assertStatus(shopSalesService.update(deliveryId, { birds: 51 }), 409);
  });

  test("8. 30 days old: FAIL", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await makeAgedTrip(f, 30 * DAY);
    await assertStatus(shopSalesService.update(deliveryId, { birds: 51 }), 409);
  });

  test("9. Future-dated trip (approved_at in the future): existing rule computes an even-later expiry -> still editable", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await makeAgedTrip(f, -5 * DAY); // approved 5 days in the future
    const updated = await shopSalesService.update(deliveryId, { birds: 51 });
    assert.equal(updated.birds, 51, "current rule does not reject a future-dated trip — documenting existing behavior as-is");
  });

  test("10. Trip date / rate lock older than 10 days does not lock a row inserted within 2 weeks", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { tripId, deliveryId } = await makeAgedTrip(f, 0);
    const thirteenDaysAgo = new Date(Date.now() - 13 * DAY).toISOString();
    await pool.query(
      `UPDATE trips SET trip_date = (CURRENT_DATE - INTERVAL '13 days'), approved_at = $2, rate_locked_at = $2 WHERE id = $1`,
      [tripId, thirteenDaysAgo]
    );
    const updated = await shopSalesService.update(deliveryId, { birds: 51 });
    assert.equal(updated.birds, 51, "Shop Sales must use insert date, not trip date or rate_locked_at");
  });

  test("11. Direct API-level call (service function, bypassing any notion of a frontend) after the window closes: FAIL", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await makeAgedTrip(f, 20 * DAY);
    // No frontend involved anywhere in this test file — this *is* the
    // direct-API-call case; asserting again explicitly for the record.
    await assertStatus(shopSalesService.update(deliveryId, { weight: 999 }), 409);
  });
});

describe("Shop Sales DELETE stays blocked once Rate Entry is locked", () => {
  test("1. Same-day delete: FAIL", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await makeAgedTrip(f, 0);
    await assertStatus(shopSalesService.softDelete(deliveryId, "test"), 409);
  });

  test("2. Inside the 2-week edit window: FAIL", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await makeAgedTrip(f, 5 * DAY);
    await assertStatus(shopSalesService.softDelete(deliveryId, "test"), 409);
  });

  test("3. After the 2-week window: FAIL, and the row is NOT soft-deleted", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await makeAgedTrip(f, 20 * DAY);
    await assertStatus(shopSalesService.softDelete(deliveryId, "test"), 409);
    const row = await pool.query<{ deleted: boolean }>(`SELECT deleted FROM trip_deliveries WHERE id = $1`, [deliveryId]);
    assert.equal(row.rows[0].deleted, false, "a rejected delete must not have partially applied");
  });
});

after(async () => {
  await pool.end();
});
