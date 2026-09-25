/**
 * Operations Dashboard — aggregation correctness against a real PostgreSQL
 * engine (PGlite behind pg-gateway; same harness as the other backend
 * suites). No mocks: HTTP → dashboardService → PostgreSQL → HTTP.
 *
 * Covers the existing GET /api/operations/dashboard contract:
 *   • empty state returns zeros (not nulls, not 500)
 *   • totals from completed trips only (deleted trips excluded)
 *   • sales = delivery amounts; collections only for rate-locked trips;
 *     unlocked trips stay pending
 *   • fuel = approved bills (linked + date-ranged unlinked); pending ignored
 *   • fromDate/toDate windows scope totals; todays/weekly/monthly stay
 *     relative to asOf
 *   • trip counts never multiply by delivery rows (no duplicate counting)
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
const { rateEntryService } = await import("../src/services/rateEntryService.js");
const { recalcTripDeliveryTotals } = await import("../src/utils/tripDeliverySync.js");

after(async () => {
  await app.close();
  await testDb.close();
  await pool.end();
});

let seq = 0;

async function seedSupport() {
  seq += 1;
  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: `DBV${String(seq).padStart(4, "0")}`,
    vehicleType: "Lorry",
    noOfBoxes: 85,
    birdCapacity: 50000,
    capacityKg: 60000,
    engineNumber: `DBENG${seq}`,
    chassisNumber: `DBCHS${seq}`,
    status: "Active",
  });
  const driver = await mastersService.upsertEmployee({
    employeeName: `DB Driver ${seq}`,
    department: "Driver",
    role: "Driver",
    phoneNumber: `9353${String(seq).padStart(6, "0")}`,
    licenseNumber: `DBDL${seq}`,
    salary: 18000,
    status: "Active",
  });
  const supervisor = await mastersService.upsertEmployee({
    employeeName: `DB Sup ${seq}`,
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: `9453${String(seq).padStart(6, "0")}`,
    salary: 24000,
    status: "Active",
  });
  const farm = await mastersService.upsertFarm({
    farmName: `DB Farm ${seq}`,
    ownerName: "Owner X",
    supervisorName: "Supervisor X",
    phoneNumber: `9673${String(seq).padStart(6, "0")}`,
    village: "V",
    address: "A",
    capacity: 300000,
    status: "Active",
  });
  const shop = await mastersService.upsertShop({
    shopName: `DB Shop ${seq}`,
    ownerName: "Owner",
    phoneNumber: `974300${String(seq).padStart(4, "0")}`,
    village: "Village",
    address: "Addr",
    status: "Active",
    openingBalance: 0,
  });
  return { vehicle, driver, supervisor, farm, shop };
}

async function seedTrip(sup: Awaited<ReturnType<typeof seedSupport>>, tripDate: string) {
  seq += 1;
  return tripsService.save(null, {
    tripNo: `DB-TRIP-${seq}`,
    tripDate,
    status: "Completed",
    startTime: `${tripDate}T05:30:00.000Z`,
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
}

let saleSeq = 0;
async function addDelivery(
  tripId: number, shopId: number, shopName: string, amount: number,
  birds = 300, weight = 500, rate = 200
): Promise<number> {
  saleSeq += 1;
  const result = await pool.query<{ id: number }>(
    `INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, birds, weight, mortality, rate, amount)
     VALUES ($1, $2, $3, $4, $5, $6, 0, $7, ROUND($8::numeric, 2))
     RETURNING id`,
    [tripId, `DB-SALE-${saleSeq}-${shopId}`, shopId, shopName, birds, weight, rate, amount]
  );
  return result.rows[0].id;
}

async function addFuelBill(billNo: string, expenseDate: string, amount: number, status: string, tripId: number | null) {
  await pool.query(
    `INSERT INTO fuel_expenses (bill_no, expense_date, amount, status, trip_id)
     VALUES ($1, $2, $3, $4::approval_status, $5)`,
    [billNo, expenseDate, amount, status, tripId]
  );
}

describe("Operations Dashboard aggregation", () => {
  it("1. empty state returns zeros, never nulls or 500", async () => {
    const { status, body } = await getJson(
      baseUrl, "/api/operations/dashboard?fromDate=2020-01-01&toDate=2020-01-31&asOf=2020-01-31"
    );
    assert.equal(status, 200);
    for (const key of [
      "totalTrips", "totalWeight", "totalSales", "totalCollections",
      "pendingCollections", "fuelExpenses", "todaysTrips", "weeklyTrips", "monthlyTrips",
    ]) {
      assert.equal(body[key], 0, key);
    }
  });

  it("2. totals aggregate completed trips; locked vs unlocked splits collections/pending", async () => {
    const sup = await seedSupport();
    const tripA = await seedTrip(sup, "2026-03-10");
    const delA1 = await addDelivery(tripA.id, sup.shop.id, sup.shop.shopName, 30000, 300, 500, 60);
    const delA2 = await addDelivery(tripA.id, sup.shop.id, sup.shop.shopName, 28000, 200, 400, 70);
    await recalcTripDeliveryTotals(pool as never, tripA.id);
    await rateEntryService.save(tripA.id, {
      rates: [
        { deliveryId: delA1, rate: 60 },
        { deliveryId: delA2, rate: 70 },
      ],
    });
    const lock = await rateEntryService.lock(tripA.id, { lockedBy: "dash-test" });
    assert.ok(lock.rateLocked);

    const tripB = await seedTrip(sup, "2026-03-11");
    await addDelivery(tripB.id, sup.shop.id, sup.shop.shopName, 2000);
    await recalcTripDeliveryTotals(pool as never, tripB.id);

    const tripC = await seedTrip(sup, "2026-03-12");
    await recalcTripDeliveryTotals(pool as never, tripC.id);

    await addFuelBill("DB-FUEL-A", "2026-03-10", 1500, "Approved", tripA.id);
    await addFuelBill("DB-FUEL-OPEN", "2026-03-11", 700, "Approved", null);
    await addFuelBill("DB-FUEL-PEND", "2026-03-10", 9999, "Pending", tripA.id);

    const { status, body } = await getJson(
      baseUrl, "/api/operations/dashboard?fromDate=2026-03-01&toDate=2026-03-31&asOf=2026-03-12"
    );
    assert.equal(status, 200);
    assert.equal(body.totalTrips, 3, "one row per trip even though trip A has two deliveries");
    assert.equal(body.totalSales, 60000, "30000 + 28000 + 2000");
    assert.equal(body.totalCollections, 58000, "only the rate-locked trip");
    assert.equal(body.pendingCollections, 2000, "unlocked trip B; tripless trip C adds nothing");
    assert.equal(body.fuelExpenses, 2200, "approved linked + ranged unlinked; pending bill ignored");
    assert.equal(body.todaysTrips, 1);
    assert.equal(body.weeklyTrips, 3);
    assert.equal(body.monthlyTrips, 3);

    const tripWeight = await pool.query(
      `SELECT COALESCE(SUM(COALESCE(total_weight,0)),0)::float AS s FROM trips
        WHERE status='Completed' AND COALESCE(deleted,FALSE)=FALSE
          AND trip_date >= '2026-03-01' AND trip_date <= '2026-03-31'`
    );
    const deliveryWeight = await pool.query(
      `SELECT COALESCE(SUM(d.weight),0)::float AS s FROM trip_deliveries d
        INNER JOIN trips t ON t.id = d.trip_id
        WHERE t.status='Completed' AND COALESCE(t.deleted,FALSE)=FALSE
          AND t.trip_date >= '2026-03-01' AND t.trip_date <= '2026-03-31'`
    );
    assert.equal(
      body.totalWeight,
      Math.max(tripWeight.rows[0].s, deliveryWeight.rows[0].s),
      "weight is the greater of trip and delivery sums, never a multiplied join"
    );
  });

  it("3. date windows scope totals and fuel without leaking across ranges", async () => {
    const { status, body } = await getJson(
      baseUrl, "/api/operations/dashboard?fromDate=2026-03-11&toDate=2026-03-11&asOf=2026-03-12"
    );
    assert.equal(status, 200);
    assert.equal(body.totalTrips, 1);
    assert.equal(body.totalSales, 2000);
    assert.equal(body.totalCollections, 0);
    assert.equal(body.pendingCollections, 2000);
    assert.equal(body.fuelExpenses, 700, "trip-A bill excluded (trip out of range); unlinked in-range bill kept");
  });

  it("4. soft-deleted trips and their deliveries vanish from every total", async () => {
    const sup = await seedSupport();
    const doomed = await seedTrip(sup, "2026-03-11");
    await addDelivery(doomed.id, sup.shop.id, sup.shop.shopName, 9000);
    await recalcTripDeliveryTotals(pool as never, doomed.id);
    await pool.query(`UPDATE trips SET deleted = TRUE WHERE id = $1`, [doomed.id]);

    const { body } = await getJson(
      baseUrl, "/api/operations/dashboard?fromDate=2026-03-11&toDate=2026-03-11&asOf=2026-03-12"
    );
    assert.equal(body.totalTrips, 1, "deleted trip not counted");
    assert.equal(body.totalSales, 2000, "deleted trip delivery not summed");
    await pool.query(`UPDATE trips SET deleted = FALSE WHERE id = $1`, [doomed.id]);
    const restored = await getJson(
      baseUrl, "/api/operations/dashboard?fromDate=2026-03-11&toDate=2026-03-11&asOf=2026-03-12"
    );
    assert.equal(restored.body.totalTrips, 2);
    assert.equal(restored.body.totalSales, 11000);
    await pool.query(`UPDATE trips SET deleted = TRUE WHERE id = $1`, [doomed.id]);
  });

  it("5. dashboard requires authorization", async () => {
    const anon = await fetch(`${baseUrl}/api/operations/dashboard`);
    assert.equal(anon.status, 401);
  });
});
