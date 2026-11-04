/**
 * Mortality analysis — multi-load coverage.
 *
 * One row per completed trip; every total must equal the sum of the trip's
 * eligible submitted loads, and `trip weightLoss = SUM(load weightLoss)`.
 * No mocks: service → PostgreSQL (PGlite) → assertions.
 *
 * Canonical fixture (spec section "Use exact fixtures"):
 *   Load 1: farm 1000 birds / 2500 kg, delivered 995 / 2480,
 *           box MOR 3 birds / 7 kg, weight-mode MOR 2 birds, WL 13
 *   Load 2: farm 600 birds / 1500 kg, delivered 596 / 1480,
 *           box MOR 4 birds / 8 kg, weight-mode MOR 0, WL 12
 *   Trip:   farm 1600 / 4000, delivered 1591 / 3960, MOR 9, MOR kg 15, WL 25
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");
const { mortalityAnalysisService } = await import("../src/services/mortalityAnalysisService.js");

after(async () => {
  await testDb.close();
  await pool.end();
});

let seq = 0;
const DAY = "2026-05-01";

async function seedShop(tag: string) {
  seq += 1;
  return mastersService.upsertShop({
    shopName: `MM Shop ${tag}${seq}`,
    ownerName: "Owner",
    phoneNumber: `9755${String(seq).padStart(6, "0")}`,
    village: "Village",
    address: "Addr",
    status: "Active",
    openingBalance: 0,
  });
}

async function seedTrip(opts: {
  date?: string;
  sourceFarm: string;
  totalBirds: number;
  dcWeight: number;
  supervisor?: string;
}): Promise<number> {
  seq += 1;
  const result = await pool.query<{ id: number }>(
    `INSERT INTO trips (
       trip_no, trip_date, status, deleted, expenses_step_submitted,
       source_farm, supervisor_name, driver_name, vehicle_no,
       total_birds, dc_weight
     ) VALUES ($1, $2::date, 'Completed', FALSE, TRUE, $3, $4, 'Driver', 'AP09MM0001', $5, $6)
     RETURNING id`,
    [`MM-TRIP-${seq}`, opts.date ?? DAY, opts.sourceFarm, opts.supervisor ?? "MM Sup", opts.totalBirds, opts.dcWeight]
  );
  return result.rows[0].id;
}

async function seedLeg(
  tripId: number,
  legIndex: number,
  opts: { farm: string; birds: number; weight: number; submitted?: boolean }
): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO trip_legs (
       trip_id, leg_index, source_farm, total_birds, dc_weight,
       farm_step_submitted, pickup_step_submitted
     ) VALUES ($1, $2, $3, $4, $5, TRUE, $6)
     RETURNING id`,
    [tripId, legIndex, opts.farm, opts.birds, opts.weight, opts.submitted ?? true]
  );
  return result.rows[0].id;
}

async function seedDelivery(
  tripId: number,
  shop: { id: number; shopName: string },
  opts: {
    birds: number;
    weight: number;
    mortality?: number;
    mortKg?: number;
    mode?: "box" | "weight";
    legId?: number | null;
    deleted?: boolean;
  }
): Promise<number> {
  seq += 1;
  const result = await pool.query<{ id: number }>(
    `INSERT INTO trip_deliveries (
       trip_id, leg_id, sale_no, shop_id, shop_name, birds, weight,
       mortality, mort_kg, delivery_mode, rate, amount, deleted
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 60, 0, $11)
     RETURNING id`,
    [
      tripId,
      opts.legId ?? null,
      `MM-SALE-${seq}`,
      shop.id,
      shop.shopName,
      opts.birds,
      opts.weight,
      opts.mortality ?? 0,
      opts.mortKg ?? 0,
      opts.mode ?? "box",
      opts.deleted ?? false,
    ]
  );
  return result.rows[0].id;
}

const FARM_A = "MM Farm A";
const FARM_B = "MM Farm B";

interface Fixture {
  tripId: number;
  leg1: number;
  leg2: number;
}

async function seedCanonicalFixture(): Promise<Fixture> {
  const shop1 = await seedShop("C1");
  const shop2 = await seedShop("C2");
  const tripId = await seedTrip({ sourceFarm: FARM_A, totalBirds: 1000, dcWeight: 2500 });
  const leg1 = await seedLeg(tripId, 1, { farm: FARM_A, birds: 1000, weight: 2500 });
  const leg2 = await seedLeg(tripId, 2, { farm: FARM_B, birds: 600, weight: 1500 });
  await seedDelivery(tripId, shop1, { birds: 995, weight: 2480, mortality: 3, mortKg: 7, legId: leg1 });
  await seedDelivery(tripId, shop1, { birds: 0, weight: 0, mortality: 2, mortKg: 0, mode: "weight", legId: leg1 });
  await seedDelivery(tripId, shop2, { birds: 596, weight: 1480, mortality: 4, mortKg: 8, legId: leg2 });
  await seedDelivery(tripId, shop1, { birds: 50, weight: 100, mortality: 5, mortKg: 10, legId: leg1, deleted: true });
  return { tripId, leg1, leg2 };
}

async function findRow(tripId: number) {
  const listed = await mortalityAnalysisService.list({});
  const row = listed.data.find((candidate) => candidate.tripId === tripId);
  assert.ok(row, `trip ${tripId} must be listed`);
  return { row, listed };
}

describe("Mortality analysis multi-load", () => {
  it("1. single-load trip remains unchanged with a one-entry Load 1 fallback", async () => {
    const shop = await seedShop("S1");
    const tripId = await seedTrip({ date: "2026-05-02", sourceFarm: "MM Solo Farm", totalBirds: 1000, dcWeight: 1500 });
    await seedDelivery(tripId, shop, { birds: 600, weight: 1000, mortality: 15, mortKg: 30 });
    const { row } = await findRow(tripId);
    assert.equal(row.farmBirds, 1000);
    assert.equal(row.farmWeight, 1500);
    assert.equal(row.deliveredBirds, 600);
    assert.equal(row.deliveredWeight, 1000);
    assert.equal(row.mortalityCount, 15);
    assert.equal(row.mortalityWeight, 30);
    assert.equal(row.weightLoss, 470);
    assert.equal(row.loads.length, 1, "single-load trips carry exactly one load entry");
    assert.equal(row.loads[0].load, 1);
    assert.equal(row.loads[0].weightLoss, 470);
    assert.equal(row.loads[0].mortalityCount, 15);
  });

  it("2. two submitted loads appear in loads in leg-index order", async () => {
    const { tripId, leg1, leg2 } = await seedCanonicalFixture();
    const { row } = await findRow(tripId);
    assert.equal(row.loads.length, 2);
    assert.deepEqual(row.loads.map((load) => load.load), [1, 2]);
    assert.ok(row.loads[0].legId === leg1 && row.loads[1].legId === leg2, "load identity follows trip_legs.id");
  });

  it("3. draft/unsubmitted Load 2 is excluded", async () => {
    const shop = await seedShop("D1");
    const tripId = await seedTrip({ date: "2026-05-03", sourceFarm: "MM Draft Farm", totalBirds: 500, dcWeight: 1000 });
    const leg1 = await seedLeg(tripId, 1, { farm: "MM Draft Farm", birds: 500, weight: 1000 });
    const draftLeg = await seedLeg(tripId, 2, { farm: "MM Draft Farm B", birds: 400, weight: 800, submitted: false });
    await seedDelivery(tripId, shop, { birds: 490, weight: 970, mortality: 2, mortKg: 4, legId: leg1 });
    await seedDelivery(tripId, shop, { birds: 390, weight: 770, mortality: 1, mortKg: 2, legId: draftLeg });
    const { row } = await findRow(tripId);
    assert.equal(row.loads.length, 1, "unsubmitted Load 2 must not appear");
    assert.equal(row.farmBirds, 500);
    assert.equal(row.deliveredBirds, 490);
    assert.equal(row.weightLoss, 1000 - 970 - 4);
  });

  it("4. each load uses its own farm birds and farm weight", async () => {
    const { tripId } = await seedCanonicalFixture();
    const { row } = await findRow(tripId);
    assert.equal(row.loads[0].farmBirds, 1000);
    assert.equal(row.loads[0].farmWeight, 2500);
    assert.equal(row.loads[1].farmBirds, 600);
    assert.equal(row.loads[1].farmWeight, 1500);
    assert.equal(row.farmBirds, 1600);
    assert.equal(row.farmWeight, 4000);
  });

  it("5. deliveries are assigned through leg_id", async () => {
    const { tripId, leg1, leg2 } = await seedCanonicalFixture();
    const { row } = await findRow(tripId);
    void leg1;
    void leg2;
    assert.equal(row.deliveredBirds, 1591, "only eligible leg deliveries count, nothing invented");
    assert.equal(row.deliveredWeight, 3960);
  });

  it("6. Load 1 delivered totals are correct", async () => {
    const { tripId } = await seedCanonicalFixture();
    const { row } = await findRow(tripId);
    assert.equal(row.loads[0].deliveredBirds, 995);
    assert.equal(row.loads[0].deliveredWeight, 2480);
  });

  it("7. Load 2 delivered totals are correct", async () => {
    const { tripId } = await seedCanonicalFixture();
    const { row } = await findRow(tripId);
    assert.equal(row.loads[1].deliveredBirds, 596);
    assert.equal(row.loads[1].deliveredWeight, 1480);
  });

  it("8. box-mode mortality is grouped per load", async () => {
    const { tripId } = await seedCanonicalFixture();
    const { row } = await findRow(tripId);
    assert.equal(row.loads[0].boxMortalityCount, 3);
    assert.equal(row.loads[0].boxMortalityWeight, 7);
    assert.equal(row.loads[1].boxMortalityCount, 4);
    assert.equal(row.loads[1].boxMortalityWeight, 8);
    assert.equal(row.boxMortalityCount, 7);
    assert.equal(row.boxMortalityWeight, 15);
  });

  it("9. weight-mode mortality is grouped per load and never reports mortality kg", async () => {
    const { tripId } = await seedCanonicalFixture();
    const { row } = await findRow(tripId);
    assert.equal(row.loads[0].weightModeMortalityCount, 2);
    assert.equal(row.loads[0].weightModeMortalityWeight, 0);
    assert.equal(row.loads[1].weightModeMortalityCount, 0);
    assert.equal(row.loads[1].weightModeMortalityWeight, 0);
    assert.equal(row.weightModeMortalityCount, 2);
    assert.equal(row.weightModeMortalityWeight, 0);
    assert.equal(row.mortalityCount, 9);
    assert.equal(row.mortalityWeight, 15, "recognized mortality kg is box-mode only");
  });

  it("10. deleted deliveries are excluded", async () => {
    const { tripId } = await seedCanonicalFixture();
    const { row } = await findRow(tripId);
    assert.equal(row.deliveredBirds, 1591, "50 deleted birds must not leak in");
    assert.equal(row.mortalityCount, 9, "5 deleted mortality birds must not leak in");
  });

  it("11. per-load weight loss is non-negative", async () => {
    const { tripId } = await seedCanonicalFixture();
    const { row } = await findRow(tripId);
    assert.equal(row.loads[0].weightLoss, 13);
    assert.equal(row.loads[1].weightLoss, 12);
    assert.ok(row.loads.every((load) => load.weightLoss >= 0));
  });

  it("12. trip weight loss equals the sum of load weight losses", async () => {
    const { tripId } = await seedCanonicalFixture();
    const { row } = await findRow(tripId);
    assert.equal(row.weightLoss, 25);
    assert.equal(row.weightLoss, row.loads.reduce((sum, load) => sum + load.weightLoss, 0));
  });

  it("13. trip percentages derive from aggregates, never averaged", async () => {
    const { tripId } = await seedCanonicalFixture();
    const { row } = await findRow(tripId);
    const fromAggregates = Number(((row.mortalityCount / row.farmBirds) * 100).toFixed(2));
    assert.equal(row.mortalityPercentage, fromAggregates);
    assert.equal(row.mortalityPercentage, 0.56);
    const wlFromAggregates = Number(((row.weightLoss / row.farmWeight) * 100).toFixed(2));
    assert.equal(row.weightLossPercentage, wlFromAggregates);
    const naiveAverage =
      (row.loads[0].weightLossPercentage + row.loads[1].weightLossPercentage) / 2;
    assert.notEqual(row.weightLossPercentage, Number(naiveAverage.toFixed(2)));
    assert.equal(row.survivalRate, (row.farmBirds - row.mortalityCount) / row.farmBirds);
  });

  it("14. KPI totals equal the sum of canonical trip rows", async () => {
    const { listed } = await findRow((await seedCanonicalFixture()).tripId);
    const sum = (pick: (row: (typeof listed.data)[number]) => number) =>
      listed.data.reduce((total, row) => total + pick(row), 0);
    assert.equal(listed.kpis.totalTrips, listed.data.length);
    assert.equal(listed.kpis.farmBirds, sum((row) => row.farmBirds));
    assert.equal(listed.kpis.farmWeight, sum((row) => row.farmWeight));
    assert.equal(listed.kpis.deliveredBirds, sum((row) => row.deliveredBirds));
    assert.equal(listed.kpis.deliveredWeight, sum((row) => row.deliveredWeight));
    assert.equal(listed.kpis.mortalityCount, sum((row) => row.mortalityCount));
    assert.equal(listed.kpis.mortalityWeight, sum((row) => row.mortalityWeight));
    assert.equal(listed.kpis.weightLoss, sum((row) => row.weightLoss));
  });

  it("15. farm filter matches a Load 2 farm", async () => {
    const { tripId } = await seedCanonicalFixture();
    const filtered = await mortalityAnalysisService.list({ farm: FARM_B });
    assert.ok(
      filtered.data.some((row) => row.tripId === tripId),
      "filtering by the Load 2 farm must find the trip"
    );
  });

  it("16. filter options include Load 2 farms", async () => {
    await seedCanonicalFixture();
    const listed = await mortalityAnalysisService.list({ fromDate: DAY, toDate: DAY });
    assert.ok(listed.filterOptions.farms.includes(FARM_B));
    assert.ok(listed.filterOptions.farms.includes(FARM_A));
  });

  it("17. legacy null-leg deliveries use the Load 1 fallback without duplication", async () => {
    const shop = await seedShop("L1");
    const tripId = await seedTrip({ date: "2026-05-04", sourceFarm: "MM Legacy Farm", totalBirds: 1000, dcWeight: 2500 });
    await seedDelivery(tripId, shop, { birds: 995, weight: 2480, mortality: 3, mortKg: 7 });
    await seedDelivery(tripId, shop, { birds: 0, weight: 0, mortality: 2, mortKg: 0, mode: "weight" });
    const { row } = await findRow(tripId);
    assert.equal(row.loads.length, 1, "legacy trips collapse to one load entry");
    assert.equal(row.loads[0].load, 1);
    assert.equal(row.loads[0].farmBirds, 1000);
    assert.equal(row.loads[0].farmWeight, 2500);
    assert.equal(row.loads[0].deliveredBirds, 995);
    assert.equal(row.loads[0].mortalityCount, 5);
    assert.equal(row.deliveredBirds, row.loads[0].deliveredBirds, "delivered counted exactly once");
    assert.equal(row.weightLoss, row.loads[0].weightLoss);
  });

  it("18. the same shop in two loads does not inflate the trip shop total", async () => {
    const shop = await seedShop("SAME");
    const tripId = await seedTrip({ date: "2026-05-05", sourceFarm: "MM Same Farm", totalBirds: 300, dcWeight: 600 });
    const leg1 = await seedLeg(tripId, 1, { farm: "MM Same Farm", birds: 200, weight: 400 });
    const leg2 = await seedLeg(tripId, 2, { farm: "MM Same Farm B", birds: 100, weight: 200 });
    await seedDelivery(tripId, shop, { birds: 190, weight: 380, legId: leg1 });
    await seedDelivery(tripId, shop, { birds: 95, weight: 190, legId: leg2 });
    const { row } = await findRow(tripId);
    assert.equal(row.loads.length, 2);
    assert.equal(row.loads[0].deliveryShops, 1);
    assert.equal(row.loads[1].deliveryShops, 1);
    assert.equal(row.deliveryShops, 1, "trip distinct shops must not sum per-load counts");
  });

  it("19. sorting by farm weight and weight loss uses canonical multi-load totals", async () => {
    const { tripId } = await seedCanonicalFixture();
    const byWeight = await mortalityAnalysisService.list({
      fromDate: DAY, toDate: "2026-05-01", sortBy: "farmWeight", sortDir: "desc",
    });
    assert.equal(byWeight.data[0].farmWeight, 4000, "4000 kg aggregate leads");
    assert.ok(byWeight.data.some((row) => row.tripId === tripId));
    const byLoss = await mortalityAnalysisService.list({
      fromDate: DAY, toDate: "2026-05-01", sortBy: "weightLoss", sortDir: "desc",
    });
    assert.equal(byLoss.data[0].weightLoss, 25, "25 kg aggregate loss leads");
    assert.ok(byLoss.data.some((row) => row.tripId === tripId));
  });

  it("20. pagination does not duplicate trips", async () => {
    const first = await mortalityAnalysisService.list({
      fromDate: DAY, toDate: DAY, pagination: { page: 1, limit: 2, offset: 0 },
    });
    const second = await mortalityAnalysisService.list({
      fromDate: DAY, toDate: DAY, pagination: { page: 2, limit: 2, offset: 2 },
    });
    const ids = [...first.data, ...second.data].map((row) => row.tripId);
    assert.equal(new Set(ids).size, ids.length, "no trip may appear on two pages");
    const full = await mortalityAnalysisService.list({ fromDate: DAY, toDate: DAY });
    assert.equal(first.meta.total, full.data.length);
    assert.equal(second.meta.total, full.data.length);
  });

  it("21. deliveries endpoint validates trip ids", async () => {
    await assert.rejects(
      mortalityAnalysisService.deliveries(0),
      (error: unknown) => error instanceof Error && /Invalid trip id/.test(error.message)
    );
    await assert.rejects(mortalityAnalysisService.deliveries(-4));
  });
});
