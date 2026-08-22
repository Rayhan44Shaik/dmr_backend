/**
 * Fleet Analytics — backend-authoritative aggregation tests.
 * Exercises GET /api/fleet/analytics against a real (PGlite) PostgreSQL engine.
 * The frontend must render exactly what these assertions lock down.
 */
import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { getJson, startApp, type TestApp } from "./helpers/app.js";
import { applySchema, resetMasters, shutdownTestEnv, startTestDb, type TestDb } from "./helpers/testDb.js";

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
  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: vehicleNumber ?? `ANV${n}`,
    vehicleType: "Lorry",
    noOfBoxes: 40,
    birdCapacity: 1000,
    capacityKg: 2000,
    engineNumber: `ANE${n}`,
    chassisNumber: `ANC${n}`,
    status: "Active",
  });
  return vehicle;
}

async function seedTrip(
  vehicleId: number,
  opts: {
    date: string;
    totalKm: number;
    tolls?: number;
    other?: number;
    driverBata?: number;
    status?: string;
    deleted?: boolean;
  } = {}
) {
  seq += 1;
  const tripNo = `AN-TRIP-${seq}-${Date.now()}`;
  const res = await pool.query(
    `INSERT INTO trips (
       trip_no, trip_date, status, vehicle_id, total_km, pickup_tolls, delivery_tolls,
       destination_tolls, meals, meals_tiffin, loading, vehicle_maintenance, others_rc,
       others1_amt, others2_amt, others3_amt, others4_amt, others5_amt, driver_bata,
       deleted, start_step_submitted, farm_step_submitted, pickup_step_submitted,
       delivery_step_submitted, expenses_step_submitted
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
       TRUE,TRUE,TRUE,TRUE,TRUE)
     RETURNING id`,
    [
      tripNo,
      opts.date,
      opts.status ?? "Completed",
      vehicleId,
      opts.totalKm,
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
      opts.driverBata ?? 0,
      opts.deleted ?? false,
    ]
  );
  return res.rows[0].id;
}

async function seedFuel(
  vehicleId: number,
  opts: {
    date: string;
    litres: number;
    amount: number;
    sourceType?: "MANUAL" | "TRIP";
    opsStatus?: string;
    deleted?: boolean;
  } = {}
) {
  seq += 1;
  const billNo = `AN-FUEL-${seq}-${Date.now()}`;
  await pool.query(
    `INSERT INTO fuel_expenses (
       bill_no, expense_date, vehicle_id, vehicle_no, meter_reading, amount, rate, litres,
       petrol_bunk, status, source_type, ops_status, deleted
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      billNo,
      opts.date,
      vehicleId,
      `ANV${seq}`,
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

async function seedMaintenance(
  vehicleId: number,
  opts: { date: string; totalCost: number; status?: string; deleted?: boolean } = {}
) {
  seq += 1;
  const billNo = `AN-MNT-${seq}-${Date.now()}`;
  await pool.query(
    `INSERT INTO fleet_maintenance (
       bill_no, maintenance_date, vehicle_id, vehicle_no, current_km, maintenance_type,
       service_type, garage, mechanic, total_cost, parts, status, deleted
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      billNo,
      opts.date,
      vehicleId,
      `ANV${seq}`,
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

async function seedEmi(
  vehicleId: number,
  opts: { dueDate: string | null; emiAmount: number; status?: string } = {}
) {
  seq += 1;
  const emiRes = await pool.query(
    `INSERT INTO vehicle_emis (
       vehicle_id, finance_company, loan_amount, emi_amount, start_date, end_date,
       total_emis, paid_emis, next_emi_date, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,$9)
     RETURNING id`,
    [
      vehicleId,
      "AN Finance",
      1000,
      opts.emiAmount,
      "2026-01-01",
      "2026-12-01",
      1,
      opts.dueDate,
      opts.status ?? "active",
    ]
  );
  const emiId = emiRes.rows[0].id;
  if (opts.dueDate != null) {
    await pool.query(
      `INSERT INTO vehicle_emi_installments (vehicle_emi_id, installment_no, due_date, amount, status)
       VALUES ($1,1,$2,$3,'pending')`,
      [emiId, opts.dueDate, opts.emiAmount]
    );
  }
}

async function analytics(qs = "") {
  return getJson(baseUrl, `/api/fleet/analytics${qs}`);
}

async function resetAll() {
  await pool.query(`TRUNCATE trips, fuel_expenses, fleet_maintenance, vehicle_emis,
    vehicle_emi_installments RESTART IDENTITY CASCADE`);
  await resetMasters();
}

describe("Fleet Analytics — single source of truth", () => {
  beforeEach(async () => {
    await resetAll();
  });

  it("1. current month default range returns a valid, zero-safe empty payload", async () => {
    const res = await analytics();
    assert.equal(res.status, 200);
    const k = res.body.kpis;
    assert.equal(res.body.safe, true);
    assert.equal(k.totalTrips, 0);
    assert.equal(k.totalDistance, 0);
    assert.equal(k.averageMileage, 0);
    assert.equal(k.totalFuelLitres, 0);
    assert.equal(k.fuelCost, 0);
    assert.equal(k.maintenanceCost, 0);
    assert.equal(k.emiDue, 0);
    assert.equal(k.tollCost, 0);
    assert.equal(k.otherCost, 0);
    assert.equal(k.totalExpense, 0);
    assert.equal(k.costPerKm, 0);
    assert.ok(!Number.isNaN(k.totalExpense));
    assert.ok(!Number.isNaN(k.averageMileage));
    assert.equal(res.body.costCenters.length, 5);
    assert.ok(Array.isArray(res.body.weekly));
  });

  it("2. zero-data week has no 100% fake category and no NaN", async () => {
    const res = await analytics("?fromDate=2026-08-01&toDate=2026-08-31");
    const centers = res.body.costCenters;
    const sum = centers.reduce((s: number, c: any) => s + c.amount, 0);
    assert.equal(sum, 0);
    for (const c of centers) assert.equal(c.percentage, 0);
  });

  it("3. FRONTEND/BACKEND SYNC: total expense exactly ₹2000", async () => {
    const v = await seedVehicle();
    await seedTrip(v.id, { date: "2026-08-10", totalKm: 100, tolls: 100, other: 50, driverBata: 150 });
    await seedFuel(v.id, { date: "2026-08-10", litres: 10, amount: 1000 });
    await seedMaintenance(v.id, { date: "2026-08-10", totalCost: 500 });
    await seedEmi(v.id, { dueDate: "2026-08-15", emiAmount: 200 });

    const res = await analytics("?fromDate=2026-08-01&toDate=2026-08-31");
    assert.equal(res.status, 200);
    const k = res.body.kpis;
    assert.equal(k.fuelCost, 1000);
    assert.equal(k.maintenanceCost, 500);
    assert.equal(k.emiDue, 200);
    // tolls: pickup+delivery+destination = 100*3
    assert.equal(k.tollCost, 300);
    // other: other(50) + driverBata(150)
    assert.equal(k.otherCost, 200);
    assert.equal(k.totalExpense, 1000 + 500 + 200 + 300 + 200);
    assert.equal(k.totalTrips, 1);
    assert.equal(k.totalDistance, 100);
    assert.equal(k.averageMileage, 10);
    assert.equal(k.costPerKm, 22);
  });

  it("4. total expense matches costCenters sum exactly", async () => {
    const v = await seedVehicle();
    await seedTrip(v.id, { date: "2026-08-10", totalKm: 100, tolls: 100, other: 50, driverBata: 150 });
    await seedFuel(v.id, { date: "2026-08-10", litres: 10, amount: 1000 });
    await seedMaintenance(v.id, { date: "2026-08-10", totalCost: 500 });
    await seedEmi(v.id, { dueDate: "2026-08-15", emiAmount: 200 });
    const res = await analytics("?fromDate=2026-08-01&toDate=2026-08-31");
    const sum = res.body.costCenters.reduce((s: number, c: any) => s + c.amount, 0);
    assert.equal(sum, res.body.kpis.totalExpense);
  });

  it("5. TRIP COUNT: only Completed + non-deleted in range", async () => {
    const v = await seedVehicle();
    await seedTrip(v.id, { date: "2026-08-10", totalKm: 100 }); // A completed
    await seedTrip(v.id, { date: "2026-08-11", totalKm: 200 }); // B completed
    await seedTrip(v.id, { date: "2026-08-12", totalKm: 300, status: "Pending" }); // C pending
    await seedTrip(v.id, { date: "2026-08-13", totalKm: 400, deleted: true }); // D deleted
    await seedTrip(v.id, { date: "2026-09-14", totalKm: 500 }); // outside range
    const res = await analytics("?fromDate=2026-08-01&toDate=2026-08-31");
    assert.equal(res.body.kpis.totalTrips, 2);
    assert.equal(res.body.kpis.totalDistance, 300);
  });

  it("6. VEHICLE FILTER uses vehicle_id: only the selected vehicle", async () => {
    const a = await seedVehicle();
    const b = await seedVehicle();
    await seedTrip(a.id, { date: "2026-08-10", totalKm: 100 });
    await seedTrip(b.id, { date: "2026-08-10", totalKm: 500 });
    await seedFuel(a.id, { date: "2026-08-10", litres: 10, amount: 1000 });
    await seedFuel(b.id, { date: "2026-08-10", litres: 50, amount: 5000 });
    const ra = await analytics(`?fromDate=2026-08-01&toDate=2026-08-31&vehicleId=${a.id}`);
    assert.equal(ra.body.kpis.totalDistance, 100);
    assert.equal(ra.body.kpis.fuelCost, 1000);
    assert.equal(ra.body.vehicleStats.length, 1);
    const rb = await analytics(`?fromDate=2026-08-01&toDate=2026-08-31&vehicleId=${b.id}`);
    assert.equal(rb.body.kpis.totalDistance, 500);
    assert.equal(rb.body.kpis.fuelCost, 5000);
    // clear filter = all
    const rall = await analytics("?fromDate=2026-08-01&toDate=2026-08-31");
    assert.equal(rall.body.kpis.totalDistance, 600);
    assert.equal(rall.body.vehicleStats.length, 2);
  });

  it("7. invalid vehicleId returns 422", async () => {
    const res = await analytics("?vehicleId=999999");
    assert.equal(res.status, 422);
  });

  it("8. vehicleId 0 / negative / decimal / string are rejected", async () => {
    for (const qs of ["vehicleId=0", "vehicleId=-5", "vehicleId=1.5", "vehicleId=abc"]) {
      const res = await analytics(`?${qs}`);
      assert.equal(res.status, 400, qs);
    }
  });

  it("9. fuel uses PostgreSQL source with ops_status Approved gating (matches Fuel list rule)", async () => {
    const v = await seedVehicle();
    await seedFuel(v.id, { date: "2026-08-10", litres: 10, amount: 1000 });
    await seedFuel(v.id, { date: "2026-08-11", litres: 5, amount: 500, opsStatus: "Pending Approval" });
    await seedFuel(v.id, { date: "2026-08-12", litres: 5, amount: 500, deleted: true });
    await seedFuel(v.id, { date: "2026-08-13", litres: 20, amount: 2000, sourceType: "TRIP", opsStatus: "Approved" });
    await seedFuel(v.id, { date: "2026-08-14", litres: 20, amount: 2000, sourceType: "TRIP", opsStatus: "Pending Approval" });
    const res = await analytics("?fromDate=2026-08-01&toDate=2026-08-31");
    // Authoritative Fuel list rule: non-deleted + (not TRIP OR TRIP approved).
    // included: manual approved 10L + manual pending 5L + TRIP approved 20L = 35L
    assert.equal(res.body.kpis.totalFuelLitres, 35);
    assert.equal(res.body.kpis.fuelCost, 3500);
  });

  it("10. maintenance only counts Approved + non-deleted", async () => {
    const v = await seedVehicle();
    await seedMaintenance(v.id, { date: "2026-08-10", totalCost: 500 });
    await seedMaintenance(v.id, { date: "2026-08-11", totalCost: 300, status: "Pending Approval" });
    await seedMaintenance(v.id, { date: "2026-08-12", totalCost: 400, status: "Rejected" });
    await seedMaintenance(v.id, { date: "2026-08-13", totalCost: 200, deleted: true });
    const res = await analytics("?fromDate=2026-08-01&toDate=2026-08-31");
    assert.equal(res.body.kpis.maintenanceCost, 500);
  });

  it("11. EMI counts active/overdue whose next due date is in range; excludes paid and out-of-range", async () => {
    const v = await seedVehicle();
    await seedEmi(v.id, { dueDate: "2026-08-15", emiAmount: 200 }); // active, in range -> include
    const v2 = await seedVehicle();
    await seedEmi(v2.id, { dueDate: "2026-08-15", emiAmount: 300, status: "paid" }); // paid -> exclude
    const v3 = await seedVehicle();
    await seedEmi(v3.id, { dueDate: "2026-09-15", emiAmount: 400 }); // in-range next date but date outside -> exclude (due in Sept)
    const res = await analytics("?fromDate=2026-08-01&toDate=2026-08-31");
    assert.equal(res.body.kpis.emiDue, 200);
  });

  it("12. driver_bata is included in Other cost", async () => {
    const v = await seedVehicle();
    await seedTrip(v.id, { date: "2026-08-10", totalKm: 100, driverBata: 150, other: 50 });
    const res = await analytics("?fromDate=2026-08-01&toDate=2026-08-31");
    assert.equal(res.body.kpis.otherCost, 200);
  });

  it("13. weekly aggregation is Sunday-start and backend-owned", async () => {
    const v = await seedVehicle();
    // 2026-08-03 is a Monday (Sunday that week = 2026-08-02)
    await seedTrip(v.id, { date: "2026-08-03", totalKm: 100 });
    await seedFuel(v.id, { date: "2026-08-03", litres: 10, amount: 1000 });
    await seedTrip(v.id, { date: "2026-08-10", totalKm: 200 }); // next week (Sunday 08-09)
    await seedFuel(v.id, { date: "2026-08-10", litres: 20, amount: 2000 });
    const res = await analytics("?fromDate=2026-08-01&toDate=2026-08-31");
    const weekly = res.body.weekly;
    assert.ok(weekly.length >= 2);
    const first = weekly.find((w: any) => w.fuel === 10);
    assert.ok(first, "week with 10L exists");
    assert.equal(first.mileage, 10);
  });

  it("14. average mileage zero-safe when fuel is 0", async () => {
    const v = await seedVehicle();
    await seedTrip(v.id, { date: "2026-08-10", totalKm: 100 });
    const res = await analytics("?fromDate=2026-08-01&toDate=2026-08-31");
    assert.equal(res.body.kpis.averageMileage, 0);
    assert.ok(!Number.isNaN(res.body.kpis.averageMileage));
  });

  it("15. cost per km zero-safe when distance is 0", async () => {
    const v = await seedVehicle();
    await seedFuel(v.id, { date: "2026-08-10", litres: 10, amount: 1000 });
    const res = await analytics("?fromDate=2026-08-01&toDate=2026-08-31");
    assert.equal(res.body.kpis.costPerKm, 0);
    assert.ok(!Number.isNaN(res.body.kpis.costPerKm));
  });

  it("16. deterministic top performers tie-break by vehicle_number", async () => {
    const a = await seedVehicle();
    const b = await seedVehicle();
    await seedTrip(a.id, { date: "2026-08-10", totalKm: 200 });
    await seedFuel(a.id, { date: "2026-08-10", litres: 10, amount: 1000 });
    await seedTrip(b.id, { date: "2026-08-10", totalKm: 200 });
    await seedFuel(b.id, { date: "2026-08-10", litres: 10, amount: 1000 });
    const res = await analytics("?fromDate=2026-08-01&toDate=2026-08-31");
    const top = res.body.topPerformers;
    assert.equal(top.length, 2);
    // equal mileage -> alphabetical vehicle_number ascending
    assert.equal(top[0].vehicleNumber < top[1].vehicleNumber, true);
    assert.equal(top[0].mileage, 20);
  });

  it("17. highest expense includes EMI and sorts deterministically", async () => {
    const a = await seedVehicle();
    await seedEmi(a.id, { dueDate: "2026-08-15", emiAmount: 500 });
    const b = await seedVehicle();
    await seedMaintenance(b.id, { date: "2026-08-10", totalCost: 300 });
    const res = await analytics("?fromDate=2026-08-01&toDate=2026-08-31");
    const high = res.body.highestExpense;
    assert.equal(high[0].vehicleId, a.id);
    assert.equal(high[0].emiCost, 500);
    assert.equal(high[0].totalExpense, 500);
    assert.equal(high[0].maintenanceCost, 0);
  });

  it("18. same from/to single-day range", async () => {
    const v = await seedVehicle();
    await seedTrip(v.id, { date: "2026-08-10", totalKm: 100 });
    await seedTrip(v.id, { date: "2026-08-11", totalKm: 200 });
    const res = await analytics("?fromDate=2026-08-10&toDate=2026-08-10");
    assert.equal(res.body.kpis.totalTrips, 1);
    assert.equal(res.body.kpis.totalDistance, 100);
    assert.equal(res.body.weekly.length, 1);
  });

  it("19. cross-month range", async () => {
    const v = await seedVehicle();
    await seedTrip(v.id, { date: "2026-07-15", totalKm: 100 });
    await seedTrip(v.id, { date: "2026-08-15", totalKm: 200 });
    const res = await analytics("?fromDate=2026-07-01&toDate=2026-08-31");
    assert.equal(res.body.kpis.totalTrips, 2);
    assert.equal(res.body.kpis.totalDistance, 300);
  });

  it("20. cross-year range", async () => {
    const v = await seedVehicle();
    await seedTrip(v.id, { date: "2025-12-31", totalKm: 100 });
    await seedTrip(v.id, { date: "2026-01-01", totalKm: 200 });
    const res = await analytics("?fromDate=2025-12-01&toDate=2026-01-31");
    assert.equal(res.body.kpis.totalTrips, 2);
    assert.equal(res.body.kpis.totalDistance, 300);
  });

  it("21. leap year Feb 29 valid", async () => {
    const res = await analytics("?fromDate=2024-02-29&toDate=2024-02-29");
    assert.equal(res.status, 200);
    assert.equal(res.body.weekly.length, 1);
  });

  it("22. invalid leap day Feb 30 rejected", async () => {
    const res = await analytics("?fromDate=2026-02-30&toDate=2026-03-01");
    assert.equal(res.status, 400);
  });

  it("23. invalid month rejected", async () => {
    const res = await analytics("?fromDate=2026-13-01&toDate=2026-12-31");
    assert.equal(res.status, 400);
  });

  it("24. invalid day rejected", async () => {
    const res = await analytics("?fromDate=2026-01-32&toDate=2026-02-01");
    assert.equal(res.status, 400);
  });

  it("25. fromDate > toDate rejected", async () => {
    const res = await analytics("?fromDate=2026-08-31&toDate=2026-08-01");
    assert.equal(res.status, 400);
  });

  it("26. malformed date string rejected", async () => {
    const res = await analytics("?fromDate=2026/08/01&toDate=2026-08-01");
    assert.equal(res.status, 400);
  });

  it("27. future range returns empty but valid", async () => {
    const res = await analytics("?fromDate=2030-01-01&toDate=2030-01-31");
    assert.equal(res.status, 200);
    assert.equal(res.body.kpis.totalTrips, 0);
  });

  it("28. huge range (100 years) rejected with 400", async () => {
    const res = await analytics("?fromDate=1950-01-01&toDate=2050-01-01");
    assert.equal(res.status, 400);
  });

  it("29. exactly 50-year range boundary accepted", async () => {
    const res = await analytics("?fromDate=1976-01-01&toDate=2026-01-01");
    assert.equal(res.status, 200);
  });

  it("30. unknown query params are stripped, not fatal", async () => {
    const res = await analytics("?fromDate=2026-08-01&toDate=2026-08-31&bogus=1");
    assert.equal(res.status, 200);
  });

  it("31. empty parameters defaults to current month", async () => {
    const res = await analytics("");
    assert.equal(res.status, 200);
    assert.ok(res.body.kpis.totalTrips >= 0);
  });

  it("32. deleted trip excluded from distance and other/toll cost", async () => {
    const v = await seedVehicle();
    await seedTrip(v.id, { date: "2026-08-10", totalKm: 100, tolls: 100, other: 50, deleted: true });
    const res = await analytics("?fromDate=2026-08-01&toDate=2026-08-31");
    assert.equal(res.body.kpis.totalTrips, 0);
    assert.equal(res.body.kpis.totalDistance, 0);
    assert.equal(res.body.kpis.tollCost, 0);
    assert.equal(res.body.kpis.otherCost, 0);
  });

  it("33. large values aggregate without overflow", async () => {
    const v = await seedVehicle();
    await seedTrip(v.id, { date: "2026-08-10", totalKm: 100000 });
    await seedFuel(v.id, { date: "2026-08-10", litres: 5000, amount: 400000 });
    const res = await analytics("?fromDate=2026-08-01&toDate=2026-08-31");
    assert.equal(res.body.kpis.totalDistance, 100000);
    assert.equal(res.body.kpis.fuelCost, 400000);
  });

  it("34. vehicleStats exposes per-vehicle full breakdown", async () => {
    const a = await seedVehicle();
    await seedTrip(a.id, { date: "2026-08-10", totalKm: 100, tolls: 10, other: 5, driverBata: 1 });
    await seedFuel(a.id, { date: "2026-08-10", litres: 10, amount: 1000 });
    await seedMaintenance(a.id, { date: "2026-08-10", totalCost: 100 });
    await seedEmi(a.id, { dueDate: "2026-08-15", emiAmount: 50 });
    const res = await analytics("?fromDate=2026-08-01&toDate=2026-08-31");
    const stat = res.body.vehicleStats.find((s: any) => s.vehicleId === a.id);
    assert.ok(stat);
    assert.equal(stat.trips, 1);
    assert.equal(stat.distance, 100);
    assert.equal(stat.fuelLitres, 10);
    assert.equal(stat.fuelCost, 1000);
    assert.equal(stat.maintenanceCost, 100);
    assert.equal(stat.emiCost, 50);
    assert.equal(stat.tollCost, 30); // 10*3
    assert.equal(stat.otherCost, 6); // 5+1
    assert.equal(stat.totalExpense, 1000 + 100 + 50 + 30 + 6);
    assert.equal(stat.mileage, 10);
  });

  it("35. no vehicle activity still returns vehicle in stats with zero values", async () => {
    const v = await seedVehicle();
    const res = await analytics("?fromDate=2026-08-01&toDate=2026-08-31");
    const stat = res.body.vehicleStats.find((s: any) => s.vehicleId === v.id);
    assert.ok(stat);
    assert.equal(stat.totalExpense, 0);
    assert.equal(stat.mileage, 0);
  });

  it("36. negative distance does not yield NaN (reported, not hidden)", async () => {
    const v = await seedVehicle();
    await seedTrip(v.id, { date: "2026-08-10", totalKm: -50 });
    const res = await analytics("?fromDate=2026-08-01&toDate=2026-08-31");
    // distance preserved; mileage & costPerKm remain finite zero-safe
    assert.equal(res.body.kpis.totalDistance, -50);
    assert.equal(res.body.kpis.averageMileage, 0);
    assert.equal(res.body.kpis.costPerKm, 0);
  });

  it("37. trip-origin fuel eligible once ops_status Approved (completion gate)", async () => {
    const v = await seedVehicle();
    await seedFuel(v.id, { date: "2026-08-10", litres: 30, amount: 3000, sourceType: "TRIP", opsStatus: "Approved" });
    const res = await analytics("?fromDate=2026-08-01&toDate=2026-08-31");
    assert.equal(res.body.kpis.totalFuelLitres, 30);
  });

  it("38. independent manual fuel preserved alongside trip fuel", async () => {
    const v = await seedVehicle();
    await seedFuel(v.id, { date: "2026-08-10", litres: 10, amount: 1000, sourceType: "MANUAL" });
    await seedFuel(v.id, { date: "2026-08-11", litres: 20, amount: 2000, sourceType: "TRIP", opsStatus: "Approved" });
    const res = await analytics("?fromDate=2026-08-01&toDate=2026-08-31");
    assert.equal(res.body.kpis.totalFuelLitres, 30);
    assert.equal(res.body.kpis.fuelCost, 3000);
  });

  it("39. previous month / previous year ranges", async () => {
    const v = await seedVehicle();
    await seedTrip(v.id, { date: "2026-07-10", totalKm: 100 });
    const res = await analytics("?fromDate=2026-07-01&toDate=2026-07-31");
    assert.equal(res.body.kpis.totalTrips, 1);
    const ry = await analytics("?fromDate=2025-01-01&toDate=2025-12-31");
    assert.equal(ry.body.kpis.totalTrips, 0);
  });

  it("40. full year aggregation includes all four quarters", async () => {
    const v = await seedVehicle();
    await seedTrip(v.id, { date: "2026-01-15", totalKm: 100 });
    await seedTrip(v.id, { date: "2026-06-15", totalKm: 200 });
    await seedTrip(v.id, { date: "2026-12-15", totalKm: 300 });
    const res = await analytics("?fromDate=2026-01-01&toDate=2026-12-31");
    assert.equal(res.body.kpis.totalTrips, 3);
    assert.equal(res.body.kpis.totalDistance, 600);
  });

  it("41. weekly partial first and last weeks are counted", async () => {
    const v = await seedVehicle();
    await seedTrip(v.id, { date: "2026-08-31", totalKm: 100 }); // Monday last day of Aug
    const res = await analytics("?fromDate=2026-08-28&toDate=2026-08-31");
    assert.equal(res.body.kpis.totalTrips, 1);
    // 08-28 (Fri) falls in the Sunday-08-23 week; 08-31 (Mon) in the Sunday-08-30 week.
    assert.equal(res.body.weekly.length, 2);
    const totalDist = res.body.weekly.reduce((s: number, w: any) => s + w.distance, 0);
    assert.equal(totalDist, 100);
  });
});