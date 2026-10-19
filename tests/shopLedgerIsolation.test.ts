/**
 * Batch C4 — Shop Ledger two-shop isolation regression.
 *
 * Runs against a REAL, disposable PostgreSQL database (migrations applied).
 * Set C4_REAL_PG_URL to a throwaway database; without it the test skips so the
 * default suite never needs a server.
 *
 * Invariant under test:
 *   A ledger requested for shop A contains only shop A's opening balance,
 *   sales, collections, corrections and running balance. Shop B can never
 *   influence shop A — not through a row, an opening balance, a pagination
 *   page or the all-shops view.
 *
 * Fixtures are internally consistent with the product rule
 * `amount = weight × rate` (enforced by migration 086), so the sale debit is
 * exactly the amount the fixture intends.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

const url = process.env.C4_REAL_PG_URL;
if (!url) {
  describe("C4 Shop Ledger two-shop isolation (real PostgreSQL)", () => {
    it.skip("C4_REAL_PG_URL not set", () => undefined);
  });
} else {
  process.env.DATABASE_URL = url;
  const { pool } = await import("../src/config/db.js");
  const { mastersService } = await import("../src/services/mastersService.js");
  const { tripsService } = await import("../src/services/tripsService.js");
  const { rateEntryService } = await import("../src/services/rateEntryService.js");
  const { collectionEntryService } = await import("../src/services/collectionEntryService.js");
  const { shopLedgerService } = await import("../src/services/shopLedgerService.js");
  const { recalcTripDeliveryTotals } = await import("../src/utils/tripDeliverySync.js");
  const { applyCorrection } = await import("../src/utils/shopLedger.js");
  const { withTransaction } = await import("../src/config/db.js");
  const { startApp } = await import("./helpers/app.js");

  const app = await startApp({ DATABASE_URL: url });

  after(async () => {
    await app.close();
    await pool.end();
  });

  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const runBase = Number(suffix.slice(-6));
  let seq = 0;
  /** 10-digit phone that stays unique across repeated runs on the same database. */
  const phone = (prefix: string) => `${prefix}${String((runBase + seq * 37) % 10_000_000).padStart(7, "0")}`;

  async function seedShop(opening: number, label: string) {
    seq += 1;
    const shop = await mastersService.upsertShop({
      shopName: `ISO ${label} ${suffix}`,
      ownerName: "Owner",
      phoneNumber: phone("975"),
      village: "Village",
      address: "Address",
      status: "Active",
      openingBalance: opening,
    });
    await pool.query(
      `UPDATE shops SET opening_balance = $2, current_balance = $2 WHERE id = $1`,
      [shop.id, opening]
    );
    return { id: shop.id, name: shop.shopName };
  }

  async function seedSupport(label: string) {
    seq += 1;
    const vehicle = await mastersService.upsertVehicle({
      vehicleNumber: `ISOV${String(seq).padStart(2, "0")}${suffix.slice(-6)}`,
      vehicleType: "Lorry",
      noOfBoxes: 85,
      birdCapacity: 50000,
      capacityKg: 60000,
      engineNumber: `ISOE${seq}${suffix}`,
      chassisNumber: `ISOC${seq}${suffix}`,
      status: "Active",
    });
    const driver = await mastersService.upsertEmployee({
      employeeName: `ISO Driver ${label} ${seq} ${suffix}`,
      department: "Driver",
      role: "Driver",
      phoneNumber: phone("934"),
      licenseNumber: `ISODL${seq}${suffix}`,
      salary: 18000,
      status: "Active",
    });
    const supervisor = await mastersService.upsertEmployee({
      employeeName: `ISO Sup ${label} ${seq} ${suffix}`,
      department: "Supervisor",
      role: "Supervisor",
      phoneNumber: phone("944"),
      salary: 24000,
      status: "Active",
    });
    const farm = await mastersService.upsertFarm({
      farmName: `ISO Farm ${label} ${seq} ${suffix}`,
      ownerName: "Owner X",
      supervisorName: "Supervisor X",
      phoneNumber: phone("968"),
      village: "V",
      address: "A",
      capacity: 300000,
      status: "Active",
    });
    return { vehicle, driver, supervisor, farm };
  }

  /** Shop with exactly one captured sale: amount === weight × rate. */
  async function seedShopWithSale(
    label: string,
    opening: number,
    saleAmount: number,
    saleDate: string
  ) {
    const weight = 500;
    const rate = Number((saleAmount / weight).toFixed(2));
    assert.equal(Number((weight * rate).toFixed(2)), saleAmount, "fixture must satisfy amount = weight × rate");
    const shop = await seedShop(opening, label);
    const sup = await seedSupport(label);
    const trip = await tripsService.save(null, {
      tripNo: `ISO-TRIP-${label}-${suffix}-${seq}`,
      tripDate: saleDate,
      status: "Completed",
      startTime: `${saleDate}T05:30:00.000Z`,
      vehicleId: sup.vehicle.id,
      vehicleNo: sup.vehicle.vehicleNumber,
      driverId: sup.driver.id,
      driverName: sup.driver.employeeName,
      supervisorId: sup.supervisor.id,
      supervisorName: sup.supervisor.employeeName,
      sourceFarmId: sup.farm.id,
      sourceFarm: sup.farm.farmName,
      openingMeter: 1000,
      startStepSubmitted: true,
      farmStepSubmitted: true,
      pickupStepSubmitted: true,
      deliveryStepSubmitted: true,
      expensesStepSubmitted: true,
      totalKm: 60,
      totalBirds: 1000,
      dcWeight: 1800,
    } as unknown as Record<string, unknown>);
    const delivery = await pool.query<{ id: number }>(
      `INSERT INTO trip_deliveries
         (trip_id, sale_no, shop_id, shop_name, birds, weight, mortality, rate, amount)
       VALUES ($1, $2, $3, $4, 300, $5, 0, $6, $7)
       RETURNING id`,
      [trip.id, `ISO-SALE-${label}-${suffix}`, shop.id, shop.name, weight, rate, saleAmount]
    );
    await recalcTripDeliveryTotals(pool as never, trip.id);
    const lock = await rateEntryService.lock(trip.id, { lockedBy: "c4-isolation" });
    assert.ok(lock.rateLocked, "trip must be rate-locked to expose Shop Sales");
    await pool.query(`UPDATE trips SET approved_at = NOW() WHERE id = $1`, [trip.id]);
    return { shop, tripId: trip.id, deliveryId: delivery.rows[0].id, saleAmount };
  }

  const shopA = await seedShopWithSale("A", 10000, 5000, "2026-08-06");
  const shopB = await seedShopWithSale("B", 100000, 25000, "2026-08-07");

  function assertOnlyShop(
    rows: Array<{ shopId: number | null }>,
    shopId: number,
    label: string
  ) {
    for (const row of rows) {
      assert.equal(row.shopId, shopId, `${label}: row belongs to another shop`);
    }
  }

  /** Every sale/collection row must point at the requesting shop's own sources. */
  function assertOwnReferences(
    rows: Array<{ referenceType: string; referenceId: number }>,
    shop: { tripId: number; deliveryId: number },
    label: string
  ) {
    for (const row of rows) {
      if (row.referenceType === "trip") {
        assert.equal(row.referenceId, shop.tripId, `${label}: trip reference belongs to another shop`);
      } else if (row.referenceType === "shop_sale") {
        assert.equal(row.referenceId, shop.deliveryId, `${label}: sale reference belongs to another shop`);
      }
    }
  }

  describe("C4 Shop Ledger two-shop isolation (real PostgreSQL)", () => {
    it("1. shop A alone: opening 10,000 and only A's 5,000 sale", async () => {
      const ledger = await shopLedgerService.list({
        shopId: shopA.shop.id,
        fromDate: "2026-08-01",
        toDate: "2026-08-31",
      });
      assert.equal(ledger.openingBalance, 10000, "opening = A's own opening balance");
      assert.equal(ledger.data.length, 1, "exactly one row for A");
      assertOnlyShop(ledger.data, shopA.shop.id, "A full range");
      assert.equal(ledger.data[0].type, "sale");
      assert.equal(ledger.data[0].debit, 5000, "sale debit is A's own amount");
      assert.equal(ledger.data[0].balance, 15000, "running balance = 10,000 + 5,000");
      assertOwnReferences(ledger.data, shopA, "A full range");
    });

    it("2. shop A late range: opening 15,000 includes pre-range history, sale row excluded", async () => {
      const late = await shopLedgerService.list({
        shopId: shopA.shop.id,
        fromDate: "2026-08-08",
        toDate: "2026-08-31",
      });
      assert.equal(late.openingBalance, 15000, "opening = own opening + own pre-range sale");
      assert.equal(late.data.length, 0, "no in-range rows for A");
    });

    it("3. shop B alone: only B's opening and B's 25,000 sale", async () => {
      const ledger = await shopLedgerService.list({
        shopId: shopB.shop.id,
        fromDate: "2026-08-07",
        toDate: "2026-08-31",
      });
      assert.equal(ledger.openingBalance, 100000);
      assert.equal(ledger.data.length, 1);
      assertOnlyShop(ledger.data, shopB.shop.id, "B range");
      assert.equal(ledger.data[0].debit, 25000);
      assert.equal(ledger.data[0].balance, 125000);
      assertOwnReferences(ledger.data, shopB, "B range");
    });

    it("4. all shops: every shop gets its own independent opening", async () => {
      const all = await shopLedgerService.list({
        fromDate: "2026-08-08",
        toDate: "2026-08-31",
      });
      const openingA = all.openingBalances?.find((row) => row.shopId === shopA.shop.id);
      const openingB = all.openingBalances?.find((row) => row.shopId === shopB.shop.id);
      assert.ok(openingA && openingB, "all-shops response carries both shops");
      assert.equal(openingA.openingBalance, 15000, "A's all-shops opening equals A's single opening");
      assert.equal(openingB.openingBalance, 125000, "B's all-shops opening equals B's single opening");

      const singleA = await shopLedgerService.list({
        shopId: shopA.shop.id, fromDate: "2026-08-08", toDate: "2026-08-31",
      });
      const singleB = await shopLedgerService.list({
        shopId: shopB.shop.id, fromDate: "2026-08-08", toDate: "2026-08-31",
      });
      assert.equal(openingA.openingBalance, singleA.openingBalance);
      assert.equal(openingB.openingBalance, singleB.openingBalance);
    });

    it("5. HTTP API returns the same per-shop isolation as the service", async () => {
      const resA = await fetch(
        `${app.baseUrl}/api/operations/shop-ledger?shopId=${shopA.shop.id}&fromDate=2026-08-01&toDate=2026-08-31`,
        { headers: app.authHeaders }
      );
      assert.equal(resA.status, 200);
      const bodyA = (await resA.json()) as {
        shopId: number;
        openingBalance: number;
        data: Array<{ shopId: number | null; debit: number; referenceId: number }>;
      };
      assert.equal(bodyA.shopId, shopA.shop.id);
      assert.equal(bodyA.openingBalance, 10000);
      assert.equal(bodyA.data.length, 1);
      assertOnlyShop(bodyA.data, shopA.shop.id, "HTTP A");
      assert.equal(bodyA.data[0].debit, 5000);

      const resAll = await fetch(
        `${app.baseUrl}/api/operations/shop-ledger?fromDate=2026-08-08&toDate=2026-08-31`,
        { headers: app.authHeaders }
      );
      assert.equal(resAll.status, 200);
      const bodyAll = (await resAll.json()) as {
        openingBalances: Array<{ shopId: number; openingBalance: number }>;
      };
      assert.equal(
        bodyAll.openingBalances.find((row) => row.shopId === shopA.shop.id)?.openingBalance,
        15000
      );
      assert.equal(
        bodyAll.openingBalances.find((row) => row.shopId === shopB.shop.id)?.openingBalance,
        125000
      );
    });

    it("6. pagination never changes totals, opening or shop isolation", async () => {
      const full = await shopLedgerService.list({
        shopId: shopA.shop.id, fromDate: "2026-08-01", toDate: "2026-08-31",
      });
      const page1 = await shopLedgerService.list({
        shopId: shopA.shop.id, fromDate: "2026-08-01", toDate: "2026-08-31",
        pagination: { page: 1, limit: 1, offset: 0 },
      });
      assert.equal(page1.openingBalance, full.openingBalance);
      assert.equal(page1.meta?.total, full.data.length);
      assertOnlyShop(page1.data, shopA.shop.id, "page 1");
      assert.equal(page1.data[0].balance, full.data[0].balance, "page balance matches full ledger");
    });

    it("7. a pending collection is excluded and an approved credit is added once, to A only", async () => {
      const before = await shopLedgerService.list({
        shopId: shopA.shop.id, fromDate: "2026-08-01", toDate: "2026-08-31",
      });
      const collection = await collectionEntryService.create({
        collectionDate: "2026-08-20",
        shopId: shopA.shop.id,
        amount: 2000,
        collector: "C4",
      });
      const pending = await shopLedgerService.list({
        shopId: shopA.shop.id, fromDate: "2026-08-01", toDate: "2026-08-31",
      });
      assert.equal(pending.data.length, before.data.length, "pending collection is not a ledger credit");

      await collectionEntryService.approve(collection.id);
      const approved = await shopLedgerService.list({
        shopId: shopA.shop.id, fromDate: "2026-08-01", toDate: "2026-08-31",
      });
      const credits = approved.data.filter(
        (row) => row.type === "collection" && row.referenceId === collection.id
      );
      assert.equal(credits.length, 1, "approved collection appears exactly once");
      assert.equal(credits[0].credit, 2000);
      assert.equal(credits[0].balance, 13000, "10,000 + 5,000 − 2,000");

      const b = await shopLedgerService.list({
        shopId: shopB.shop.id, fromDate: "2026-08-01", toDate: "2026-08-31",
      });
      assert.equal(b.openingBalance, 100000, "B's opening is untouched by A's collection");
      assert.equal(b.data.length, 1);
      assert.equal(b.data[0].balance, 125000, "B's balance is untouched by A's collection");
    });

    it("8. a correction on A's sale changes A only and never duplicates the row", async () => {
      await withTransaction(async (client) => {
        await applyCorrection(
          client,
          shopA.shop.id,
          {
            entryDate: "2026-08-06",
            entryType: "correction",
            referenceType: "shop_sale",
            referenceId: shopA.deliveryId,
            note: "C4 correction",
          },
          500
        );
      });
      const a = await shopLedgerService.list({
        shopId: shopA.shop.id, fromDate: "2026-08-01", toDate: "2026-08-31",
      });
      const saleRows = a.data.filter((row) => row.type === "sale");
      assert.equal(saleRows.length, 1, "correction merges into the single sale row");
      assert.equal(saleRows[0].debit, 5500, "5,000 sale + 500 correction");

      const b = await shopLedgerService.list({
        shopId: shopB.shop.id, fromDate: "2026-08-01", toDate: "2026-08-31",
      });
      assert.equal(b.data.length, 1);
      assert.equal(b.data[0].debit, 25000, "B's sale is unchanged by A's correction");
    });

    it("9. direct SQL: ledger rows and current_balance are per shop", async () => {
      const rows = await pool.query<{ shop_id: number; total: string }>(
        `SELECT shop_id, SUM(debit - credit)::text AS total
           FROM shop_ledger
          WHERE shop_id = ANY($1::bigint[])
          GROUP BY shop_id`,
        [[shopA.shop.id, shopB.shop.id]]
      );
      const byShop = new Map(rows.rows.map((row) => [Number(row.shop_id), Number(row.total)]));
      assert.equal(byShop.get(shopA.shop.id), 5500 - 2000, "A: +5,000 sale +500 correction −2,000 credit");
      assert.equal(byShop.get(shopB.shop.id), 25000, "B: +25,000 sale only");

      const balances = await pool.query<{ id: number; expected: string; actual: string }>(
        `SELECT s.id,
                (s.opening_balance + COALESCE(SUM(l.debit - l.credit), 0))::text AS expected,
                s.current_balance::text AS actual
           FROM shops s
           LEFT JOIN shop_ledger l ON l.shop_id = s.id
          WHERE s.id = ANY($1::bigint[])
          GROUP BY s.id, s.opening_balance, s.current_balance`,
        [[shopA.shop.id, shopB.shop.id]]
      );
      for (const row of balances.rows) {
        assert.equal(Number(row.actual), Number(row.expected), `current_balance drift on shop ${row.id}`);
      }

      const foreign = await pool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n
           FROM shop_ledger l
           JOIN trip_deliveries d ON d.id = l.reference_id AND l.reference_type = 'shop_sale'
          WHERE l.shop_id = $1 AND d.shop_id <> $1`,
        [shopA.shop.id]
      );
      assert.equal(Number(foreign.rows[0].n), 0, "A has no ledger row pointing at another shop's delivery");
    });
  });
}
