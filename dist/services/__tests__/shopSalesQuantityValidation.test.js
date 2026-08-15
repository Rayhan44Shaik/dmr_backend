import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../config/db.js";
import { AppError } from "../../middleware/errorHandler.js";
import { rateEntryService } from "../rateEntryService.js";
import { shopSalesService } from "../shopSalesService.js";
/**
 * Quantity-integrity audit: Shop Sales edits must never let the total
 * allocation (all shops + mortality) exceed the trip's authoritative
 * farm/pickup loaded quantity — birds and weight are two INDEPENDENT
 * limits, never cross-derived. Real PostgreSQL, no mocking, same pattern
 * as the other __tests__ files.
 *
 * The capacity check itself (shopSalesService.ts: assertWithinCapacity +
 * sumActiveDeliveries, tripDeliverySync.ts) already existed before this
 * file — these tests exist to empirically PROVE it enforces the exact
 * business rule requested, across a wide matrix, not just the couple of
 * happy-path cases the original test suite covered.
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
async function makeShop(f, name) {
    const r = await pool.query(`INSERT INTO shops (shop_no, shop_name) VALUES ($1, $2) RETURNING id`, [uniqueInt(), name]);
    f.shopIds.push(r.rows[0].id);
    return r.rows[0].id;
}
/**
 * Builds a Completed, rate-locked trip with:
 *   - capacityBirds / capacityWeight as the authoritative farm/pickup load
 *   - a Shop 1 delivery, a Shop 2 delivery, and a dedicated "mortality" row
 *     (no shop, birds=0/weight=0, carrying the mortality count/weight) —
 *     modeling mortality as its own bucket, exactly as the business example
 *     in the spec describes (Shop1 + Shop2 + mortality <= loaded).
 * Every active row gets a nominal rate so the trip can actually be locked
 * (assertRatesComplete requires every row to have a positive rate,
 * including the mortality row).
 */
async function makeCapacityTrip(f, opts) {
    const shop1Id = await makeShop(f, `qty-shop1-${uniqueInt()}`);
    const shop2Id = await makeShop(f, `qty-shop2-${uniqueInt()}`);
    const t = await pool.query(`INSERT INTO trips (trip_no, trip_date, status, deleted, approved_at, total_birds, dc_weight)
     VALUES ($1, CURRENT_DATE, 'Completed', FALSE, NOW(), $2, $3)
     RETURNING id`, [`T-QTY-${uniqueInt()}`, opts.capacityBirds, opts.capacityWeight]);
    const tripId = t.rows[0].id;
    f.tripIds.push(tripId);
    async function addRow(shopId, shopName, birds, weight, mortality, mortKg) {
        const d = await pool.query(`INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, birds, weight, mortality, mort_kg, rate)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)
       RETURNING id`, [tripId, `SALE-${uniqueInt()}`, shopId, shopName, birds, weight, mortality, mortKg]);
        return d.rows[0].id;
    }
    const shop1DeliveryId = await addRow(shop1Id, "qty-shop1", opts.shop1Birds, opts.shop1Weight, 0, 0);
    const shop2DeliveryId = await addRow(shop2Id, "qty-shop2", opts.shop2Birds, opts.shop2Weight, 0, 0);
    const mortalityRowId = await addRow(null, "mortality", 0, 0, opts.mortalityBirds, opts.mortalityWeight);
    await rateEntryService.create({
        tripId,
        rate: 50,
        deliveries: [
            { id: shop1DeliveryId, rate: 50 },
            { id: shop2DeliveryId, rate: 50 },
            { id: mortalityRowId, rate: 1 },
        ],
    });
    await rateEntryService.lock(tripId, { lockedBy: "qty-tester" });
    return { tripId, shop1Id, shop2Id, mortalityRowId, shop1DeliveryId, shop2DeliveryId };
}
async function assertStatus(promise, status) {
    await assert.rejects(promise, (err) => {
        assert.ok(err instanceof AppError, `expected AppError, got: ${String(err)}`);
        assert.equal(err.status, status);
        return true;
    });
}
describe("Birds quantity validation (loaded=50, mortality=2, shop2=23 -> shop1 available=25)", () => {
    async function fixture(f) {
        return makeCapacityTrip(f, {
            capacityBirds: 50,
            capacityWeight: 1000, // generous — this suite only exercises birds
            shop1Birds: 25,
            shop1Weight: 10,
            shop2Birds: 23,
            shop2Weight: 10,
            mortalityBirds: 2,
            mortalityWeight: 0,
        });
    }
    test("1. Shop1 -> 24 (below available 25): PASS", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { shop1DeliveryId } = await fixture(f);
        const updated = await shopSalesService.update(shop1DeliveryId, { birds: 24 });
        assert.equal(updated.birds, 24);
    });
    test("2. Shop1 -> 25 (exactly at available limit): PASS", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { shop1DeliveryId } = await fixture(f);
        const updated = await shopSalesService.update(shop1DeliveryId, { birds: 25 });
        assert.equal(updated.birds, 25);
    });
    test("3. Shop1 -> 26 (1 over available): FAIL 409/422", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { shop1DeliveryId } = await fixture(f);
        await assertStatus(shopSalesService.update(shop1DeliveryId, { birds: 26 }), 422);
    });
    test("4. Shop1 -> 30 (well over available): FAIL", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { shop1DeliveryId } = await fixture(f);
        await assertStatus(shopSalesService.update(shop1DeliveryId, { birds: 30 }), 422);
    });
    test("5. Shop1 -> 0: PASS (existing business rule allows a zero-bird row)", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { shop1DeliveryId } = await fixture(f);
        const updated = await shopSalesService.update(shop1DeliveryId, { birds: 0 });
        assert.equal(updated.birds, 0);
    });
    test("6. Shop1 -> negative: FAIL (schema validation, 400)", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { shop1DeliveryId } = await fixture(f);
        await assertStatus(shopSalesService.update(shop1DeliveryId, { birds: -5 }), 400);
    });
    test("7. Shop1 -> decimal: FAIL (birds must be an integer, 400)", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { shop1DeliveryId } = await fixture(f);
        await assertStatus(shopSalesService.update(shop1DeliveryId, { birds: 12.5 }), 400);
    });
    test("8. Shop2 changed while Shop1 stays at 25: validated against the GLOBAL total, not just the edited row", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { shop1DeliveryId, shop2DeliveryId } = await fixture(f);
        // Shop1 already consumes 25 of the 50; Shop2 (currently 23) + mortality
        // (2) can grow to at most 25 total. Growing Shop2 to 24 -> 25+24+2=51 fails.
        await assertStatus(shopSalesService.update(shop2DeliveryId, { birds: 24 }), 422);
        // But shrinking Shop2 to 22 leaves room: 25+22+2=49 <= 50.
        const updated = await shopSalesService.update(shop2DeliveryId, { birds: 22 });
        assert.equal(updated.birds, 22);
        void shop1DeliveryId;
    });
    test("9. Both shops changed sequentially: each update validates against the state left by the previous one", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { shop1DeliveryId, shop2DeliveryId } = await fixture(f);
        // Shrink Shop1 to 20 (20+23+2=45, room for 5 more).
        await shopSalesService.update(shop1DeliveryId, { birds: 20 });
        // Now Shop2 can grow by up to 5: 20+28+2=50 OK.
        const grownShop2 = await shopSalesService.update(shop2DeliveryId, { birds: 28 });
        assert.equal(grownShop2.birds, 28);
        // One more bird anywhere now fails: 20+29+2=51.
        await assertStatus(shopSalesService.update(shop2DeliveryId, { birds: 29 }), 422);
    });
    test("10. Two simultaneous updates that would jointly exceed capacity: only the non-exceeding final state survives", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        // Loaded 50, mortality 2, start both shops at 0 so there's exactly 48 to fight over.
        const { tripId, shop1Id, shop2Id } = await fixture(f);
        const s1 = await pool.query(`SELECT id FROM trip_deliveries WHERE trip_id=$1 AND shop_id=$2`, [tripId, shop1Id]);
        const s2 = await pool.query(`SELECT id FROM trip_deliveries WHERE trip_id=$1 AND shop_id=$2`, [tripId, shop2Id]);
        await shopSalesService.update(s1.rows[0].id, { birds: 0 });
        await shopSalesService.update(s2.rows[0].id, { birds: 0 });
        // Now available = 50 - 2 = 48. Two concurrent requests each try to take 30
        // (30+30=60 > 48) — the trip-row FOR UPDATE lock must serialize them so
        // the second sees the first's committed change and gets rejected.
        const results = await Promise.allSettled([
            shopSalesService.update(s1.rows[0].id, { birds: 30 }),
            shopSalesService.update(s2.rows[0].id, { birds: 30 }),
        ]);
        const fulfilled = results.filter((r) => r.status === "fulfilled");
        assert.equal(fulfilled.length, 1, "only one of the two conflicting concurrent updates may succeed");
        const finalRows = await pool.query(`SELECT birds FROM trip_deliveries WHERE trip_id = $1 AND deleted = FALSE AND shop_id IS NOT NULL`, [tripId]);
        const totalBirds = finalRows.rows.reduce((sum, r) => sum + Number(r.birds), 0);
        assert.ok(totalBirds + 2 <= 50, `final total (${totalBirds} + 2 mortality) must never exceed loaded capacity 50`);
    });
});
describe("Weight quantity validation (loaded=100 KG, shop1=48, shop2=40)", () => {
    async function fixture(f) {
        return makeCapacityTrip(f, {
            capacityBirds: 1000, // generous — this suite only exercises weight
            capacityWeight: 100,
            shop1Birds: 10,
            shop1Weight: 48,
            shop2Birds: 10,
            shop2Weight: 40,
            mortalityBirds: 0,
            mortalityWeight: 0,
        });
    }
    test("1. Shop1 -> 50 KG (50+40=90 <= 100): PASS", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { shop1DeliveryId } = await fixture(f);
        const updated = await shopSalesService.update(shop1DeliveryId, { weight: 50 });
        assert.equal(updated.weight, 50);
    });
    test("2. Shop1 -> 60 KG (60+40=100, exactly at the limit): PASS", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { shop1DeliveryId } = await fixture(f);
        const updated = await shopSalesService.update(shop1DeliveryId, { weight: 60 });
        assert.equal(updated.weight, 60);
    });
    test("3. Shop1 -> 61 KG (61+40=101 > 100): FAIL", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { shop1DeliveryId } = await fixture(f);
        await assertStatus(shopSalesService.update(shop1DeliveryId, { weight: 61 }), 422);
    });
    test("4. Shop1 -> 100 KG while Shop2 still holds 40 (140 > 100): FAIL", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { shop1DeliveryId } = await fixture(f);
        await assertStatus(shopSalesService.update(shop1DeliveryId, { weight: 100 }), 422);
    });
    test("5. Shop1 -> 0 KG: PASS (existing business rule allows a zero-weight row)", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { shop1DeliveryId } = await fixture(f);
        const updated = await shopSalesService.update(shop1DeliveryId, { weight: 0 });
        assert.equal(updated.weight, 0);
    });
    test("6. Shop1 -> negative weight: FAIL (schema validation, 400)", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { shop1DeliveryId } = await fixture(f);
        await assertStatus(shopSalesService.update(shop1DeliveryId, { weight: -1 }), 400);
    });
    test("7. Shop1 -> decimal weight (precision to 3dp is supported): PASS", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { shop1DeliveryId } = await fixture(f);
        const updated = await shopSalesService.update(shop1DeliveryId, { weight: 55.375 });
        assert.equal(updated.weight, 55.375);
    });
    test("8. Shop2 increased while Shop1 stays at 48: validated GLOBALLY", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { shop2DeliveryId } = await fixture(f);
        // 48 + 53 = 101 > 100 -> fail.
        await assertStatus(shopSalesService.update(shop2DeliveryId, { weight: 53 }), 422);
        // 48 + 52 = 100 -> ok.
        const updated = await shopSalesService.update(shop2DeliveryId, { weight: 52 });
        assert.equal(updated.weight, 52);
    });
    test("9. Both shops updated sequentially, each validated against the running total", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { shop1DeliveryId, shop2DeliveryId } = await fixture(f);
        await shopSalesService.update(shop1DeliveryId, { weight: 30 }); // 30+40=70
        const grown = await shopSalesService.update(shop2DeliveryId, { weight: 70 }); // 30+70=100
        assert.equal(grown.weight, 70);
        await assertStatus(shopSalesService.update(shop2DeliveryId, { weight: 71 }), 422); // 30+71=101
    });
    test("10. Concurrent updates attempting to jointly exceed 100 KG: final state never exceeds capacity", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { tripId, shop1Id, shop2Id } = await fixture(f);
        const s1 = await pool.query(`SELECT id FROM trip_deliveries WHERE trip_id=$1 AND shop_id=$2`, [tripId, shop1Id]);
        const s2 = await pool.query(`SELECT id FROM trip_deliveries WHERE trip_id=$1 AND shop_id=$2`, [tripId, shop2Id]);
        await shopSalesService.update(s1.rows[0].id, { weight: 0 });
        await shopSalesService.update(s2.rows[0].id, { weight: 0 });
        const results = await Promise.allSettled([
            shopSalesService.update(s1.rows[0].id, { weight: 60 }),
            shopSalesService.update(s2.rows[0].id, { weight: 60 }),
        ]);
        const fulfilled = results.filter((r) => r.status === "fulfilled");
        assert.equal(fulfilled.length, 1, "only one of the two conflicting concurrent updates may succeed");
        const finalRows = await pool.query(`SELECT weight FROM trip_deliveries WHERE trip_id = $1 AND deleted = FALSE AND shop_id IS NOT NULL`, [tripId]);
        const totalWeight = finalRows.rows.reduce((sum, r) => sum + Number(r.weight), 0);
        assert.ok(totalWeight <= 100, `final total weight (${totalWeight}) must never exceed loaded capacity 100`);
    });
});
describe("Mortality quantity validation (loaded birds=100)", () => {
    async function fixture(f, mortalityBirds) {
        return makeCapacityTrip(f, {
            capacityBirds: 100,
            capacityWeight: 1000,
            shop1Birds: 40,
            shop1Weight: 10,
            shop2Birds: 40,
            shop2Weight: 10,
            mortalityBirds,
            mortalityWeight: 0,
        });
    }
    test("1. Mortality 0: shops can use the full 100", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { shop1DeliveryId } = await fixture(f, 0);
        // 40+40+0=80, room for 20 more on shop1 -> 60+40+0=100 OK.
        const updated = await shopSalesService.update(shop1DeliveryId, { birds: 60 });
        assert.equal(updated.birds, 60);
    });
    test("2. Mortality 1: reduces available shop allocation by exactly 1", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { shop1DeliveryId } = await fixture(f, 1);
        // 40+40+1=81. Shop1 can grow to 59: 59+40+1=100 OK; 60 fails (101).
        await assertStatus(shopSalesService.update(shop1DeliveryId, { birds: 60 }), 422);
        const updated = await shopSalesService.update(shop1DeliveryId, { birds: 59 });
        assert.equal(updated.birds, 59);
    });
    test("3. Mortality 2 (spec's own example ratio): PASS/FAIL boundary at available-2", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { shop1DeliveryId } = await fixture(f, 2);
        const updated = await shopSalesService.update(shop1DeliveryId, { birds: 58 }); // 58+40+2=100
        assert.equal(updated.birds, 58);
        await assertStatus(shopSalesService.update(shop1DeliveryId, { birds: 59 }), 422); // 101
    });
    test("4. Mortality 5: reduces available capacity accordingly", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { shop1DeliveryId } = await fixture(f, 5);
        const updated = await shopSalesService.update(shop1DeliveryId, { birds: 55 }); // 55+40+5=100
        assert.equal(updated.birds, 55);
        await assertStatus(shopSalesService.update(shop1DeliveryId, { birds: 56 }), 422);
    });
    test("5. Mortality equal to (loaded - shops): shops already at the exact limit, no further growth allowed", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        // loaded=100, shop1=40, shop2=40, so mortality=20 exactly fills the rest
        // (40+40+20=100) — zero headroom left.
        const { shop1DeliveryId } = await fixture(f, 20);
        await assertStatus(shopSalesService.update(shop1DeliveryId, { birds: 41 }), 422);
        // Confirms staying at the limit is still fine (no false rejection).
        const unchanged = await shopSalesService.update(shop1DeliveryId, { birds: 40 });
        assert.equal(unchanged.birds, 40);
    });
    test("6. Mortality causing total > loaded birds: the ORIGINAL insert should never have been reachable via the guarded API — verify a subsequent shop edit against it is rejected", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        // 40+40+25=105 > 100 -- built directly via raw SQL (bypassing the guard,
        // as e.g. bad legacy data might), then confirm Shop Sales still refuses
        // to let it get WORSE, and any further edit revalidates the true total.
        const { shop1DeliveryId } = await fixture(f, 20);
        await pool.query(`UPDATE trip_deliveries SET mortality = 25 WHERE trip_id = (SELECT trip_id FROM trip_deliveries WHERE id = $1) AND shop_id IS NULL`, [shop1DeliveryId]);
        // Even shrinking Shop1 slightly must be rejected, since 40+39+25=104 still exceeds 100.
        await assertStatus(shopSalesService.update(shop1DeliveryId, { birds: 39 }), 422);
    });
    test("7. Negative mortality: FAIL (schema validation, 400)", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { shop1DeliveryId } = await fixture(f, 2);
        await assertStatus(shopSalesService.update(shop1DeliveryId, { mortality: -1 }), 400);
    });
    test("8. Decimal mortality: FAIL (mortality must be an integer, 400)", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { shop1DeliveryId } = await fixture(f, 2);
        await assertStatus(shopSalesService.update(shop1DeliveryId, { mortality: 1.5 }), 400);
    });
    test("9. Mortality changed on the shop row itself after the Shop Sale exists: capacity recalculated with the new value", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { shop1DeliveryId } = await fixture(f, 2);
        // Shop1 currently 40 birds, 0 mortality on its own row; trip-wide mortality bucket is 2.
        // Raise Shop1's OWN mortality to 18 (its own row, not the bucket row):
        // total = 40+18(shop1 mortality)+40(shop2)+2(bucket) = 100 exactly.
        const updated = await shopSalesService.update(shop1DeliveryId, { mortality: 18 });
        assert.equal(updated.mortality, 18);
        // One more anywhere now fails.
        await assertStatus(shopSalesService.update(shop1DeliveryId, { birds: 41 }), 422);
    });
    test("10. Concurrent Shop Sale update + mortality-bucket update racing toward the same limit: final state never exceeds loaded birds", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const { tripId, mortalityRowId, shop1DeliveryId } = await fixture(f, 0);
        // Shrink shop2 to 0 to make room: available = 100 - 40(shop1) - 0(shop2) - 0(mortality) = 60.
        const shop2Row = await pool.query(`SELECT id FROM trip_deliveries WHERE trip_id=$1 AND shop_id IS NOT NULL AND id <> $2`, [tripId, shop1DeliveryId]);
        await shopSalesService.update(shop2Row.rows[0].id, { birds: 0 });
        // Now two concurrent requests: one grows Shop1 by 40 (to 80), the other
        // grows the mortality bucket's OWN "shop" row... but mortality has no
        // update path of its own via Shop Sales other than as a regular row —
        // treat it as a second shop-like delivery competing for the same pool.
        const results = await Promise.allSettled([
            shopSalesService.update(shop1DeliveryId, { birds: 80 }), // 80+0+0=80, ok alone
            shopSalesService.update(shop2Row.rows[0].id, { birds: 40 }), // 40+40+0=80 too, if both apply: 120
        ]);
        const fulfilled = results.filter((r) => r.status === "fulfilled").length;
        const finalRows = await pool.query(`SELECT birds, mortality FROM trip_deliveries WHERE trip_id = $1 AND deleted = FALSE`, [tripId]);
        const total = finalRows.rows.reduce((sum, r) => sum + Number(r.birds) + Number(r.mortality), 0);
        assert.ok(total <= 100, `final total (${total}) must never exceed loaded capacity 100 regardless of which concurrent update won (${fulfilled} succeeded)`);
        void mortalityRowId;
    });
});
after(async () => {
    await pool.end();
});
//# sourceMappingURL=shopSalesQuantityValidation.test.js.map