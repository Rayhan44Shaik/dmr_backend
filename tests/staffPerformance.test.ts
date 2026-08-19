/**
 * Staff Performance backend tests — GET /api/staff/performance/drivers and
 * GET /api/staff/performance/supervisors.
 *
 * Runs the real Express app against a real PostgreSQL engine (PGlite WASM
 * behind the pg-gateway wire-protocol server) — no mocks.
 *
 * Covers:
 *   - A trip is counted ONCE per driver/supervisor even when it has many shops
 *   - Distance / toll / other costs split matches the Analytics cost centres
 *   - Fuel eligibility: MANUAL approved + TRIP approved included; TRIP not
 *     approved and deleted fuel excluded; maintenance approved-only
 *   - Search narrows the crew list; driverId/supervisorId returns the detail
 *     block (vehicles + recent trips); date range bounds everything
 *   - Empty result returns zero KPIs without error
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { getJson, startApp, type TestApp } from "./helpers/app.js";
import { applySchema, shutdownTestEnv, startTestDb, type TestDb } from "./helpers/testDb.js";
import { str } from "../src/utils/coerce.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });
const baseUrl = app.baseUrl;

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");

after(async () => {
  await shutdownTestEnv({ app, testDb, pool });
});

let seq = 0;
async function seedVehicle(vehicleNumber?: string) {
  seq += 1;
  const n = String(seq).padStart(3, "0");
  const v = await mastersService.upsertVehicle({
    vehicleNumber: vehicleNumber ?? `PERF-V${n}`,
    vehicleType: "Lorry",
    noOfBoxes: 40,
    birdCapacity: 1000,
    capacityKg: 2000,
    engineNumber: `PERF-E${n}`,
    chassisNumber: `PERF-C${n}`,
    status: "Active",
  });
  return v;
}

async function seedEmployee(name: string, department: "Driver" | "Supervisor") {
  seq += 1;
  const e = await mastersService.upsertEmployee({
    employeeName: name,
    department,
    role: department,
    phoneNumber: `98${String(seq).padStart(8, "0")}`,
    licenseNumber: department === "Driver" ? `PERF-DL-${seq}` : undefined,
    salary: 15000,
    status: "Active",
  });
  return e;
}

async function seedTrip(opts: {
  date: string;
  vehicleId: number;
  vehicleNo: string;
  driverId: number | null;
  driverName: string | null;
  supervisorId: number | null;
  supervisorName: string | null;
  totalKm: number;
  totalShops: number;
  totalBirds: number;
  totalWeight: number;
  mortality: number;
  weightLoss: number;
  tolls?: number;
  other?: number;
  status?: string;
  deleted?: boolean;
}) {
  seq += 1;
  const tripNo = `PERF-TRIP-${seq}-${Date.now()}`;
  const res = await pool.query(
    `INSERT INTO trips (
       trip_no, trip_date, status, vehicle_id, vehicle_no, driver_id, driver_name,
       supervisor_id, supervisor_name, total_km, total_shops, total_birds_delivered,
       total_delivered_weight, total_mortality, weight_loss, pickup_tolls,
       delivery_tolls, destination_tolls, meals, meals_tiffin, loading,
       vehicle_maintenance, others_rc, others1_amt, others2_amt, others3_amt,
       others4_amt, others5_amt, driver_bata, deleted, start_step_submitted,
       farm_step_submitted, pickup_step_submitted, delivery_step_submitted,
       expenses_step_submitted
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
       $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
       TRUE,TRUE,TRUE,TRUE,TRUE)
     RETURNING id`,
    [
      tripNo,
      opts.date,
      opts.status ?? "Completed",
      opts.vehicleId,
      opts.vehicleNo,
      opts.driverId,
      opts.driverName,
      opts.supervisorId,
      opts.supervisorName,
      opts.totalKm,
      opts.totalShops,
      opts.totalBirds,
      opts.totalWeight,
      opts.mortality,
      opts.weightLoss,
      opts.tolls ?? 0,
      opts.tolls ?? 0,
      opts.tolls ?? 0,
      opts.other ?? 0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      opts.other ?? 0,
      opts.deleted ?? false,
    ]
  );
  return res.rows[0].id as number;
}

async function seedDeliveries(tripId: number, count: number) {
  for (let i = 1; i <= count; i += 1) {
    await pool.query(
      `INSERT INTO trip_deliveries (trip_id, sale_no, serial_no, shop_name, birds, weight, mortality, rate, amount)
       VALUES ($1, $2, $3, $4, 10, 20, 0, 100, 2000)`,
      [tripId, i, i, `Shop ${i}`]
    );
  }
}

async function seedFuel(opts: {
  date: string;
  vehicleId: number;
  vehicleNo: string;
  driverId: number | null;
  litres: number;
  amount: number;
  sourceType?: "MANUAL" | "TRIP";
  opsStatus?: string;
  deleted?: boolean;
}) {
  seq += 1;
  const billNo = `PERF-FUEL-${seq}-${Date.now()}`;
  await pool.query(
    `INSERT INTO fuel_expenses (
       bill_no, expense_date, vehicle_id, vehicle_no, driver_id, driver_name,
       meter_reading, amount, rate, litres, petrol_bunk, status, source_type,
       ops_status, deleted
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      billNo,
      opts.date,
      opts.vehicleId,
      opts.vehicleNo,
      opts.driverId,
      opts.driverId == null ? null : "Perf Driver",
      0,
      opts.amount,
      opts.litres > 0 ? opts.amount / opts.litres : 0,
      opts.litres,
      "Test Bunk",
      "Approved",
      opts.sourceType ?? "MANUAL",
      opts.opsStatus ?? "Approved",
      opts.deleted ?? false,
    ]
  );
}

async function seedMaintenance(opts: {
  date: string;
  vehicleId: number;
  vehicleNo: string;
  driverId: number | null;
  totalCost: number;
  status?: string;
  deleted?: boolean;
}) {
  seq += 1;
  const billNo = `PERF-MNT-${seq}-${Date.now()}`;
  await pool.query(
    `INSERT INTO fleet_maintenance (
       bill_no, maintenance_date, vehicle_id, vehicle_no, driver_id, driver_name,
       current_km, maintenance_type, service_type, garage, mechanic, total_cost,
       parts, status, deleted
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      billNo,
      opts.date,
      opts.vehicleId,
      opts.vehicleNo,
      opts.driverId,
      opts.driverId == null ? null : "Perf Driver",
      0,
      "General Service",
      "Service",
      "Garage",
      "Mech",
      opts.totalCost,
      "[]",
      opts.status ?? "Approved",
      opts.deleted ?? false,
    ]
  );
}

let vehA: { id: number };
let vehB: { id: number };
let driverA: { id: number; employeeName: string };
let driverB: { id: number; employeeName: string };
let supA: { id: number; employeeName: string };
let supB: { id: number; employeeName: string };

before(async () => {
  vehA = await seedVehicle("PERF-VA");
  vehB = await seedVehicle("PERF-VB");
  driverA = await seedEmployee("Perf Driver A", "Driver");
  driverB = await seedEmployee("Perf Driver B", "Driver");
  supA = await seedEmployee("Perf Supervisor A", "Supervisor");
  supB = await seedEmployee("Perf Supervisor B", "Supervisor");

  // Driver A: 2 trips (one with 3 shop deliveries — must still count once)
  const t1 = await seedTrip({
    date: "2026-07-06",
    vehicleId: vehA.id,
    vehicleNo: "PERF-VA",
    driverId: driverA.id,
    driverName: driverA.employeeName,
    supervisorId: supA.id,
    supervisorName: supA.employeeName,
    totalKm: 100,
    totalShops: 3,
    totalBirds: 300,
    totalWeight: 600,
    mortality: 3,
    weightLoss: 5,
    tolls: 100,
    other: 50,
  });
  await seedDeliveries(t1, 3);

  await seedTrip({
    date: "2026-07-13",
    vehicleId: vehB.id,
    vehicleNo: "PERF-VB",
    driverId: driverA.id,
    driverName: driverA.employeeName,
    supervisorId: supA.id,
    supervisorName: supA.employeeName,
    totalKm: 60,
    totalShops: 2,
    totalBirds: 200,
    totalWeight: 400,
    mortality: 1,
    weightLoss: 2,
    tolls: 50,
    other: 25,
  });

  // Driver B: 1 completed trip + 1 deleted trip (must be ignored)
  await seedTrip({
    date: "2026-07-10",
    vehicleId: vehA.id,
    vehicleNo: "PERF-VA",
    driverId: driverB.id,
    driverName: driverB.employeeName,
    supervisorId: supB.id,
    supervisorName: supB.employeeName,
    totalKm: 80,
    totalShops: 4,
    totalBirds: 400,
    totalWeight: 800,
    mortality: 4,
    weightLoss: 8,
  });
  await seedTrip({
    date: "2026-07-11",
    vehicleId: vehA.id,
    vehicleNo: "PERF-VA",
    driverId: driverB.id,
    driverName: driverB.employeeName,
    supervisorId: supB.id,
    supervisorName: supB.employeeName,
    totalKm: 999,
    totalShops: 1,
    totalBirds: 100,
    totalWeight: 200,
    mortality: 0,
    weightLoss: 0,
    deleted: true,
  });

  // Fuel: MANUAL approved (counted), TRIP approved (counted), TRIP not approved
  // (excluded), deleted (excluded) — all for driver A.
  await seedFuel({
    date: "2026-07-07",
    vehicleId: vehA.id,
    vehicleNo: "PERF-VA",
    driverId: driverA.id,
    litres: 10,
    amount: 900,
    sourceType: "MANUAL",
  });
  await seedFuel({
    date: "2026-07-08",
    vehicleId: vehB.id,
    vehicleNo: "PERF-VB",
    driverId: driverA.id,
    litres: 8,
    amount: 720,
    sourceType: "TRIP",
    opsStatus: "Approved",
  });
  await seedFuel({
    date: "2026-07-09",
    vehicleId: vehA.id,
    vehicleNo: "PERF-VA",
    driverId: driverA.id,
    litres: 100,
    amount: 9999,
    sourceType: "TRIP",
    opsStatus: "Pending Approval",
  });
  await seedFuel({
    date: "2026-07-09",
    vehicleId: vehA.id,
    vehicleNo: "PERF-VA",
    driverId: driverA.id,
    litres: 100,
    amount: 9999,
    sourceType: "MANUAL",
    deleted: true,
  });

  // Maintenance: one approved (counted), one pending (excluded), one deleted (excluded)
  await seedMaintenance({
    date: "2026-07-12",
    vehicleId: vehA.id,
    vehicleNo: "PERF-VA",
    driverId: driverA.id,
    totalCost: 500,
  });
  await seedMaintenance({
    date: "2026-07-12",
    vehicleId: vehA.id,
    vehicleNo: "PERF-VA",
    driverId: driverA.id,
    totalCost: 9999,
    status: "Pending Approval",
  });
  await seedMaintenance({
    date: "2026-07-12",
    vehicleId: vehA.id,
    vehicleNo: "PERF-VA",
    driverId: driverA.id,
    totalCost: 9999,
    deleted: true,
  });
});

describe("GET /api/staff/performance/drivers", () => {
  it("counts trips once per driver (shops never multiply trips)", async () => {
    const res = await getJson(
      baseUrl,
      "/api/staff/performance/drivers?fromDate=2026-07-01&toDate=2026-07-31"
    );
    assert.equal(res.status, 200);

    const driverRow = res.body.rows.find((r: any) => r.driverId === driverA.id);
    assert.ok(driverRow, "driver A must be present");
    assert.equal(driverRow.trips, 2, "2 trips despite 5 shop deliveries total");
    assert.equal(driverRow.distance, 160);
    assert.equal(driverRow.avgDistancePerTrip, 80);
  });

  it("applies the fuel eligibility + approved-maintenance rules and cost-centre split", async () => {
    const res = await getJson(
      baseUrl,
      "/api/staff/performance/drivers?fromDate=2026-07-01&toDate=2026-07-31"
    );
    const driverRow = res.body.rows.find((r: any) => r.driverId === driverA.id);

    // Only the two eligible fuel bills (900 + 720) are counted.
    assert.equal(driverRow.fuelLitres, 18);
    assert.equal(driverRow.fuelCost, 1620);
    // Only the approved maintenance bill (500).
    assert.equal(driverRow.maintenanceCost, 500);
    // tolls = 100 + 50 = 150 (each trip's tolls sum: (100+100+100) + (50+50+50) = 450)
    assert.equal(driverRow.tollCost, 450);
    // other = 50*2 + 25*2 = 150 (each trip contributes `other` to both
    // driver_bata and meals)
    assert.equal(driverRow.otherCost, 150);
    assert.equal(driverRow.totalCost, 1620 + 500 + 450 + 150);
    assert.equal(driverRow.costPerKm, Math.round((1620 + 500 + 450 + 150) * 100 / 160) / 100);
    assert.equal(driverRow.mileage, Math.round((160 / 18) * 100) / 100);
  });

  it("reports KPIs across the whole filtered set", async () => {
    const res = await getJson(
      baseUrl,
      "/api/staff/performance/drivers?fromDate=2026-07-01&toDate=2026-07-31"
    );
    assert.equal(res.body.kpis.drivers, 2);
    assert.equal(res.body.kpis.trips, 3);
    assert.equal(res.body.kpis.distance, 240);
    assert.equal(res.body.kpis.fuelLitres, 18);
    assert.equal(res.body.kpis.fuelCost, 1620);
  });

  it("honours the search filter", async () => {
    const res = await getJson(
      baseUrl,
      "/api/staff/performance/drivers?fromDate=2026-07-01&toDate=2026-07-31&search=Driver%20B"
    );
    assert.equal(res.body.kpis.drivers, 1);
    assert.equal(res.body.rows[0].driverName, driverB.employeeName);
    assert.equal(res.body.rows[0].trips, 1);
  });

  it("honours the date range (out-of-range trips excluded)", async () => {
    const res = await getJson(
      baseUrl,
      "/api/staff/performance/drivers?fromDate=2026-07-12&toDate=2026-07-31"
    );
    const driverRow = res.body.rows.find((r: any) => r.driverId === driverA.id);
    assert.equal(driverRow.trips, 1);
    assert.equal(driverRow.distance, 60);
  });

  it("returns the detail block (vehicles + recent trips) when driverId is given", async () => {
    const res = await getJson(
      baseUrl,
      `/api/staff/performance/drivers?fromDate=2026-07-01&toDate=2026-07-31&driverId=${driverA.id}`
    );
    assert.equal(res.status, 200);
    assert.ok(res.body.detail, "detail must be present");
    assert.equal(res.body.detail.recentTrips.length, 2);
    assert.equal(res.body.detail.vehicles.length, 2);
    const va = res.body.detail.vehicles.find((v: any) => v.vehicleNo === "PERF-VA");
    assert.equal(va.trips, 1);
    assert.equal(va.fuelLitres, 10);
    assert.equal(va.maintenanceCost, 500);
  });

  it("returns empty rows and zero KPIs for a range with no trips", async () => {
    const res = await getJson(
      baseUrl,
      "/api/staff/performance/drivers?fromDate=2020-01-01&toDate=2020-01-31"
    );
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.rows, []);
    assert.equal(res.body.kpis.drivers, 0);
    assert.equal(res.body.kpis.trips, 0);
    assert.equal(res.body.kpis.distance, 0);
  });

  it("rejects an invalid date range", async () => {
    const res = await getJson(baseUrl, "/api/staff/performance/drivers?fromDate=not-a-date");
    assert.equal(res.status, 400);
  });
});

describe("GET /api/staff/performance/supervisors", () => {
  it("aggregates shops/birds/weight/mortality per supervisor without multiplying trips", async () => {
    const res = await getJson(
      baseUrl,
      "/api/staff/performance/supervisors?fromDate=2026-07-01&toDate=2026-07-31"
    );
    assert.equal(res.status, 200);

    const supRow = res.body.rows.find((r: any) => r.supervisorId === supA.id);
    assert.ok(supRow);
    assert.equal(supRow.trips, 2, "2 trips, not 5 shop rows");
    assert.equal(supRow.shops, 5);
    assert.equal(supRow.birds, 500);
    assert.equal(supRow.weight, 1000);
    assert.equal(supRow.mortality, 4);
    assert.equal(supRow.mortalityRate, 0.8);
    assert.equal(supRow.weightLoss, 7);
  });

  it("reports KPIs across the whole set", async () => {
    const res = await getJson(
      baseUrl,
      "/api/staff/performance/supervisors?fromDate=2026-07-01&toDate=2026-07-31"
    );
    assert.equal(res.body.kpis.supervisors, 2);
    assert.equal(res.body.kpis.trips, 3);
    assert.equal(res.body.kpis.shops, 9);
    assert.equal(res.body.kpis.birds, 900);
    assert.equal(res.body.kpis.mortality, 8);
  });

  it("returns recent trips in the detail block when supervisorId is given", async () => {
    const res = await getJson(
      baseUrl,
      `/api/staff/performance/supervisors?fromDate=2026-07-01&toDate=2026-07-31&supervisorId=${supB.id}`
    );
    assert.equal(res.status, 200);
    assert.ok(res.body.detail);
    assert.equal(res.body.detail.recentTrips.length, 1);
    assert.equal(res.body.detail.recentTrips[0].totalShops, 4);
  });

  it("honours the search filter", async () => {
    const res = await getJson(
      baseUrl,
      "/api/staff/performance/supervisors?fromDate=2026-07-01&toDate=2026-07-31&search=Supervisor%20A"
    );
    assert.equal(res.body.kpis.supervisors, 1);
    assert.equal(res.body.rows[0].supervisorName, supA.employeeName);
  });

  it("returns empty rows for a range with no trips", async () => {
    const res = await getJson(
      baseUrl,
      "/api/staff/performance/supervisors?fromDate=2020-01-01&toDate=2020-01-31"
    );
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.rows, []);
    assert.equal(res.body.kpis.trips, 0);
  });

  it("rejects an invalid date range", async () => {
    const res = await getJson(baseUrl, "/api/staff/performance/supervisors?toDate=bad");
    assert.equal(res.status, 400);
  });
});

describe("GET /api/staff/performance/drivers — weekly buckets", () => {
  it("buckets trips/distance by Sunday-start weeks", async () => {
    const res = await getJson(
      baseUrl,
      "/api/staff/performance/drivers?fromDate=2026-07-01&toDate=2026-07-31"
    );
    assert.ok(res.body.weekly.length >= 4, "30-day range spans at least 4 weekly buckets");
    const totalWeeklyTrips = res.body.weekly.reduce((s: number, w: any) => s + w.trips, 0);
    assert.equal(totalWeeklyTrips, 3);
  });
});