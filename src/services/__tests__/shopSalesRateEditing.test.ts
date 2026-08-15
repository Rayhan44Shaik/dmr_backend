import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../config/db.js";
import { AppError } from "../../middleware/errorHandler.js";
import { rateEntryService } from "../rateEntryService.js";
import { shopSalesService } from "../shopSalesService.js";
import { tripsService } from "../tripsService.js";

/**
 * BUSINESS RULE CORRECTION: Rate Entry LOCKED does not make the Shop Sale's
 * rate immutable — it only moves the trip from Rate Entry into Shop Sales.
 * Within the 10-day Shop Sales edit window, birds/weight/rate may all be
 * corrected, rate subject to the same ₹50–₹300 range Rate Entry's own UI
 * has always used. After the window closes, everything (including rate)
 * is rejected by the same assertTripEditable gate that already protects
 * birds/weight/delete — there is no separate "Shop Sales locked" state to
 * invent; the existing 10-day window IS that state.
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
    [uniqueInt(), `rate-edit-shop-${uniqueInt()}`]
  );
  f.shopIds.push(r.rows[0].id);
  return r.rows[0].id;
}

const DAY = 24 * 60 * 60 * 1000;

/** Locked, Completed trip + one delivery, approved `ageOffsetMs` ago
 * (default: today). Initial rate ₹90, generous capacity so birds/weight
 * edits in the rate-focused tests never accidentally hit the capacity gate. */
async function makeRateEditableTrip(
  f: Fixture,
  opts: { ageOffsetMs?: number; birds?: number; weight?: number; initialRate?: number } = {}
): Promise<{ tripId: number; shopId: number; deliveryId: number }> {
  const shopId = await makeShop(f);
  const t = await pool.query<{ id: number }>(
    `INSERT INTO trips (trip_no, trip_date, status, deleted, approved_at, total_birds, dc_weight)
     VALUES ($1, CURRENT_DATE, 'Completed', FALSE, NOW() - ($2 || ' milliseconds')::interval, 1000, 2000)
     RETURNING id`,
    [`T-RATEEDIT-${uniqueInt()}`, String(opts.ageOffsetMs ?? 0)]
  );
  const tripId = t.rows[0].id;
  f.tripIds.push(tripId);
  const d = await pool.query<{ id: number }>(
    `INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, birds, weight, rate)
     VALUES ($1, $2, $3, $4, $5, $6, NULL)
     RETURNING id`,
    [tripId, `SALE-${uniqueInt()}`, shopId, "rate-edit-shop", opts.birds ?? 25, opts.weight ?? 48]
  );
  const deliveryId = d.rows[0].id;
  const rate = opts.initialRate ?? 90;
  await rateEntryService.save(tripId, { rates: [{ deliveryId, rate }] });
  await rateEntryService.lock(tripId, { lockedBy: "rate-edit-tester" });
  return { tripId, shopId, deliveryId };
}

async function assertStatus(promise: Promise<unknown>, status: number): Promise<void> {
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof AppError, `expected AppError, got: ${String(err)}`);
    assert.equal((err as AppError).status, status);
    return true;
  });
}

describe("Shop Sales rate editing (corrected rule): locked + within 10 days + ₹50-300 => allowed", () => {
  test("1. ₹90 -> ₹100 within window: PASS", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await makeRateEditableTrip(f);
    const updated = await shopSalesService.update(deliveryId, { rate: 100 });
    assert.equal(updated.rate, 100);
  });

  test("2. ₹90 -> ₹110 within window: PASS", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await makeRateEditableTrip(f);
    const updated = await shopSalesService.update(deliveryId, { rate: 110 });
    assert.equal(updated.rate, 110);
  });

  test("3. -> ₹50 (lower boundary, inclusive): PASS", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await makeRateEditableTrip(f, { initialRate: 100 });
    const updated = await shopSalesService.update(deliveryId, { rate: 50 });
    assert.equal(updated.rate, 50);
  });

  test("4. -> ₹300 (upper boundary, inclusive): PASS", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await makeRateEditableTrip(f, { initialRate: 100 });
    const updated = await shopSalesService.update(deliveryId, { rate: 300 });
    assert.equal(updated.rate, 300);
  });

  test("5. -> ₹49 (1 below lower boundary): FAIL 400", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await makeRateEditableTrip(f, { initialRate: 50 });
    await assertStatus(shopSalesService.update(deliveryId, { rate: 49 }), 400);
    const unchanged = await shopSalesService.getById(deliveryId);
    assert.equal(unchanged.rate, 50, "rejected edit must not partially apply");
  });

  test("6. -> ₹301 (1 above upper boundary): FAIL 400", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await makeRateEditableTrip(f, { initialRate: 300 });
    await assertStatus(shopSalesService.update(deliveryId, { rate: 301 }), 400);
  });

  test("7. -> ₹0: FAIL 400", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await makeRateEditableTrip(f);
    await assertStatus(shopSalesService.update(deliveryId, { rate: 0 }), 400);
  });

  test("8. -> negative: FAIL 400", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await makeRateEditableTrip(f);
    await assertStatus(shopSalesService.update(deliveryId, { rate: -10 } as never), 400);
  });

  test("9. Rate change after the 10-day window: FAIL (409, same gate as birds/weight/delete)", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await makeRateEditableTrip(f, { ageOffsetMs: 11 * DAY });
    await assertStatus(shopSalesService.update(deliveryId, { rate: 100 }), 409);
  });

  test("10. Direct API-level rate change after 10 days: FAIL, and the row is untouched", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await makeRateEditableTrip(f, { ageOffsetMs: 15 * DAY });
    await assertStatus(shopSalesService.update(deliveryId, { rate: 200 }), 409);
    const row = await pool.query<{ rate: string }>(`SELECT rate FROM trip_deliveries WHERE id = $1`, [deliveryId]);
    assert.equal(Number(row.rows[0].rate), 90);
  });

  test("11. Rate change updates the authoritative Trip Delivery / Trip List immediately", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { tripId, deliveryId } = await makeRateEditableTrip(f);
    await shopSalesService.update(deliveryId, { rate: 110 });

    const trip = await tripsService.getById(tripId);
    const delivery = trip.deliveries.find((d) => d.id === deliveryId);
    assert.equal(delivery?.rate, 110, "Trip List/Trip Delivery must show the new rate — never a stale ₹90");
  });

  test("12. Rate change recalculates amount = weight x new rate", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await makeRateEditableTrip(f, { weight: 50 });
    const updated = await shopSalesService.update(deliveryId, { rate: 110 });
    assert.equal(updated.amount, Number((50 * 110).toFixed(2)), "50 x 110 = 5500");
  });

  test("13. Rate change persists (re-read from PostgreSQL, not just the in-memory response)", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await makeRateEditableTrip(f);
    await shopSalesService.update(deliveryId, { rate: 120 });
    // Simulate "refresh the browser" — a completely fresh read.
    const reread = await shopSalesService.getById(deliveryId);
    assert.equal(reread.rate, 120);
  });

  test("14. Concurrent rate edits to the same delivery do not corrupt the final value", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await makeRateEditableTrip(f);

    const results = await Promise.allSettled([
      shopSalesService.update(deliveryId, { rate: 100 }),
      shopSalesService.update(deliveryId, { rate: 150 }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    // Both requests are individually valid (in-range, within window) — the
    // trip-row FOR UPDATE lock serializes them, so both may legitimately
    // succeed in sequence (last-write-wins), but the row must end up at
    // EXACTLY one of the two attempted values, never a corrupted mix.
    assert.ok(fulfilled.length >= 1, "at least one concurrent rate edit must succeed");
    const finalRow = await pool.query<{ rate: string; amount: string }>(
      `SELECT rate, amount FROM trip_deliveries WHERE id = $1`,
      [deliveryId]
    );
    const finalRate = Number(finalRow.rows[0].rate);
    assert.ok(
      finalRate === 100 || finalRate === 150,
      `final rate (${finalRate}) must be exactly one of the two attempted values, not a corrupted mix`
    );
    // amount must always match weight x whatever the final rate actually is.
    const weightRow = await pool.query<{ weight: string }>(`SELECT weight FROM trip_deliveries WHERE id = $1`, [deliveryId]);
    assert.equal(Number(finalRow.rows[0].amount), Number((Number(weightRow.rows[0].weight) * finalRate).toFixed(2)));
  });

  test("15. Rate change does not bypass birds/weight capacity validation in the same request", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    // Loaded capacity 50 birds; delivery already at 50.
    const { deliveryId } = await makeRateEditableTrip(f, { birds: 50 });
    await pool.query(`UPDATE trips SET total_birds = 50 WHERE id = (SELECT trip_id FROM trip_deliveries WHERE id = $1)`, [deliveryId]);
    // A rate-only-labelled request that also sneaks in an over-capacity
    // birds value must still be rejected on the birds check.
    await assertStatus(shopSalesService.update(deliveryId, { rate: 100, birds: 999 }), 422);
  });
});

describe("Combined field edits within the 10-day window", () => {
  async function fixture(f: Fixture) {
    return makeRateEditableTrip(f, { birds: 25, weight: 48, initialRate: 90 });
  }

  test("Birds only", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await fixture(f);
    const updated = await shopSalesService.update(deliveryId, { birds: 30 });
    assert.equal(updated.birds, 30);
    assert.equal(updated.weight, 48);
    assert.equal(updated.rate, 90);
  });

  test("Weight only", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await fixture(f);
    const updated = await shopSalesService.update(deliveryId, { weight: 55 });
    assert.equal(updated.birds, 25);
    assert.equal(updated.weight, 55);
    assert.equal(updated.rate, 90);
    assert.equal(updated.amount, Number((55 * 90).toFixed(2)));
  });

  test("Rate only", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await fixture(f);
    const updated = await shopSalesService.update(deliveryId, { rate: 120 });
    assert.equal(updated.birds, 25);
    assert.equal(updated.weight, 48);
    assert.equal(updated.rate, 120);
    assert.equal(updated.amount, Number((48 * 120).toFixed(2)));
  });

  test("Birds + weight", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await fixture(f);
    const updated = await shopSalesService.update(deliveryId, { birds: 28, weight: 52 });
    assert.equal(updated.birds, 28);
    assert.equal(updated.weight, 52);
    assert.equal(updated.rate, 90);
  });

  test("Birds + rate", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await fixture(f);
    const updated = await shopSalesService.update(deliveryId, { birds: 27, rate: 95 });
    assert.equal(updated.birds, 27);
    assert.equal(updated.rate, 95);
    assert.equal(updated.amount, Number((48 * 95).toFixed(2)));
  });

  test("Weight + rate", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await fixture(f);
    const updated = await shopSalesService.update(deliveryId, { weight: 60, rate: 105 });
    assert.equal(updated.weight, 60);
    assert.equal(updated.rate, 105);
    assert.equal(updated.amount, Number((60 * 105).toFixed(2)));
  });

  test("Birds + weight + rate, and every change syncs to Trip List in one transaction", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { tripId, deliveryId } = await fixture(f);
    const updated = await shopSalesService.update(deliveryId, { birds: 33, weight: 61, rate: 115 });
    assert.equal(updated.birds, 33);
    assert.equal(updated.weight, 61);
    assert.equal(updated.rate, 115);
    assert.equal(updated.amount, Number((61 * 115).toFixed(2)));

    const trip = await tripsService.getById(tripId);
    const delivery = trip.deliveries.find((d) => d.id === deliveryId);
    assert.equal(delivery?.birds, 33);
    assert.equal(delivery?.weight, 61);
    assert.equal(delivery?.rate, 115);
    assert.equal(trip.totalBirdsDelivered, 33);
    assert.equal(trip.totalDeliveredWeight, 61);
  });

  test("An invalid combined edit (bad rate) rolls back the WHOLE request — birds/weight are not partially applied", async (t) => {
    const f = newFixture();
    t.after(() => cleanup(f));
    const { deliveryId } = await fixture(f);
    await assertStatus(shopSalesService.update(deliveryId, { birds: 26, weight: 49, rate: 999 }), 400);
    const row = await shopSalesService.getById(deliveryId);
    assert.equal(row.birds, 25, "birds must be unchanged — no partial apply");
    assert.equal(row.weight, 48, "weight must be unchanged — no partial apply");
    assert.equal(row.rate, 90, "rate must be unchanged — no partial apply");
  });
});
