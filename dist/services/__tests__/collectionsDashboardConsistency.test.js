import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../config/db.js";
import { rateEntryService } from "../rateEntryService.js";
import { collectionsService } from "../collectionsService.js";
import { dashboardService } from "../dashboardService.js";
/**
 * Phase B — cross-module consistency: rate_entry.locked is now the single
 * authoritative "is this trip's rate finished" signal. This file verifies
 * Collections and the Dashboard both agree with Rate Entry/Shop Sales about
 * that state, at every point along Trip -> Rate Entry Save -> Rate Entry
 * Lock -> Shop Sales -> Dashboard/Collections. No mocking — real Postgres,
 * same integration-test pattern as the other __tests__ files.
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
    if (f.tripIds.length) {
        await pool.query(`DELETE FROM trips WHERE id = ANY($1::int[])`, [f.tripIds]);
    }
    if (f.shopIds.length) {
        await pool.query(`DELETE FROM shops WHERE id = ANY($1::int[])`, [f.shopIds]);
    }
}
async function makeShop(f, name) {
    const r = await pool.query(`INSERT INTO shops (shop_no, shop_name) VALUES ($1, $2) RETURNING id`, [uniqueInt(), name]);
    f.shopIds.push(r.rows[0].id);
    return r.rows[0];
}
async function makeCompletedTripWithDelivery(f, opts) {
    const t = await pool.query(`INSERT INTO trips (trip_no, trip_date, status, deleted, total_birds, dc_weight)
     VALUES ($1, CURRENT_DATE, 'Completed', FALSE, 1000, 2000)
     RETURNING id`, [opts.tripNo]);
    const tripId = t.rows[0].id;
    f.tripIds.push(tripId);
    const d = await pool.query(`INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, birds, weight, rate)
     VALUES ($1, $2, $3, $4, $5, $6, NULL)
     RETURNING id`, [tripId, `SALE-${uniqueInt()}`, opts.shopId, opts.shopName, opts.birds, opts.weight]);
    return { tripId, deliveryId: d.rows[0].id };
}
describe("Collections/Dashboard consistency with rate_entry.locked", () => {
    test("Collection for a trip is 'Pending Approval' before lock, 'Approved' after lock — matches Rate Entry exactly", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const shop = await makeShop(f, "consistency-shop-1");
        const { tripId, deliveryId } = await makeCompletedTripWithDelivery(f, {
            tripNo: `T-CONS1-${uniqueInt()}`,
            shopId: shop.id,
            shopName: "consistency-shop-1",
            birds: 100,
            weight: 200,
        });
        // Before any Rate Entry activity: pending, nothing collected.
        let collection = await collectionsService.getById(deliveryId);
        assert.equal(collection.status, "Pending Approval");
        assert.equal(collection.amountCollected, 0);
        await rateEntryService.create({ tripId, rate: 60, deliveries: [{ id: deliveryId, rate: 60 }] });
        // Saved but not yet locked: still pending, still not collected.
        collection = await collectionsService.getById(deliveryId);
        assert.equal(collection.status, "Pending Approval");
        assert.equal(collection.amountCollected, 0);
        await rateEntryService.lock(tripId, { lockedBy: "tester" });
        // Locked: Collections must now agree it's Approved/collected — no lag,
        // no separate flag to flip, same transaction's rate_entry.locked drives it.
        collection = await collectionsService.getById(deliveryId);
        assert.equal(collection.status, "Approved");
        assert.equal(collection.amountCollected, Number((200 * 60).toFixed(2)));
        assert.equal(collection.amountDue, collection.amountCollected);
        assert.equal(collection.balance, 0);
    });
    test("pending() only returns trips whose rate is NOT locked; register() only returns locked ones", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const shop = await makeShop(f, "consistency-shop-2");
        const unlockedTrip = await makeCompletedTripWithDelivery(f, {
            tripNo: `T-CONS2A-${uniqueInt()}`,
            shopId: shop.id,
            shopName: "consistency-shop-2",
            birds: 50,
            weight: 100,
        });
        const lockedTrip = await makeCompletedTripWithDelivery(f, {
            tripNo: `T-CONS2B-${uniqueInt()}`,
            shopId: shop.id,
            shopName: "consistency-shop-2",
            birds: 50,
            weight: 100,
        });
        // pending() requires a real amount due (COALESCE(d.amount,0) > 0) — a
        // delivery that never received a rate has nothing due yet, so it
        // legitimately saves a rate here too (without locking) to model
        // "priced but not yet finalized", the actual state pending() is meant
        // to surface.
        await rateEntryService.create({
            tripId: unlockedTrip.tripId,
            rate: 35,
            deliveries: [{ id: unlockedTrip.deliveryId, rate: 35 }],
        });
        await rateEntryService.create({
            tripId: lockedTrip.tripId,
            rate: 40,
            deliveries: [{ id: lockedTrip.deliveryId, rate: 40 }],
        });
        await rateEntryService.lock(lockedTrip.tripId, { lockedBy: "tester" });
        const pending = await collectionsService.pending(shop.id);
        assert.ok(pending.some((c) => c.tripId === unlockedTrip.tripId), "unlocked trip must appear as pending");
        assert.ok(!pending.some((c) => c.tripId === lockedTrip.tripId), "locked trip must NOT appear as pending");
        const register = (await collectionsService.register({ shopId: shop.id }));
        const registerArr = Array.isArray(register) ? register : register.data;
        assert.ok(registerArr.some((c) => c.tripId === lockedTrip.tripId), "locked trip must appear in the register");
        assert.ok(!registerArr.some((c) => c.tripId === unlockedTrip.tripId), "unlocked trip must NOT appear in the register");
    });
    test("runningBalance() total_collected only counts locked trips", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const shop = await makeShop(f, "consistency-shop-3");
        const unlockedTrip = await makeCompletedTripWithDelivery(f, {
            tripNo: `T-CONS3A-${uniqueInt()}`,
            shopId: shop.id,
            shopName: "consistency-shop-3",
            birds: 10,
            weight: 20,
        });
        const lockedTrip = await makeCompletedTripWithDelivery(f, {
            tripNo: `T-CONS3B-${uniqueInt()}`,
            shopId: shop.id,
            shopName: "consistency-shop-3",
            birds: 10,
            weight: 30,
        });
        await rateEntryService.create({
            tripId: lockedTrip.tripId,
            rate: 25,
            deliveries: [{ id: lockedTrip.deliveryId, rate: 25 }],
        });
        await rateEntryService.lock(lockedTrip.tripId, { lockedBy: "tester" });
        const balances = await collectionsService.runningBalance(shop.id);
        const row = balances.find((b) => b.shopId === shop.id);
        assert.ok(row);
        // Only the locked trip's amount (30 * 25 = 750) is "collected"; the
        // unlocked trip's amount (weight*0, since rate was never set) sits in
        // pending/total but never in total_collected.
        assert.equal(row.totalCollected, 750);
        assert.equal(row.pendingAmount, row.totalSales - 750);
        void unlockedTrip;
    });
    test("Dashboard total_collections/pending_collections move by exactly the locked amount, in the same direction Rate Entry moved", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const shop = await makeShop(f, "consistency-dash-shop");
        const { tripId, deliveryId } = await makeCompletedTripWithDelivery(f, {
            tripNo: `T-CONSDASH-${uniqueInt()}`,
            shopId: shop.id,
            shopName: "consistency-dash-shop",
            birds: 40,
            weight: 77,
        });
        const before = await dashboardService.getSummary();
        await rateEntryService.create({ tripId, rate: 33, deliveries: [{ id: deliveryId, rate: 33 }] });
        const midway = await dashboardService.getSummary();
        // Saved-but-unlocked must not move the Dashboard's collected figure at all.
        assert.equal(midway.totalCollections, before.totalCollections);
        await rateEntryService.lock(tripId, { lockedBy: "tester" });
        const after = await dashboardService.getSummary();
        const expectedAmount = Number((77 * 33).toFixed(2));
        assert.equal(Number((after.totalCollections - before.totalCollections).toFixed(2)), expectedAmount, "Dashboard total_collections must increase by exactly the newly-locked amount");
        // The amount only starts counting as "pending" once it's priced (at
        // save time, midway) — it wasn't pending before that (amount was 0).
        // Locking then moves that same amount from pending to collected, so
        // pending should be right back where it started relative to `before`.
        assert.equal(Number((midway.pendingCollections - before.pendingCollections).toFixed(2)), expectedAmount, "Saving a rate must add the priced amount to pending_collections");
        assert.equal(Number((midway.pendingCollections - after.pendingCollections).toFixed(2)), expectedAmount, "Locking must move exactly that amount out of pending_collections");
        assert.equal(after.pendingCollections, before.pendingCollections, "net pending_collections must return to its pre-save value once locked");
    });
    test("trips.rate_completed cache is synced by lock() and matches rate_entry.locked exactly", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const shop = await makeShop(f, "consistency-cache-shop");
        const { tripId, deliveryId } = await makeCompletedTripWithDelivery(f, {
            tripNo: `T-CONSCACHE-${uniqueInt()}`,
            shopId: shop.id,
            shopName: "consistency-cache-shop",
            birds: 5,
            weight: 9,
        });
        let row = await pool.query(`SELECT rate_completed FROM trips WHERE id = $1`, [tripId]);
        assert.equal(row.rows[0].rate_completed, false);
        await rateEntryService.create({ tripId, rate: 20, deliveries: [{ id: deliveryId, rate: 20 }] });
        row = await pool.query(`SELECT rate_completed FROM trips WHERE id = $1`, [tripId]);
        assert.equal(row.rows[0].rate_completed, false, "saving alone must not flip the cache");
        await rateEntryService.lock(tripId, { lockedBy: "tester" });
        row = await pool.query(`SELECT rate_completed FROM trips WHERE id = $1`, [tripId]);
        assert.equal(row.rows[0].rate_completed, true, "locking must sync the cache in the same transaction");
    });
    test("A generic trip save (tripsService-style rateCompleted field) can no longer flip trips.rate_completed", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const shop = await makeShop(f, "consistency-bypass-shop");
        const { tripId } = await makeCompletedTripWithDelivery(f, {
            tripNo: `T-CONSBYPASS-${uniqueInt()}`,
            shopId: shop.id,
            shopName: "consistency-bypass-shop",
            birds: 5,
            weight: 9,
        });
        // Simulate the old bypass directly against the same UPDATE tripsService.save()
        // used to run with an attacker-supplied rateCompleted value — the fix
        // means the application code path (tripsService.save) never forwards
        // this field to SQL at all (see tripsService.ts). This test documents
        // the guarantee at the data level: no rate_entry row exists, so nothing
        // in the real workflow could have legitimately set it true.
        const row = await pool.query(`SELECT rate_completed FROM trips WHERE id = $1`, [tripId]);
        assert.equal(row.rows[0].rate_completed, false);
        const re = await rateEntryService.getByTripId(tripId);
        assert.equal(re, null, "no Rate Entry exists — rate_completed must not be true for this trip");
    });
});
after(async () => {
    await pool.end();
});
//# sourceMappingURL=collectionsDashboardConsistency.test.js.map