import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../config/db.js";
import { AppError } from "../../middleware/errorHandler.js";
import { rateEntryService } from "../rateEntryService.js";
import { shopSalesService } from "../shopSalesService.js";
/**
 * Integration tests against the real PostgreSQL database (no mocking — see
 * shopSalesService.test.ts for the same pattern). Run with:
 *   npx tsx --test src/services/__tests__/rateEntryService.test.ts
 *
 * Covers the Trip -> Rate Entry [Save] -> Rate Entry [Lock] -> Shop Sales
 * business workflow described in the Rate Entry spec.
 */
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
     VALUES ($1, CURRENT_DATE, $2::trip_status, $3, 1000, 2000)
     RETURNING id`, [opts.tripNo, opts.status, opts.deleted ?? false]);
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
            assert.ok(!list.some((r) => r.tripId === tripId));
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
            assert.ok(!list.some((r) => r.tripId === tripId));
        }
        finally {
            await cleanup(f);
        }
    });
    test("3. Approved trip appears in Rate Entry", async () => {
        const f = newFixture();
        try {
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Approved" });
            const list = asArray(await rateEntryService.list());
            assert.ok(list.some((r) => r.tripId === tripId));
        }
        finally {
            await cleanup(f);
        }
    });
    test("4. Completed trip appears in Rate Entry", async () => {
        const f = newFixture();
        try {
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
            const list = asArray(await rateEntryService.list());
            assert.ok(list.some((r) => r.tripId === tripId));
        }
        finally {
            await cleanup(f);
        }
    });
    test("5. Deleted trip does NOT appear", async () => {
        const f = newFixture();
        try {
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed", deleted: true });
            const list = asArray(await rateEntryService.list());
            assert.ok(!list.some((r) => r.tripId === tripId));
        }
        finally {
            await cleanup(f);
        }
    });
    test("6. Approved trip with no rates appears (rateStatus Pending)", async () => {
        const f = newFixture();
        try {
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Approved" });
            const list = asArray(await rateEntryService.list());
            const row = list.find((r) => r.tripId === tripId);
            assert.ok(row);
            assert.equal(row.rateStatus, "Pending");
            assert.equal(row.locked, false);
        }
        finally {
            await cleanup(f);
        }
    });
    test("7. Approved trip with saved but unlocked rates remains in Rate Entry", async () => {
        const f = newFixture();
        try {
            const shop = await makeShop(f, "Shop A");
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Approved" });
            const deliveryId = await addDelivery(tripId, { shopId: shop.id, shopName: "Shop A", birds: 100, weight: 200 });
            await rateEntryService.create({
                tripId,
                rate: 80,
                deliveries: [{ id: deliveryId, rate: 80 }],
            });
            const list = asArray(await rateEntryService.list());
            const row = list.find((r) => r.tripId === tripId);
            assert.ok(row, "trip should still be listed after save, before lock");
            assert.equal(row.rateStatus, "Entered");
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
            await rateEntryService.create({ tripId, rate: 90, deliveries: [{ id: deliveryId, rate: 90 }] });
            const locked = await rateEntryService.lock(tripId, { lockedBy: "tester" });
            assert.equal(locked.locked, true);
            assert.equal(locked.lockedBy, "tester");
            assert.ok(locked.lockedAt);
            const list = asArray(await rateEntryService.list());
            assert.ok(!list.some((r) => r.tripId === tripId), "locked trip must not reappear in Rate Entry");
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
            await rateEntryService.create({ tripId, rate: 70, deliveries: [{ id: deliveryId, rate: 70 }] });
            await rateEntryService.lock(tripId, { lockedBy: "tester" });
            const sale = await shopSalesService.getById(deliveryId);
            assert.equal(sale.tripId, tripId);
            assert.equal(sale.rate, 70);
        }
        finally {
            await cleanup(f);
        }
    });
    test("11. Locked rates cannot be modified (create/update reject with 409)", async () => {
        const f = newFixture();
        try {
            const shop = await makeShop(f, "Shop D");
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
            const deliveryId = await addDelivery(tripId, { shopId: shop.id, shopName: "Shop D", birds: 100, weight: 200 });
            const created = await rateEntryService.create({ tripId, rate: 60, deliveries: [{ id: deliveryId, rate: 60 }] });
            await rateEntryService.lock(tripId, { lockedBy: "tester" });
            await assert.rejects(() => rateEntryService.create({ tripId, rate: 65, deliveries: [{ id: deliveryId, rate: 65 }] }), (err) => err instanceof AppError && err.status === 409);
            await assert.rejects(() => rateEntryService.update(created.id, { rate: 65 }), (err) => err instanceof AppError && err.status === 409);
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
            // Two deliveries to the same shop, only one gets a rate. Different
            // weight so the two rows don't collide with the
            // idx_trip_deliveries_no_dup_sale unique constraint (trip_id,
            // shop_id, birds, weight) — a real second delivery to the same shop.
            const d1 = await addDelivery(tripId, { shopId: shop.id, shopName: "Shop E", birds: 50, weight: 100 });
            await addDelivery(tripId, { shopId: shop.id, shopName: "Shop E-2", birds: 50, weight: 120 });
            await rateEntryService.create({ tripId, rate: 55, deliveries: [{ id: d1, rate: 55 }] });
            await assert.rejects(() => rateEntryService.lock(tripId, { lockedBy: "tester" }), (err) => err instanceof AppError && err.status === 409);
        }
        finally {
            await cleanup(f);
        }
    });
    test("14. Invalid shop/delivery cannot be saved", async () => {
        const f = newFixture();
        try {
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
            await assert.rejects(() => rateEntryService.create({ tripId, rate: 50, deliveries: [{ id: 999999999, rate: 50 }] }), (err) => err instanceof AppError && err.status === 422);
        }
        finally {
            await cleanup(f);
        }
    });
    test("15. Duplicate shop rate rows in one save are rejected", async () => {
        const f = newFixture();
        try {
            const shop = await makeShop(f, "Shop F");
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
            const deliveryId = await addDelivery(tripId, { shopId: shop.id, shopName: "Shop F", birds: 50, weight: 100 });
            await assert.rejects(() => rateEntryService.create({
                tripId,
                rate: 50,
                deliveries: [
                    { id: deliveryId, rate: 50 },
                    { id: deliveryId, rate: 55 },
                ],
            }), (err) => err instanceof AppError && err.status === 400);
        }
        finally {
            await cleanup(f);
        }
    });
    test("17. Shop Sales cannot use an unlocked trip", async () => {
        const f = newFixture();
        try {
            const shop = await makeShop(f, "Shop G");
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
            const deliveryId = await addDelivery(tripId, { shopId: shop.id, shopName: "Shop G", birds: 50, weight: 100 });
            await rateEntryService.create({ tripId, rate: 60, deliveries: [{ id: deliveryId, rate: 60 }] });
            await assert.rejects(() => shopSalesService.getById(deliveryId), (err) => err instanceof AppError && err.status === 404);
        }
        finally {
            await cleanup(f);
        }
    });
    test("Draft/Pending trips are rejected from save and lock (409)", async () => {
        const f = newFixture();
        try {
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Pending" });
            await assert.rejects(() => rateEntryService.create({ tripId, rate: 50 }), (err) => err instanceof AppError && err.status === 409);
            await assert.rejects(() => rateEntryService.lock(tripId, {}), (err) => err instanceof AppError && err.status === 409);
        }
        finally {
            await cleanup(f);
        }
    });
    test("Locking twice is rejected the second time", async () => {
        const f = newFixture();
        try {
            const shop = await makeShop(f, "Shop H");
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
            const deliveryId = await addDelivery(tripId, { shopId: shop.id, shopName: "Shop H", birds: 50, weight: 100 });
            await rateEntryService.create({ tripId, rate: 60, deliveries: [{ id: deliveryId, rate: 60 }] });
            await rateEntryService.lock(tripId, { lockedBy: "tester" });
            await assert.rejects(() => rateEntryService.lock(tripId, { lockedBy: "tester2" }), (err) => err instanceof AppError && err.status === 409);
        }
        finally {
            await cleanup(f);
        }
    });
    test("Locking without any saved rate is rejected", async () => {
        const f = newFixture();
        try {
            const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
            await assert.rejects(() => rateEntryService.lock(tripId, {}), (err) => err instanceof AppError && err.status === 409);
        }
        finally {
            await cleanup(f);
        }
    });
});
after(async () => {
    await pool.end();
});
//# sourceMappingURL=rateEntryService.test.js.map