import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../config/db.js";
import { AppError } from "../../middleware/errorHandler.js";
import { rateEntryService } from "../rateEntryService.js";
import { shopSalesService } from "../shopSalesService.js";
let uniqSeq = 0;
const uniqBase = (Date.now() % 1_000_000) * 1000 + Math.floor(Math.random() * 1000);
function uniqueInt() {
    return uniqBase + ++uniqSeq;
}
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
async function makeTrip(f, opts) {
    const t = await pool.query(`INSERT INTO trips (trip_no, trip_date, status, deleted, total_birds, dc_weight)
     VALUES ($1, $2::date, $3::trip_status, $4, 1000, 2000)
     RETURNING id`, [opts.tripNo, opts.tripDate ?? new Date().toISOString().slice(0, 10), opts.status, opts.deleted ?? false]);
    const tripId = t.rows[0].id;
    f.tripIds.push(tripId);
    return tripId;
}
async function addDelivery(tripId, opts) {
    const d = await pool.query(`INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, birds, weight, rate)
     VALUES ($1, $2, $3, $4, $5, $6, NULL)
     RETURNING id`, [tripId, `SALE-${uniqueInt()}`, opts.shopId, opts.shopName, opts.birds, opts.weight]);
    return d.rows[0].id;
}
function asArray(r) {
    return Array.isArray(r) ? r : r.data;
}
describe("rateEntryService", () => {
    test("1. Pending trip does NOT appear in Rate Entry", async () => {
        const f = newFixture();
        try {
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Pending" });
            const list = asArray(await rateEntryService.list());
            assert.ok(!list.some((r) => r.id === tripId));
        }
        finally {
            await cleanup(f);
        }
    });
    test("2. Draft trip does NOT appear in Rate Entry", async () => {
        const f = newFixture();
        try {
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Draft" });
            const list = asArray(await rateEntryService.list());
            assert.ok(!list.some((r) => r.id === tripId));
        }
        finally {
            await cleanup(f);
        }
    });
    test("3. Completed trip appears in Rate Entry", async () => {
        const f = newFixture();
        try {
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
            const list = asArray(await rateEntryService.list());
            assert.ok(list.some((r) => r.id === tripId));
        }
        finally {
            await cleanup(f);
        }
    });
    test("4. Deleted trip does NOT appear", async () => {
        const f = newFixture();
        try {
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed", deleted: true });
            const list = asArray(await rateEntryService.list());
            assert.ok(!list.some((r) => r.id === tripId));
        }
        finally {
            await cleanup(f);
        }
    });
    test("5. Completed trip with no rates appears (not yet rate-locked)", async () => {
        const f = newFixture();
        try {
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
            const list = asArray(await rateEntryService.list());
            const row = list.find((r) => r.id === tripId);
            assert.ok(row);
            assert.equal(row.rateLocked, false);
        }
        finally {
            await cleanup(f);
        }
    });
    test("6. Completed trip with saved but unlocked rates remains in Rate Entry", async () => {
        const f = newFixture();
        try {
            const shop = await makeShop(f, "Shop A");
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
            const deliveryId = await addDelivery(tripId, { shopId: shop.id, shopName: "Shop A", birds: 100, weight: 200 });
            await rateEntryService.save(tripId, {
                rates: [{ deliveryId, rate: 80 }],
            });
            const list = asArray(await rateEntryService.list());
            const row = list.find((r) => r.id === tripId);
            assert.ok(row, "trip should still be listed after save, before lock");
            assert.equal(row.ratesEntered, 1);
            assert.equal(row.rateLocked, false);
        }
        finally {
            await cleanup(f);
        }
    });
    test("8 & 9. Locking valid rates succeeds, and the trip disappears from Rate Entry", async () => {
        const f = newFixture();
        try {
            const shop = await makeShop(f, "Shop B");
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
            const deliveryId = await addDelivery(tripId, { shopId: shop.id, shopName: "Shop B", birds: 100, weight: 200 });
            await rateEntryService.save(tripId, { rates: [{ deliveryId, rate: 90 }] });
            const locked = await rateEntryService.lock(tripId, { lockedBy: "tester" });
            assert.equal(locked.rateLocked, true);
            assert.equal(locked.rateLockedBy, "tester");
            assert.ok(locked.rateLockedAt);
            const list = asArray(await rateEntryService.list());
            assert.ok(!list.some((r) => r.id === tripId), "locked trip must not reappear in Rate Entry");
        }
        finally {
            await cleanup(f);
        }
    });
    test("10. After locking, the trip becomes eligible for Shop Sales", async () => {
        const f = newFixture();
        try {
            const shop = await makeShop(f, "Shop C");
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
            const deliveryId = await addDelivery(tripId, { shopId: shop.id, shopName: "Shop C", birds: 100, weight: 200 });
            await rateEntryService.save(tripId, { rates: [{ deliveryId, rate: 70 }] });
            await rateEntryService.lock(tripId, { lockedBy: "tester" });
            const sale = await shopSalesService.getById(deliveryId);
            assert.equal(sale.tripId, tripId);
            assert.equal(sale.rate, 70);
        }
        finally {
            await cleanup(f);
        }
    });
    test("11. Locked rates cannot be modified (save/lock reject with 409)", async () => {
        const f = newFixture();
        try {
            const shop = await makeShop(f, "Shop D");
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
            const deliveryId = await addDelivery(tripId, { shopId: shop.id, shopName: "Shop D", birds: 100, weight: 200 });
            await rateEntryService.save(tripId, { rates: [{ deliveryId, rate: 60 }] });
            await rateEntryService.lock(tripId, { lockedBy: "tester" });
            await assert.rejects(() => rateEntryService.save(tripId, { rates: [{ deliveryId, rate: 65 }] }), (err) => err instanceof AppError && err.status === 409);
            const relock = await rateEntryService.lock(tripId, { lockedBy: "tester" });
            assert.equal(relock.rateLocked, true);
            assert.equal(relock.deliveries[0].rate, 60);
        }
        finally {
            await cleanup(f);
        }
    });
    test("13. Locking incomplete rates is rejected", async () => {
        const f = newFixture();
        try {
            const shop = await makeShop(f, "Shop E");
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
            const d1 = await addDelivery(tripId, { shopId: shop.id, shopName: "Shop E", birds: 50, weight: 100 });
            await addDelivery(tripId, { shopId: shop.id, shopName: "Shop E-2", birds: 50, weight: 120 });
            await rateEntryService.save(tripId, { rates: [{ deliveryId: d1, rate: 55 }] });
            await assert.rejects(() => rateEntryService.lock(tripId, { lockedBy: "tester" }), (err) => err instanceof AppError && err.status === 422);
        }
        finally {
            await cleanup(f);
        }
    });
    test("14. Invalid shop/delivery cannot be saved", async () => {
        const f = newFixture();
        try {
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
            await assert.rejects(() => rateEntryService.save(tripId, { rates: [{ deliveryId: 999999999, rate: 50 }] }), (err) => err instanceof AppError && err.status === 422);
        }
        finally {
            await cleanup(f);
        }
    });
    test("17. Shop Sales cannot use an unlocked trip (no rate lock)", async () => {
        const f = newFixture();
        try {
            const shop = await makeShop(f, "Shop G");
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
            const deliveryId = await addDelivery(tripId, { shopId: shop.id, shopName: "Shop G", birds: 50, weight: 100 });
            await rateEntryService.save(tripId, { rates: [{ deliveryId, rate: 60 }] });
            await assert.rejects(() => shopSalesService.getById(deliveryId), (err) => err instanceof AppError && err.status === 404);
        }
        finally {
            await cleanup(f);
        }
    });
    test("Draft/Pending trips are rejected from save and lock", async () => {
        const f = newFixture();
        try {
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Pending" });
            await assert.rejects(() => rateEntryService.save(tripId, { rates: [] }), (err) => err instanceof AppError && (err.status === 404 || err.status === 422));
            await assert.rejects(() => rateEntryService.lock(tripId, {}), (err) => err instanceof AppError && (err.status === 404 || err.status === 422));
        }
        finally {
            await cleanup(f);
        }
    });
    test("Locking twice is idempotent and does not duplicate", async () => {
        const f = newFixture();
        try {
            const shop = await makeShop(f, "Shop H");
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
            const deliveryId = await addDelivery(tripId, { shopId: shop.id, shopName: "Shop H", birds: 50, weight: 100 });
            await rateEntryService.save(tripId, { rates: [{ deliveryId, rate: 60 }] });
            const first = await rateEntryService.lock(tripId, { lockedBy: "tester" });
            const second = await rateEntryService.lock(tripId, { lockedBy: "tester2" });
            assert.equal(first.rateLocked, true);
            assert.equal(second.rateLocked, true);
            const re = await pool.query(`SELECT COUNT(*)::int AS c FROM rate_entry WHERE trip_id = $1`, [tripId]);
            assert.equal(re.rows[0].c, 1);
        }
        finally {
            await cleanup(f);
        }
    });
    test("Locking a trip with no deliveries is rejected", async () => {
        const f = newFixture();
        try {
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
            await assert.rejects(() => rateEntryService.lock(tripId, {}), (err) => err instanceof AppError && err.status === 422);
        }
        finally {
            await cleanup(f);
        }
    });
    test("Deleted status trip does not appear (status Deleted)", async () => {
        const f = newFixture();
        try {
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Deleted" });
            const list = asArray(await rateEntryService.list());
            assert.ok(!list.some((r) => r.id === tripId));
        }
        finally {
            await cleanup(f);
        }
    });
    test("Rate range: 50 and 300 accepted; 49.99, 300.01, negative rejected", async () => {
        const f = newFixture();
        try {
            const shop = await makeShop(f, "Range Shop");
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
            const deliveryId = await addDelivery(tripId, { shopId: shop.id, shopName: "Range Shop", birds: 10, weight: 26 });
            for (const bad of [49.99, 300.01, -10, 0]) {
                await assert.rejects(() => rateEntryService.save(tripId, { rates: [{ deliveryId, rate: bad }] }), (err) => err instanceof AppError && err.status === 400);
            }
            const a = await rateEntryService.save(tripId, { rates: [{ deliveryId, rate: 50 }] });
            assert.equal(a.deliveries[0].rate, 50);
            const b = await rateEntryService.save(tripId, { rates: [{ deliveryId, rate: 300 }] });
            assert.equal(b.deliveries[0].rate, 300);
        }
        finally {
            await cleanup(f);
        }
    });
    test("Partial save persists blanks and does not lock or open Shop Sales", async () => {
        const f = newFixture();
        try {
            const shopA = await makeShop(f, "Shop A");
            const shopB = await makeShop(f, "Shop B");
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
            const d1 = await addDelivery(tripId, { shopId: shopA.id, shopName: "Shop A", birds: 10, weight: 26 });
            await addDelivery(tripId, { shopId: shopB.id, shopName: "Shop B", birds: 10, weight: 20 });
            const saved = await rateEntryService.save(tripId, { rates: [{ deliveryId: d1, rate: 100 }] });
            assert.equal(saved.rateLocked, false);
            assert.equal(saved.deliveries.find((d) => d.id === d1)?.amount, 2600);
            assert.equal(saved.deliveries.find((d) => d.shopName === "Shop B")?.rate, null);
            const reloaded = await rateEntryService.getById(tripId);
            assert.equal(reloaded.deliveries.find((d) => d.id === d1)?.rate, 100);
            assert.equal(reloaded.deliveries.find((d) => d.shopName === "Shop B")?.rate, null);
            const list = asArray(await rateEntryService.list());
            assert.ok(list.some((r) => r.id === tripId));
            await assert.rejects(() => shopSalesService.getById(d1), (err) => err instanceof AppError && err.status === 404);
        }
        finally {
            await cleanup(f);
        }
    });
    test("Empty save is allowed", async () => {
        const f = newFixture();
        try {
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
            const saved = await rateEntryService.save(tripId, { rates: [] });
            assert.equal(saved.rateLocked, false);
        }
        finally {
            await cleanup(f);
        }
    });
    test("Lock with one blank shop is rejected and trip stays pending", async () => {
        const f = newFixture();
        try {
            const shop = await makeShop(f, "Shop A");
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
            const d1 = await addDelivery(tripId, { shopId: shop.id, shopName: "Shop A", birds: 10, weight: 20 });
            await addDelivery(tripId, { shopId: shop.id, shopName: "Shop C", birds: 11, weight: 21 });
            await rateEntryService.save(tripId, { rates: [{ deliveryId: d1, rate: 120 }] });
            await assert.rejects(() => rateEntryService.lock(tripId, { lockedBy: "tester" }), (err) => err instanceof AppError &&
                err.status === 422 &&
                Array.isArray(err.details?.missingDeliveries));
            const list = asArray(await rateEntryService.list());
            assert.ok(list.some((r) => r.id === tripId));
        }
        finally {
            await cleanup(f);
        }
    });
    test("Atomic lock persists rates, stamps lock, and is concurrent-safe", async () => {
        const f = newFixture();
        try {
            const shop = await makeShop(f, "Shop Lock");
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
            const deliveryId = await addDelivery(tripId, {
                shopId: shop.id,
                shopName: "Shop Lock",
                birds: 10,
                weight: 26,
            });
            const [a, b] = await Promise.all([
                rateEntryService.lock(tripId, {
                    lockedBy: "a",
                    rates: [{ deliveryId, rate: 100 }],
                }),
                rateEntryService.lock(tripId, {
                    lockedBy: "b",
                    rates: [{ deliveryId, rate: 100 }],
                }),
            ]);
            assert.equal(a.rateLocked, true);
            assert.equal(b.rateLocked, true);
            assert.equal(a.deliveries[0].amount, 2600);
            const deliveries = await pool.query(`SELECT COUNT(*)::int AS c FROM trip_deliveries WHERE trip_id = $1`, [tripId]);
            assert.equal(deliveries.rows[0].c, 1);
            const re = await pool.query(`SELECT COUNT(*)::int AS c FROM rate_entry WHERE trip_id = $1 AND locked = TRUE`, [
                tripId,
            ]);
            assert.equal(re.rows[0].c, 1);
            const list = asArray(await rateEntryService.list());
            assert.ok(!list.some((r) => r.id === tripId));
            const sale = await shopSalesService.getById(deliveryId);
            assert.equal(sale.rate, 100);
            assert.equal(sale.amount, 2600);
        }
        finally {
            await cleanup(f);
        }
    });
    test("Market Rate master returns all three tables for trip date ± 1 day", async () => {
        const f = newFixture();
        try {
            const tripDate = "2026-08-14";
            await pool.query(`DELETE FROM market_rates WHERE business_date BETWEEN '2026-08-10' AND '2026-08-20'`);
            await pool.query(`INSERT INTO market_rates (
           business_date, vij, gun, rp, sneha, vencob_rate, vencob_vii, vencob_gun,
           association_vii, c17, c15, c13, c12, c10
         ) VALUES
         ('2026-08-12', 1,1,1,1,1,1,1,1,1,1,1,1,1),
         ('2026-08-13', 10, 20, 30, 40, 50, 60, 70, 80, 17, 15, 13, 12, 10),
         ('2026-08-14', 0, 21, 31, 41, 0, 61, 71, 81, 0, 15, 13, 12, 10),
         ('2026-08-16', 99,99,99,99,99,99,99,99,99,99,99,99,99)`);
            const shop = await makeShop(f, "MR Shop");
            const tripId = await makeTrip(f, {
                tripNo: `RT-${uniqueInt()}`,
                status: "Completed",
                tripDate,
            });
            const deliveryId = await addDelivery(tripId, { shopId: shop.id, shopName: "MR Shop", birds: 10, weight: 20 });
            const detail = await rateEntryService.getById(tripId);
            const master = detail.marketRateMaster;
            assert.ok(master);
            assert.equal(master.tripDate, "2026-08-14");
            assert.equal(master.fromDate, "2026-08-13");
            assert.equal(master.toDate, "2026-08-15");
            const dates = master.additionalMetrics.map((r) => r.date);
            assert.deepEqual(dates, ["2026-08-13", "2026-08-14", "2026-08-15"]);
            assert.deepEqual(master.companyRates.map((r) => r.date), dates);
            assert.deepEqual(master.sizeCategoryBreakdown.map((r) => r.date), dates);
            assert.ok(!dates.includes("2026-08-12"));
            assert.ok(!dates.includes("2026-08-16"));
            const d13 = master.additionalMetrics.find((r) => r.date === "2026-08-13");
            assert.equal(d13?.entered, true);
            assert.equal(d13?.vij, 10);
            assert.equal(d13?.gun, 20);
            assert.equal(d13?.rp, 30);
            const c13 = master.companyRates.find((r) => r.date === "2026-08-13");
            assert.equal(c13?.sneha, 40);
            assert.equal(c13?.vencobRate, 50);
            assert.equal(c13?.vencobVii, 60);
            assert.equal(c13?.vencobGun, 70);
            assert.equal(c13?.associationVii, 80);
            assert.ok(master.sizeColumnKeys.includes("c17"));
            assert.ok(master.sizeColumnKeys.includes("c15"));
            assert.ok(master.sizeColumnKeys.includes("c13"));
            assert.ok(master.sizeColumnKeys.includes("c12"));
            assert.ok(master.sizeColumnKeys.includes("c10"));
            const s13 = master.sizeCategoryBreakdown.find((r) => r.date === "2026-08-13");
            assert.equal(s13?.columns.c17, 17);
            assert.equal(s13?.columns.c10, 10);
            const missing = master.additionalMetrics.find((r) => r.date === "2026-08-15");
            assert.equal(missing?.entered, false);
            assert.equal(missing?.vij, null);
            assert.equal(master.companyRates.find((r) => r.date === "2026-08-15")?.vencobRate, null);
            const zeroDay = master.additionalMetrics.find((r) => r.date === "2026-08-14");
            assert.equal(zeroDay?.entered, true);
            assert.equal(zeroDay?.vij, 0);
            assert.equal(master.companyRates.find((r) => r.date === "2026-08-14")?.vencobRate, 0);
            assert.equal(master.sizeCategoryBreakdown.find((r) => r.date === "2026-08-14")?.columns.c17, 0);
            const before = await pool.query(`SELECT COUNT(*)::int AS c FROM market_rates WHERE business_date = '2026-08-13'`);
            await rateEntryService.save(tripId, { rates: [{ deliveryId, rate: 80 }] });
            const afterSave = await pool.query(`SELECT COUNT(*)::int AS c FROM market_rates WHERE business_date = '2026-08-13'`);
            assert.equal(afterSave.rows[0].c, before.rows[0].c);
            const afterSaveRow = await pool.query(`SELECT vij FROM market_rates WHERE business_date = '2026-08-13'`);
            assert.equal(Number(afterSaveRow.rows[0].vij), 10);
            await rateEntryService.lock(tripId, { lockedBy: "tester", rates: [{ deliveryId, rate: 80 }] });
            const afterLock = await pool.query(`SELECT vij FROM market_rates WHERE business_date = '2026-08-13'`);
            assert.equal(Number(afterLock.rows[0].vij), 10);
        }
        finally {
            await pool.query(`DELETE FROM market_rates WHERE business_date BETWEEN '2026-08-10' AND '2026-08-20'`);
            await cleanup(f);
        }
    });
});
after(async () => {
    await pool.end();
});
//# sourceMappingURL=rateEntryService.test.js.map