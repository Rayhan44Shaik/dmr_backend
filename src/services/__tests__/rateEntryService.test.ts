import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../config/db.js";
import { AppError } from "../../middleware/errorHandler.js";
import { rateEntryService } from "../rateEntryService.js";
import { shopSalesService } from "../shopSalesService.js";
import type { RateEntryTrip } from "../../types/operations.js";
import type { PaginatedResult } from "../../utils/pagination.js";

let uniqSeq = 0;
const uniqBase = (Date.now() % 1_000_000) * 1000 + Math.floor(Math.random() * 1000);
function uniqueInt(): number {
  return uniqBase + ++uniqSeq;
}

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
  const n = uniqueInt();
  const phone = `9${String(n).slice(-9).padStart(9, "0")}`;
  const r = await pool.query<{ id: number }>(
    `INSERT INTO shops (shop_no, shop_number, shop_name, phone_number)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [n, String(n), name, phone]
  );
  f.shopIds.push(r.rows[0].id);
  return r.rows[0];
}

async function makeTrip(
  f: Fixture,
  opts: { tripNo: string; status: "Draft" | "Pending" | "Completed" | "Deleted"; deleted?: boolean }
): Promise<number> {
  const t = await pool.query<{ id: number }>(
    `INSERT INTO trips (trip_no, trip_date, status, deleted, total_birds, dc_weight)
     VALUES ($1, CURRENT_DATE, $2::trip_status, $3, 1000, 2000)
     RETURNING id`,
    [opts.tripNo, opts.status, opts.deleted ?? false]
  );
  const tripId = t.rows[0].id;
  f.tripIds.push(tripId);
  return tripId;
}

async function addDelivery(
  tripId: number,
  opts: { shopId: number | null; shopName: string; birds: number; weight: number }
): Promise<number> {
  const d = await pool.query<{ id: number }>(
    `INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, birds, weight, rate)
     VALUES ($1, $2, $3, $4, $5, $6, NULL)
     RETURNING id`,
    [tripId, `SALE-${uniqueInt()}`, opts.shopId, opts.shopName, opts.birds, opts.weight]
  );
  return d.rows[0].id;
}

function asArray<T>(r: T[] | PaginatedResult<T>): T[] {
  return Array.isArray(r) ? r : r.data;
}

describe("rateEntryService", () => {
  test("1. Pending trip does NOT appear in Rate Entry", async () => {
    const f = newFixture();
    try {
      const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Pending" });
      const list = asArray(await rateEntryService.list());
      assert.ok(!list.some((r) => r.id === tripId));
    } finally {
      await cleanup(f);
    }
  });

  test("2. Draft trip does NOT appear in Rate Entry", async () => {
    const f = newFixture();
    try {
      const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Draft" });
      const list = asArray(await rateEntryService.list());
      assert.ok(!list.some((r) => r.id === tripId));
    } finally {
      await cleanup(f);
    }
  });

  test("3. Completed trip appears in Rate Entry", async () => {
    const f = newFixture();
    try {
      const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
      const list = asArray(await rateEntryService.list());
      assert.ok(list.some((r) => r.id === tripId));
    } finally {
      await cleanup(f);
    }
  });

  test("4. Deleted trip does NOT appear", async () => {
    const f = newFixture();
    try {
      const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed", deleted: true });
      const list = asArray(await rateEntryService.list());
      assert.ok(!list.some((r) => r.id === tripId));
    } finally {
      await cleanup(f);
    }
  });

  test("5. Completed trip with no rates appears (not yet rate-locked)", async () => {
    const f = newFixture();
    try {
      const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
      const list = asArray(await rateEntryService.list());
      const row = list.find((r) => r.id === tripId) as RateEntryTrip;
      assert.ok(row);
      assert.equal(row.rateLocked, false);
    } finally {
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
      const row = list.find((r) => r.id === tripId) as RateEntryTrip;
      assert.ok(row, "trip should still be listed after save, before lock");
      assert.equal(row.ratesEntered, 1);
      assert.equal(row.rateLocked, false);
    } finally {
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
    } finally {
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
    } finally {
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

      await assert.rejects(
        () => rateEntryService.save(tripId, { rates: [{ deliveryId, rate: 65 }] }),
        (err: unknown) => err instanceof AppError && err.status === 409
      );
      await assert.rejects(
        () => rateEntryService.lock(tripId, { lockedBy: "tester" }),
        (err: unknown) => err instanceof AppError && err.status === 409
      );
    } finally {
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

      await assert.rejects(
        () => rateEntryService.lock(tripId, { lockedBy: "tester" }),
        (err: unknown) => err instanceof AppError && err.status === 422
      );
    } finally {
      await cleanup(f);
    }
  });

  test("14. Invalid shop/delivery cannot be saved", async () => {
    const f = newFixture();
    try {
      const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
      await assert.rejects(
        () => rateEntryService.save(tripId, { rates: [{ deliveryId: 999999999, rate: 50 }] }),
        (err: unknown) => err instanceof AppError && err.status === 422
      );
    } finally {
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

      await assert.rejects(
        () => shopSalesService.getById(deliveryId),
        (err: unknown) => err instanceof AppError && err.status === 404
      );
    } finally {
      await cleanup(f);
    }
  });

  test("Draft/Pending trips are rejected from save and lock", async () => {
    const f = newFixture();
    try {
      const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Pending" });
      await assert.rejects(
        () => rateEntryService.save(tripId, { rates: [] }),
        (err: unknown) => err instanceof AppError && (err.status === 404 || err.status === 422)
      );
      await assert.rejects(
        () => rateEntryService.lock(tripId, {}),
        (err: unknown) => err instanceof AppError && (err.status === 404 || err.status === 422)
      );
    } finally {
      await cleanup(f);
    }
  });

  test("Locking twice is rejected the second time", async () => {
    const f = newFixture();
    try {
      const shop = await makeShop(f, "Shop H");
      const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
      const deliveryId = await addDelivery(tripId, { shopId: shop.id, shopName: "Shop H", birds: 50, weight: 100 });

      await rateEntryService.save(tripId, { rates: [{ deliveryId, rate: 60 }] });
      await rateEntryService.lock(tripId, { lockedBy: "tester" });

      await assert.rejects(
        () => rateEntryService.lock(tripId, { lockedBy: "tester2" }),
        (err: unknown) => err instanceof AppError && err.status === 409
      );
    } finally {
      await cleanup(f);
    }
  });

  test("Rate Entry includes captured [ORDER] shops and excludes empty plan stubs", async () => {
    const f = newFixture();
    try {
      const shopA = await makeShop(f, "Order Captured Shop");
      const shopB = await makeShop(f, "Pending Plan Shop");
      const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });

      const capturedId = await addDelivery(tripId, {
        shopId: shopA.id,
        shopName: "Order Captured Shop",
        birds: 54,
        weight: 136.8,
      });
      await pool.query(
        `UPDATE trip_deliveries
            SET remarks = $2, auto_capture_time = $3
          WHERE id = $1`,
        [capturedId, "[ORDER] O:TR-TEST-ORD", "2026-09-18T10:05:00+05:30"]
      );

      await pool.query(
        `INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, birds, weight, remarks)
         VALUES ($1, $2, $3, $4, 0, 0, $5)`,
        [tripId, `SALE-${uniqueInt()}`, shopB.id, "Pending Plan Shop", "[ORDER] O:TR-TEST-ORD"]
      );

      const detail = await rateEntryService.getById(tripId);
      assert.equal(detail.deliveries.length, 1);
      assert.equal(detail.deliveries[0].shopName, "Order Captured Shop");
      assert.ok(detail.deliveries[0].remarks.startsWith("[ORDER]"));
      assert.ok(detail.deliveries[0].autoCaptureTime);

      await rateEntryService.save(tripId, {
        rates: [{ deliveryId: capturedId, rate: 95 }],
      });
      const locked = await rateEntryService.lock(tripId, { lockedBy: "tester" });
      assert.equal(locked.rateLocked, true);
    } finally {
      await cleanup(f);
    }
  });

  test("Locking a trip with no deliveries is rejected", async () => {
    const f = newFixture();
    try {
      const tripId = await makeTrip(f, { tripNo: `RT-${uniqueInt()}`, status: "Completed" });
      await assert.rejects(
        () => rateEntryService.lock(tripId, {}),
        (err: unknown) => err instanceof AppError && err.status === 422
      );
    } finally {
      await cleanup(f);
    }
  });
});

after(async () => {
  await pool.end();
});
