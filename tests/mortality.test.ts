/**
 * Mortality analysis — production coverage against a real PostgreSQL engine
 * (PGlite behind pg-gateway; same harness as the other backend suites).
 * No mocks: HTTP → mortalityAnalysisService → PostgreSQL → HTTP.
 *
 * Covers the existing GET /api/operations/mortality-analysis contract:
 *   • per-trip rows with hand-verified mortality / weight-loss math
 *   • KPI aggregates, filter options, date windows, farm/supervisor/search
 *   • sorting (including unknown-key fallback), pagination meta
 *   • one row per trip even with several deliveries (no duplicate counting)
 *   • pending / unsubmitted / soft-deleted trips excluded
 *   • trip → deliveries relationship (deleted delivery rows excluded)
 *   • authorization (401 without a session)
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { getJson, startApp, type TestApp } from "./helpers/app.js";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });
const baseUrl = app.baseUrl;

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");
const { tripsService } = await import("../src/services/tripsService.js");
const { recalcTripDeliveryTotals } = await import("../src/utils/tripDeliverySync.js");

after(async () => {
  await app.close();
  await testDb.close();
  await pool.end();
});

let seq = 0;
let saleSeq = 0;

async function seedSupport(tag: string) {
  seq += 1;
  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: `MTV${tag}${String(seq).padStart(4, "0")}`,
    vehicleType: "Lorry",
    noOfBoxes: 85,
    birdCapacity: 50000,
    capacityKg: 60000,
    engineNumber: `MTENG${tag}${seq}`,
    chassisNumber: `MTCHS${tag}${seq}`,
    status: "Active",
  });
  const driver = await mastersService.upsertEmployee({
    employeeName: `MT Driver ${tag}${seq}`,
    department: "Driver",
    role: "Driver",
    phoneNumber: `9363${String(seq).padStart(6, "0")}`,
    licenseNumber: `MTDL${tag}${seq}`,
    salary: 18000,
    status: "Active",
  });
  const supervisor = await mastersService.upsertEmployee({
    employeeName: `MT Sup ${tag}${seq}`,
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: `9463${String(seq).padStart(6, "0")}`,
    salary: 24000,
    status: "Active",
  });
  const farm = await mastersService.upsertFarm({
    farmName: `MT Farm ${tag}${seq}`,
    ownerName: "Owner X",
    supervisorName: "Supervisor X",
    phoneNumber: `9673${String(seq).padStart(6, "0")}`,
    village: "V",
    address: "A",
    capacity: 300000,
    status: "Active",
  });
  return { vehicle, driver, supervisor, farm };
}

async function seedShop(tag: string) {
  seq += 1;
  return mastersService.upsertShop({
    shopName: `MT Shop ${tag}${seq}`,
    ownerName: "Owner",
    phoneNumber: `974300${String(seq).padStart(4, "0")}`,
    village: "Village",
    address: "Addr",
    status: "Active",
    openingBalance: 0,
  });
}

async function seedTrip(
  sup: Awaited<ReturnType<typeof seedSupport>>,
  opts: { tripDate: string; status?: string; expenses?: boolean; totalBirds: number; dcWeight: number }
) {
  seq += 1;
  return tripsService.save(null, {
    tripNo: `MT-TRIP-${seq}`,
    tripDate: opts.tripDate,
    status: opts.status ?? "Completed",
    startTime: `${opts.tripDate}T05:30:00.000Z`,
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
    expensesStepSubmitted: opts.expenses ?? true,
    totalKm: 60,
    totalBirds: opts.totalBirds,
    dcWeight: opts.dcWeight,
  } as unknown as Record<string, unknown>);
}

async function addDelivery(
  tripId: number, shopId: number, shopName: string,
  opts: { birds: number; weight: number; mortality: number; mortKg: number; amount: number; rate: number }
): Promise<number> {
  saleSeq += 1;
  const result = await pool.query<{ id: number }>(
    `INSERT INTO trip_deliveries
       (trip_id, sale_no, shop_id, shop_name, birds, weight, mortality, mort_kg, rate, amount)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ROUND($10::numeric, 2))
     RETURNING id`,
    [tripId, `MT-SALE-${saleSeq}`, shopId, shopName, opts.birds, opts.weight,
      opts.mortality, opts.mortKg, opts.rate, opts.amount]
  );
  return result.rows[0].id;
}

describe("Mortality analysis", () => {
  it("1. rows carry exact mortality math, KPIs aggregate, options list farms/supervisors", async () => {
    const sup = await seedSupport("A");
    const shop1 = await seedShop("A1");
    const shop2 = await seedShop("A2");
    const trip = await seedTrip(sup, { tripDate: "2026-04-10", totalBirds: 1000, dcWeight: 1500 });
    await addDelivery(trip.id, shop1.id, shop1.shopName,
      { birds: 300, weight: 500, mortality: 10, mortKg: 20, amount: 30000, rate: 60 });
    await addDelivery(trip.id, shop2.id, shop2.shopName,
      { birds: 300, weight: 500, mortality: 5, mortKg: 10, amount: 28000, rate: 56 });
    await recalcTripDeliveryTotals(pool as never, trip.id);

    const { status, body } = await getJson(
      baseUrl, `/api/operations/mortality-analysis?fromDate=2026-04-10&toDate=2026-04-10`
    );
    assert.equal(status, 200);
    assert.equal(body.data.length, 1, "one row per trip despite two deliveries");
    const row = body.data[0];
    assert.equal(row.tripId, trip.id);
    assert.equal(row.tripNo, trip.tripNo);
    assert.equal(row.farmBirds, 1000);
    assert.equal(row.farmWeight, 1500);
    assert.equal(row.deliveredBirds, 600);
    assert.equal(row.deliveredWeight, 1000);
    assert.equal(row.mortalityCount, 15);
    assert.equal(row.mortalityWeight, 30);
    assert.equal(row.weightLoss, 470, "1500 farm - 1000 delivered - 30 mortality");
    assert.equal(row.deliveryShops, 2);
    assert.equal(row.mortalityPercentage, 1.5);
    assert.equal(row.weightLossPercentage, 31.33);
    assert.equal(row.survivalRate, 0.985);

    assert.equal(body.kpis.totalTrips, 1);
    assert.equal(body.kpis.mortalityCount, 15);
    assert.equal(body.kpis.weightLoss, 470);
    assert.ok(body.filterOptions.farms.includes(sup.farm.farmName));
    assert.ok(body.filterOptions.supervisors.includes(sup.supervisor.employeeName));
    assert.equal(body.meta.total, 1);
  });

  it("2. windows, farm/supervisor/search filters and sorting scope the same rows", async () => {
    const sup = await seedSupport("B");
    const shop = await seedShop("B1");
    const trip = await seedTrip(sup, { tripDate: "2026-04-11", totalBirds: 500, dcWeight: 800 });
    await addDelivery(trip.id, shop.id, shop.shopName,
      { birds: 200, weight: 300, mortality: 0, mortKg: 0, amount: 18000, rate: 60 });
    await recalcTripDeliveryTotals(pool as never, trip.id);

    const windowed = await getJson(
      baseUrl, "/api/operations/mortality-analysis?fromDate=2026-04-11&toDate=2026-04-11"
    );
    assert.equal(windowed.body.data.length, 1);
    assert.equal(windowed.body.data[0].tripId, trip.id);
    assert.equal(windowed.body.data[0].mortalityPercentage, 0);
    assert.equal(windowed.body.data[0].weightLoss, 500);

    const byFarm = await getJson(
      baseUrl, `/api/operations/mortality-analysis?farm=${encodeURIComponent(sup.farm.farmName)}`
    );
    assert.ok(byFarm.body.data.length >= 1);
    assert.ok(byFarm.body.data.every((r: { sourceFarm: string }) => r.sourceFarm === sup.farm.farmName));

    const bySup = await getJson(
      baseUrl, `/api/operations/mortality-analysis?supervisor=${encodeURIComponent(sup.supervisor.employeeName)}`
    );
    assert.ok(bySup.body.data.every((r: { supervisorName: string }) => r.supervisorName === sup.supervisor.employeeName));

    const bySearch = await getJson(
      baseUrl, `/api/operations/mortality-analysis?search=${encodeURIComponent(trip.tripNo)}`
    );
    assert.ok(bySearch.body.data.some((r: { tripId: number }) => r.tripId === trip.id));

    const sorted = await getJson(
      baseUrl, "/api/operations/mortality-analysis?fromDate=2026-04-10&toDate=2026-04-11&sortBy=mortalityCount&sortDir=desc"
    );
    assert.equal(sorted.body.data[0].mortalityCount, 15, "highest mortality first");
    const fallback = await getJson(
      baseUrl, "/api/operations/mortality-analysis?fromDate=2026-04-10&toDate=2026-04-11&sortBy=bogus"
    );
    assert.equal(fallback.status, 200, "unknown sort key falls back to trip date");

    const paged = await getJson(
      baseUrl, "/api/operations/mortality-analysis?fromDate=2026-04-10&toDate=2026-04-11&page=1&limit=1"
    );
    assert.equal(paged.body.data.length, 1);
    assert.equal(paged.body.meta.total, 2);
    assert.equal(paged.body.meta.totalPages, 2);
  });

  it("3. pending, unsubmitted and soft-deleted trips are excluded", async () => {
    const sup = await seedSupport("C");
    const pending = await seedTrip(sup, { tripDate: "2026-04-12", status: "Pending", expenses: false, totalBirds: 100, dcWeight: 200 });
    const before = await getJson(baseUrl, "/api/operations/mortality-analysis?fromDate=2026-04-12&toDate=2026-04-12");
    assert.equal(before.body.data.length, 0);
    assert.equal(before.body.kpis.totalTrips, 0);

    const gone = await seedTrip(sup, { tripDate: "2026-04-12", totalBirds: 100, dcWeight: 200 });
    await pool.query(`UPDATE trips SET deleted = TRUE WHERE id = $1`, [gone.id]);
    const afterDelete = await getJson(baseUrl, "/api/operations/mortality-analysis?fromDate=2026-04-12&toDate=2026-04-12");
    assert.ok(!afterDelete.body.data.some((r: { tripId: number }) => r.tripId === gone.id));
    void pending;
  });

  it("4. trip deliveries endpoint returns the live shops and skips deleted rows", async () => {
    const listed = await getJson(baseUrl, "/api/operations/mortality-analysis?fromDate=2026-04-10&toDate=2026-04-10");
    const tripId = listed.body.data[0].tripId as number;
    const full = await getJson(baseUrl, `/api/operations/mortality-analysis/${tripId}/deliveries`);
    assert.equal(full.status, 200);
    assert.equal(full.body.length, 2);
    assert.equal(full.body[0].mortality + full.body[1].mortality, 15);

    const victim = full.body[0].id as number;
    await pool.query(`UPDATE trip_deliveries SET deleted = TRUE WHERE id = $1`, [victim]);
    const pruned = await getJson(baseUrl, `/api/operations/mortality-analysis/${tripId}/deliveries`);
    assert.equal(pruned.body.length, 1);
    assert.ok(!pruned.body.some((r: { id: number }) => r.id === victim));
    await pool.query(`UPDATE trip_deliveries SET deleted = FALSE WHERE id = $1`, [victim]);
  });

  it("5. mortality requires authorization", async () => {
    const anon = await fetch(`${baseUrl}/api/operations/mortality-analysis`);
    assert.equal(anon.status, 401);
  });
});
