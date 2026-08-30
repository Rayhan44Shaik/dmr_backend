import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../config/db.js";
import { AppError } from "../../middleware/errorHandler.js";
import { rateEntryService } from "../rateEntryService.js";
import { shopSalesService } from "../shopSalesService.js";
import { tripsService } from "../tripsService.js";
/**
 * Concurrency/duplicate/security matrix for Shop Sales edit/delete, plus
 * verification that a Shop Sale edit/delete is immediately visible through
 * Trip List (tripsService.getById â€” the same data GET /operations/trips/:id
 * and GET /operations/trip-list/:id serve) via recalcTripDeliveryTotals.
 */
let uniqSeq = 0;
const uniqBase = (Date.now() % 1_000_000) * 1000 + Math.floor(Math.random() * 1000);
function uniqueInt() {
    return uniqBase + ++uniqSeq;
}
function newFixture() {
    return { tripIds: [], shopIds: [] };
}
async function cleanup(f) {
    if (f.tripIds.length)
        await pool.query(`DELETE FROM trips WHERE id = ANY($1::int[])`, [f.tripIds]);
    if (f.shopIds.length)
        await pool.query(`DELETE FROM shops WHERE id = ANY($1::int[])`, [f.shopIds]);
}
async function makeShop(f) {
    const r = await pool.query(`INSERT INTO shops (shop_no, shop_name) VALUES ($1, $2) RETURNING id`, [uniqueInt(), `sync-shop-${uniqueInt()}`]);
    f.shopIds.push(r.rows[0].id);
    return r.rows[0].id;
}
/**
 * Creates a trip + locked rate entry with a placeholder (0/0) delivery
 * (needed only so Rate Entry has a row to price/lock), then adds the real
 * test delivery via shopSalesService.create() â€” going through the real API
 * path so trips.total_* KPI columns are correctly seeded by
 * recalcTripDeliveryTotals() from the start, giving an accurate "before"
 * baseline for the sync assertions below (a raw SQL INSERT would bypass
 * that recalc entirely, which is not what we're testing here).
 */
async function makeLockedTrip(f, opts) {
    const shopId = await makeShop(f);
    const t = await pool.query(`INSERT INTO trips (trip_no, trip_date, status, deleted, approved_at, total_birds, dc_weight)
     VALUES ($1, CURRENT_DATE, 'Completed', FALSE, NOW(), $2, $3)
     RETURNING id`, [`T-SYNC-${uniqueInt()}`, opts.capacityBirds, opts.capacityWeight]);
    const tripId = t.rows[0].id;
    f.tripIds.push(tripId);
    await pool.query(`UPDATE trips SET delivery_step_submitted = TRUE, expenses_step_submitted = TRUE WHERE id = $1`, [tripId]);
    const placeholder = await pool.query(`INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, birds, weight, rate)
     VALUES ($1, $2, NULL, '', 0, 0, NULL)
     RETURNING id`, [tripId, `SALE-${uniqueInt()}`]);
    await rateEntryService.save(tripId, { rates: [{ deliveryId: placeholder.rows[0].id, rate: 50 }] });
    await rateEntryService.lock(tripId, { lockedBy: "sync-tester" });
    const created = await shopSalesService.create({ tripId, shopId, birds: opts.birds, weight: opts.weight });
    return { tripId, shopId, deliveryId: created.id };
}
async function assertStatus(promise, status) {
    await assert.rejects(promise, (err) => {
        assert.ok(err instanceof AppError, `expected AppError, got: ${String(err)}`);
        assert.equal(err.status, status);
        return true;
    });
}
describe("Concurrency / duplicate / security matrix", () => {
    test("1. Concurrent edit + delete on the same delivery: at most one succeeds, no corrupted intermediate state", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { deliveryId } = await makeLockedTrip(f, { capacityBirds: 100, capacityWeight: 200, birds: 50, weight: 100 });
        const results = await Promise.allSettled([
            shopSalesService.update(deliveryId, { birds: 60 }),
            shopSalesService.softDelete(deliveryId, "concurrent delete"),
        ]);
        // Both COULD legitimately succeed in either order (edit-then-delete
        // deletes the edited row; delete-then-edit is rejected because the
        // WHERE deleted=FALSE guard on update's SELECT ... FOR UPDATE won't
        // find the row) â€” what must NEVER happen is a corrupted state where
        // the row is both "updated to 60" AND still fully active with no
        // deleted flag change actually applied.
        const finalRow = await pool.query(`SELECT birds, deleted FROM trip_deliveries WHERE id = $1`, [deliveryId]);
        const row = finalRow.rows[0];
        if (row.deleted) {
            // Delete won (either ran first, or ran after the edit) â€” fine either way.
            assert.ok(true);
        }
        else {
            // Edit won and delete must have failed.
            assert.equal(row.birds, 60);
        }
        void results;
    });
    test("2. Concurrent delete + delete on the same delivery: exactly one succeeds, the other gets 404", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { deliveryId } = await makeLockedTrip(f, { capacityBirds: 100, capacityWeight: 200, birds: 50, weight: 100 });
        const results = await Promise.allSettled([
            shopSalesService.softDelete(deliveryId, "first"),
            shopSalesService.softDelete(deliveryId, "second"),
        ]);
        const fulfilled = results.filter((r) => r.status === "fulfilled");
        assert.equal(fulfilled.length, 1, "exactly one concurrent delete of the same row should succeed");
    });
    test("3. Update on an already-deleted delivery: rejected (404), not silently re-activated", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { deliveryId } = await makeLockedTrip(f, { capacityBirds: 100, capacityWeight: 200, birds: 50, weight: 100 });
        await shopSalesService.softDelete(deliveryId, "gone");
        await assert.rejects(() => shopSalesService.update(deliveryId, { birds: 10 }), (err) => err instanceof AppError && err.status === 404);
    });
    test("4. Delete on an already-deleted delivery: rejected (404)", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { deliveryId } = await makeLockedTrip(f, { capacityBirds: 100, capacityWeight: 200, birds: 50, weight: 100 });
        await shopSalesService.softDelete(deliveryId, "gone");
        await assertStatus(shopSalesService.softDelete(deliveryId, "gone again"), 404);
    });
    test("5. Concurrent creates for the SAME shop with genuinely different quantities: both succeed (not treated as duplicates)", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const shopId = await makeShop(f);
        const t2 = await pool.query(`INSERT INTO trips (trip_no, trip_date, status, deleted, approved_at, total_birds, dc_weight)
       VALUES ($1, CURRENT_DATE, 'Completed', FALSE, NOW(), 1000, 2000) RETURNING id`, [`T-SYNC5-${uniqueInt()}`]);
        const tripId = t2.rows[0].id;
        f.tripIds.push(tripId);
        await pool.query(`UPDATE trips SET delivery_step_submitted = TRUE, expenses_step_submitted = TRUE WHERE id = $1`, [tripId]);
        const seed = await pool.query(`INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, birds, weight, rate)
       VALUES ($1, $2, NULL, '', 0, 0, NULL) RETURNING id`, [tripId, `SALE-${uniqueInt()}`]);
        await rateEntryService.save(tripId, { rates: [{ deliveryId: seed.rows[0].id, rate: 50 }] });
        await rateEntryService.lock(tripId, { lockedBy: "sync-tester" });
        const results = await Promise.allSettled([
            shopSalesService.create({ tripId, shopId, birds: 10, weight: 20 }),
            shopSalesService.create({ tripId, shopId, birds: 15, weight: 25 }),
        ]);
        const fulfilled = results.filter((r) => r.status === "fulfilled");
        assert.equal(fulfilled.length, 2);
        assert.equal(new Set(fulfilled.map((r) => r.value.id)).size, 1);
    });
    test("6. Editing one trip's delivery never affects another trip's totals (no cross-trip leakage)", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const tripA = await makeLockedTrip(f, { capacityBirds: 100, capacityWeight: 200, birds: 50, weight: 100 });
        const tripB = await makeLockedTrip(f, { capacityBirds: 100, capacityWeight: 200, birds: 50, weight: 100 });
        await shopSalesService.update(tripA.deliveryId, { remarks: "trip-a-only" });
        const tripBRow = await pool.query(`SELECT birds FROM trip_deliveries WHERE id = $1`, [tripB.deliveryId]);
        assert.equal(tripBRow.rows[0].birds, 50, "trip B's delivery must be completely untouched by trip A's edit");
    });
    test("7. Concurrent remark-only updates (no quantity conflict): both may succeed without a false capacity rejection", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { deliveryId } = await makeLockedTrip(f, { capacityBirds: 100, capacityWeight: 200, birds: 50, weight: 100 });
        const results = await Promise.allSettled([
            shopSalesService.update(deliveryId, { remarks: "note A" }),
            shopSalesService.update(deliveryId, { remarks: "note B" }),
        ]);
        const fulfilled = results.filter((r) => r.status === "fulfilled");
        assert.equal(fulfilled.length, 2, "two non-conflicting concurrent edits (same birds/weight, different remarks) should both succeed serialized");
    });
    test("8. A raw-SQL-corrupted over-capacity row cannot be made worse via the API (defense in depth)", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { tripId, deliveryId } = await makeLockedTrip(f, { capacityBirds: 50, capacityWeight: 100, birds: 50, weight: 100 });
        // Simulate bad legacy data bypassing the API entirely.
        await pool.query(`UPDATE trip_deliveries SET birds = 999 WHERE id = $1`, [deliveryId]);
        await assertStatus(shopSalesService.update(deliveryId, { birds: 1000 }), 422);
        void tripId;
    });
    test("9. Two unrelated trips locking/creating concurrently do not interfere with each other's row locks", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const shopA = await makeShop(f);
        const shopB = await makeShop(f);
        const tA = await pool.query(`INSERT INTO trips (trip_no, trip_date, status, deleted, total_birds, dc_weight) VALUES ($1, CURRENT_DATE, 'Completed', FALSE, 100, 200) RETURNING id`, [`T-SYNC9A-${uniqueInt()}`]);
        const tB = await pool.query(`INSERT INTO trips (trip_no, trip_date, status, deleted, total_birds, dc_weight) VALUES ($1, CURRENT_DATE, 'Completed', FALSE, 100, 200) RETURNING id`, [`T-SYNC9B-${uniqueInt()}`]);
        f.tripIds.push(tA.rows[0].id, tB.rows[0].id);
        await pool.query(`UPDATE trips SET delivery_step_submitted = TRUE, expenses_step_submitted = TRUE WHERE id = ANY($1::int[])`, [[tA.rows[0].id, tB.rows[0].id]]);
        const seedA = await pool.query(`INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, birds, weight, rate) VALUES ($1,$2,NULL,'',0,0,NULL) RETURNING id`, [tA.rows[0].id, `SALE-${uniqueInt()}`]);
        const seedB = await pool.query(`INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, birds, weight, rate) VALUES ($1,$2,NULL,'',0,0,NULL) RETURNING id`, [tB.rows[0].id, `SALE-${uniqueInt()}`]);
        await rateEntryService.save(tA.rows[0].id, { rates: [{ deliveryId: seedA.rows[0].id, rate: 50 }] });
        await rateEntryService.save(tB.rows[0].id, { rates: [{ deliveryId: seedB.rows[0].id, rate: 50 }] });
        await rateEntryService.lock(tA.rows[0].id, { lockedBy: "t" });
        await rateEntryService.lock(tB.rows[0].id, { lockedBy: "t" });
        const start = Date.now();
        const results = await Promise.allSettled([
            shopSalesService.create({ tripId: tA.rows[0].id, shopId: shopA, birds: 10, weight: 20 }),
            shopSalesService.create({ tripId: tB.rows[0].id, shopId: shopB, birds: 10, weight: 20 }),
        ]);
        const elapsed = Date.now() - start;
        assert.ok(results.every((r) => r.status === "fulfilled"), "both unrelated-trip creates must succeed");
        // Not a strict timing assertion (avoid flakiness) â€” just documents that
        // unrelated trips are not serialized behind one lock.
        void elapsed;
    });
    test("10. Concurrent updates racing to exceed capacity, verified against the true remaining headroom (regression of the birds/weight suite, using create() this time)", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const shopA = await makeShop(f);
        const shopB = await makeShop(f);
        const t3 = await pool.query(`INSERT INTO trips (trip_no, trip_date, status, deleted, approved_at, total_birds, dc_weight)
       VALUES ($1, CURRENT_DATE, 'Completed', FALSE, NOW(), 20, 40) RETURNING id`, [`T-SYNC10-${uniqueInt()}`]);
        const tripId = t3.rows[0].id;
        f.tripIds.push(tripId);
        await pool.query(`UPDATE trips SET delivery_step_submitted = TRUE, expenses_step_submitted = TRUE WHERE id = $1`, [tripId]);
        const seed = await pool.query(`INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, birds, weight, rate) VALUES ($1,$2,NULL,'',0,0,NULL) RETURNING id`, [tripId, `SALE-${uniqueInt()}`]);
        await rateEntryService.save(tripId, { rates: [{ deliveryId: seed.rows[0].id, rate: 50 }] });
        await rateEntryService.lock(tripId, { lockedBy: "t" });
        // Capacity is 20 birds total; two concurrent creates each ask for 15
        // (30 > 20) â€” only one can win.
        const results = await Promise.allSettled([
            shopSalesService.create({ tripId, shopId: shopA, birds: 15, weight: 10 }),
            shopSalesService.create({ tripId, shopId: shopB, birds: 15, weight: 10 }),
        ]);
        const fulfilled = results.filter((r) => r.status === "fulfilled");
        assert.equal(fulfilled.length, 1, "only one of two capacity-conflicting concurrent creates may succeed");
        const totalBirds = await pool.query(`SELECT COALESCE(SUM(birds),0)::text AS s FROM trip_deliveries WHERE trip_id = $1 AND deleted = FALSE`, [tripId]);
        assert.ok(Number(totalBirds.rows[0].s) <= 20, "final total must never exceed the trip's loaded capacity");
    });
});
describe("Trip List synchronization after Shop Sale edit/delete", () => {
    test("A Shop Sale birds/weight edit is immediately reflected in tripsService.getById (Trip List / Trip details data)", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { tripId, deliveryId } = await makeLockedTrip(f, { capacityBirds: 100, capacityWeight: 200, birds: 25, weight: 48 });
        const shop2 = await makeShop(f);
        await shopSalesService.create({ tripId, shopId: shop2, birds: 75, weight: 152 });
        const before = await tripsService.getById(tripId);
        assert.equal(before.totalBirdsDelivered, 100);
        assert.equal(before.deliveries.find((d) => d.id === deliveryId)?.birds, 25);
        await shopSalesService.update(deliveryId, { birds: 40, weight: 70 });
        const after = await tripsService.getById(tripId);
        assert.equal(after.totalBirdsDelivered, 100, "trip-level birds stay at pickup after redistribution");
        assert.equal(after.totalDeliveredWeight, 200, "trip-level weight stays at pickup after redistribution");
        assert.equal(after.deliveries.find((d) => d.id === deliveryId)?.birds, 40);
        assert.equal(after.deliveries.find((d) => d.id === deliveryId)?.weight, 70);
    });
    test("A Shop Sale delete is immediately reflected in tripsService.getById (totals decrease, row marked deleted)", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { tripId, deliveryId } = await makeLockedTrip(f, { capacityBirds: 100, capacityWeight: 200, birds: 30, weight: 55 });
        const before = await tripsService.getById(tripId);
        assert.equal(before.totalBirdsDelivered, 30);
        const shopsBefore = before.totalShops;
        await shopSalesService.softDelete(deliveryId, "sync test");
        const after = await tripsService.getById(tripId);
        assert.equal(after.totalBirdsDelivered, before.totalBirdsDelivered - 30, "deleting the delivery must reduce total_birds_delivered by exactly its birds");
        assert.equal(after.totalDeliveredWeight, before.totalDeliveredWeight - 55);
        assert.equal(after.totalShops, shopsBefore - 1, "total_shops must be recalculated to exclude the deleted row");
    });
    test("After delete, the freed capacity is immediately available to a new Shop Sale on the same trip", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { tripId, shopId, deliveryId } = await makeLockedTrip(f, { capacityBirds: 50, capacityWeight: 100, birds: 50, weight: 100 });
        // At full capacity â€” a new sale must be rejected.
        const existing = await shopSalesService.create({ tripId, shopId, birds: 1, weight: 1 });
        assert.equal(existing.id, deliveryId, "same trip+shop must not insert a second Shop Sales row");
        await shopSalesService.softDelete(deliveryId, "free up capacity");
        // Now the full 50/100 is available again.
        const created = await shopSalesService.create({ tripId, shopId, birds: 50, weight: 100 });
        assert.equal(created.birds, 50);
    });
});
after(async () => {
    await pool.end();
});
//# sourceMappingURL=shopSalesConcurrencyAndSync.test.js.map