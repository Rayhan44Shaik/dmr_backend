import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../config/db.js";
import { AppError } from "../../middleware/errorHandler.js";
import { shopSalesService } from "../shopSalesService.js";
import { rateEntryService } from "../rateEntryService.js";
/**
 * Integration tests against the real PostgreSQL database (the backend has no
 * separate test harness — these run with the project's `tsx` + Node's
 * built-in `node:test` runner, e.g. `npx tsx --test src/services/__tests__/shopSalesService.test.ts`).
 *
 * Required business flow under test:
 *   Trip Completed → Rate Entry → Enter rate → Save & Lock → Shop Sales.
 * A trip being Completed alone must NOT surface its deliveries in Shop Sales;
 * they become visible only once the trip's rate_entry row exists (the
 * existing authoritative "saved & locked" state — no new field invented).
 */
const used = new Map();
let uniqSeq = 0;
const uniqBase = (Date.now() % 1_000_000) * 1000 + Math.floor(Math.random() * 1000);
function uniqueInt() {
    // shop_no / bird_type_no are INTEGER (32-bit) columns — stay safely below
    // 2^31 and unique within this run.
    let v = uniqBase + ++uniqSeq;
    while (used.has(v))
        v = uniqBase + ++uniqSeq;
    used.set(v, 1);
    return v;
}
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
function newFixture() {
    return { tripIds: [], shopIds: [], birdTypeIds: [] };
}
async function cleanup(f) {
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
async function makeShop(f, name) {
    const r = await pool.query(`INSERT INTO shops (shop_no, shop_name) VALUES ($1, $2) RETURNING id`, [uniqueInt(), name]);
    f.shopIds.push(r.rows[0].id);
    return r.rows[0];
}
async function makeBirdType(f, name) {
    const r = await pool.query(`INSERT INTO bird_types (bird_type_no, bird_type) VALUES ($1, $2) RETURNING id`, [uniqueInt(), name]);
    f.birdTypeIds.push(r.rows[0].id);
    return r.rows[0];
}
/**
 * Creates a Completed trip (approved now, within the 10-day edit window) with
 * one delivery. Capacity is generously sized so later Shop Sales creates stay
 * within bounds.
 */
async function makeCompletedTrip(f, opts) {
    const t = await pool.query(`INSERT INTO trips (trip_no, trip_date, status, approved_at, deleted, total_birds, dc_weight)
     VALUES ($1, CURRENT_DATE, 'Completed', NOW(), FALSE, 1000, 2000)
     RETURNING id`, [opts.tripNo]);
    const tripId = t.rows[0].id;
    f.tripIds.push(tripId);
    const d = await pool.query(`INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, bird_type_id, bird_type, birds, weight, rate)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)
     RETURNING id`, [
        tripId,
        `${opts.tripNo}-S01`,
        opts.shopId,
        opts.shopName,
        opts.birdTypeId,
        opts.birdType,
        opts.birds,
        opts.weight,
    ]);
    return { tripId, tripNo: opts.tripNo, deliveryId: d.rows[0].id };
}
async function assertAppErrorStatus(promise, status) {
    await assert.rejects(promise, (err) => {
        assert.ok(err instanceof AppError, `expected AppError, got: ${String(err)}`);
        assert.equal(err.status, status);
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
        // Authoritative pre-lock state: no rate_entry row exists for the trip.
        assert.equal(await rateEntryService.getByTripId(trip.tripId), null);
        const list = (await shopSalesService.list({ shopId: shop.id }));
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
        const saved = await rateEntryService.create({
            tripId: trip.tripId,
            rate: 62.5,
            remarks: "locked",
            deliveries: [{ id: trip.deliveryId, rate: 62.5 }],
        });
        assert.equal(saved.tripId, trip.tripId);
        assert.equal(saved.rate, 62.5);
        assert.equal(saved.locked, false, "saving alone must not lock the trip");
        const locked = await rateEntryService.lock(trip.tripId, { lockedBy: "tester" });
        assert.equal(locked.locked, true);
        const list = (await shopSalesService.list({ shopId: shop.id }));
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
        await rateEntryService.create({
            tripId: trip.tripId,
            rate: 55.5,
            deliveries: [{ id: trip.deliveryId, rate: 55.5 }],
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
        const updated = await shopSalesService.update(created.id, {
            birds: 25,
            weight: 50,
            rate: 60,
        });
        assert.equal(updated.birds, 25);
        assert.equal(updated.weight, 50);
        assert.equal(updated.rate, 60);
        assert.equal(updated.amount, Number((50 * 60).toFixed(2)));
        const removed = await shopSalesService.softDelete(created.id, "test cleanup");
        assert.equal(removed.deleted, true);
        const list = (await shopSalesService.list({ shopId: shop.id }));
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
        await assertAppErrorStatus(shopSalesService.create({
            tripId: trip.tripId,
            shopId: shop.id,
            shopName: "enforce-shop",
            birds: 10,
            weight: 20,
        }), 409);
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
        // No rate entry yet → getByTripId reports null (Pending).
        assert.equal(await rateEntryService.getByTripId(trip.tripId), null);
        // Save (including the shop-wise rate on the trip's one delivery, so it
        // meets the completeness check the later lock() call performs).
        const saved = await rateEntryService.create({
            tripId: trip.tripId,
            rate: 40,
            remarks: "draft",
            deliveries: [{ id: trip.deliveryId, rate: 40 }],
        });
        assert.equal(saved.rate, 40);
        assert.equal(saved.locked, false);
        // Read back via the same single record.
        const read = await rateEntryService.getByTripId(trip.tripId);
        assert.ok(read);
        assert.equal(read.id, saved.id);
        assert.equal(read.rate, 40);
        // Saving again while unlocked updates the same row (never a 2nd row —
        // UNIQUE trip_id guarantees this even under a raw INSERT race).
        const resaved = await rateEntryService.create({ tripId: trip.tripId, rate: 50 });
        assert.equal(resaved.id, saved.id);
        assert.equal(resaved.rate, 50);
        // Editing the existing rate record still works pre-lock.
        const updated = await rateEntryService.update(saved.id, { rate: 45.25 });
        assert.equal(updated.id, saved.id);
        assert.equal(updated.rate, 45.25);
        assert.equal(await rateEntryService.getByTripId(trip.tripId).then((r) => r?.rate), 45.25);
        // Lock.
        const locked = await rateEntryService.lock(trip.tripId, { lockedBy: "tester" });
        assert.equal(locked.id, saved.id);
        assert.equal(locked.locked, true);
        // A second lock for the same trip is rejected — already locked.
        await assertAppErrorStatus(rateEntryService.lock(trip.tripId, { lockedBy: "tester2" }), 409);
        // Save/update are rejected once locked — no silent overwrite.
        await assertAppErrorStatus(rateEntryService.create({ tripId: trip.tripId, rate: 99 }), 409);
        await assertAppErrorStatus(rateEntryService.update(saved.id, { rate: 99 }), 409);
    });
});
//# sourceMappingURL=shopSalesService.test.js.map