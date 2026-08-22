import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../config/db.js";
import { shopRatesService } from "../shopRatesService.js";
/**
 * Integration tests against the real PostgreSQL database, verifying the
 * existing Shop Rates behavior continues to work exactly as before the
 * Shop Sales / Rate Entry visibility change (no regressions).
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
 * Creates a Completed trip so the Shop Rates service has an active trip to
 * attach the rate row to (shopRatesService.create attaches to the latest
 * active trip). trip_date = today + highest id makes it the latest at the
 * moment of the create call.
 */
async function makeActiveTrip(f, tripNo) {
    const r = await pool.query(`INSERT INTO trips (trip_no, trip_date, status, approved_at, deleted, total_birds, dc_weight)
     VALUES ($1, CURRENT_DATE, 'Completed', NOW(), FALSE, 1000, 2000)
     RETURNING id`, [tripNo]);
    f.tripIds.push(r.rows[0].id);
    return r.rows[0];
}
after(async () => {
    await pool.end();
});
describe("Existing Shop Rates behavior", () => {
    test("create / list / getById / update / softDelete continue to work exactly as before", async (t) => {
        const f = newFixture();
        t.after(() => cleanup(f));
        const shop = await makeShop(f, "rates-behavior-shop");
        const bt = await makeBirdType(f, "rates-behavior-bird");
        await makeActiveTrip(f, `T-RATES-${uniqueInt()}`);
        const created = await shopRatesService.create({
            shopId: shop.id,
            shopName: "rates-behavior-shop",
            birdTypeId: bt.id,
            birdType: "rates-behavior-bird",
            rate: 48.75,
            effectiveFrom: today,
            remarks: "existing behavior test",
        });
        assert.ok(created.id > 0);
        assert.equal(created.shopId, shop.id);
        assert.equal(created.birdTypeId, bt.id);
        assert.equal(created.rate, 48.75);
        assert.equal(created.status, "Approved");
        const byId = await shopRatesService.getById(created.id);
        assert.equal(byId.id, created.id);
        assert.equal(byId.rate, 48.75);
        const list = (await shopRatesService.list({ shopId: shop.id }));
        assert.ok(list.some((r) => r.id === created.id), "created rate should be listed");
        const updated = await shopRatesService.update(created.id, { rate: 51.0 });
        assert.equal(updated.id, created.id);
        assert.equal(updated.rate, 51.0);
        await shopRatesService.softDelete(created.id, "test cleanup");
        const afterDelete = (await shopRatesService.list({ shopId: shop.id }));
        assert.ok(!afterDelete.some((r) => r.id === created.id), "soft-deleted rate (rate set to NULL) must no longer be listed");
    });
});
//# sourceMappingURL=shopRatesService.test.js.map