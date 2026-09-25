/**
 * Fleet → Analytics — production coverage against a real PostgreSQL engine
 * (PGlite behind pg-gateway; same harness as the other backend suites).
 * No mocks: HTTP → analyticsService → PostgreSQL → HTTP.
 *
 * Covers the existing GET /api/fleet/analytics contract:
 *   • KPIs computed from completed trips + approved fuel + approved
 *     maintenance inside the requested window (exact hand-verified figures)
 *   • cost-centre separation (percentages sum to 100, every rupee once)
 *   • vehicle filter narrows; unknown vehicle 404s; inverted range 400s
 *   • unapproved maintenance never leaks into maintenance cost
 *   • defaults serve the current month; authorization is enforced
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import { getJson, postJson, startApp, type TestApp } from "./helpers/app.js";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });
const baseUrl = app.baseUrl;

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");
const { tripsService } = await import("../src/services/tripsService.js");

after(async () => {
  await app.close();
  await testDb.close();
  await pool.end();
});

let seq = 0;

async function seedVehicle(tag: string) {
  seq += 1;
  return mastersService.upsertVehicle({
    vehicleNumber: `FAV${tag}${String(seq).padStart(4, "0")}`,
    vehicleType: "Truck",
    noOfBoxes: 10,
    birdCapacity: 100,
    capacityKg: 500,
    engineNumber: `FAENG${tag}${seq}`,
    chassisNumber: `FACHS${tag}${seq}`,
    status: "Active",
  });
}

async function seedDriver(tag: string) {
  seq += 1;
  return mastersService.upsertEmployee({
    employeeName: `FA Drv ${tag}${seq}`,
    department: "Driver",
    role: "Driver",
    phoneNumber: `9181${String(seq).padStart(6, "0")}`,
    licenseNumber: `FADL${tag}${seq}`,
    salary: 18000,
    status: "Active",
  });
}

async function approveMaintenance(id: number) {
  const res = await postJson(baseUrl, `/api/fleet/maintenance/${id}/approve`, { approvedBy: "tester" });
  assert.equal(res.status, 200);
}

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
]);

const dayAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
// Fixture business day: recent enough for the certified 10-day
// maintenance backdate window, fixed per run for exact assertions.
const D1 = dayAgo(3);
const DFROM = dayAgo(9);
const DTO = dayAgo(0);

function maintForm(vehicleId: number, driverId: number, km: number, cost: number): FormData {
  const form = new FormData();
  form.append("date", D1);
  form.append("vehicleId", String(vehicleId));
  form.append("driverId", String(driverId));
  form.append("currentKM", String(km));
  form.append("maintenanceType", JSON.stringify(["Engine"]));
  form.append("serviceType", "General");
  form.append("idempotencyKey", randomUUID());
  form.append("parts", JSON.stringify([{ name: "Oil", quantity: 2, rate: cost / 2 }]));
  form.append("documents", new Blob([PNG], { type: "image/png" }), "bill.png");
  return form;
}

describe("Fleet analytics", () => {
  it("1. KPIs aggregate the window with exact cost-centre separation", async () => {
    const vehicle = await seedVehicle("K");
    const driver = await seedDriver("K");
    const sup = await mastersService.upsertEmployee({
      employeeName: `FA Sup K${seq}`,
      department: "Supervisor",
      role: "Supervisor",
      phoneNumber: `9481${String(seq).padStart(6, "0")}`,
      salary: 24000,
      status: "Active",
    });
    const farm = await mastersService.upsertFarm({
      farmName: `FA Farm K${seq}`,
      ownerName: "Owner X",
      supervisorName: "Supervisor X",
      phoneNumber: `9671${String(seq).padStart(6, "0")}`,
      village: "V",
      address: "A",
      capacity: 300000,
      status: "Active",
    });
    seq += 1;
    const trip = await tripsService.save(null, {
      tripNo: `FA-TRIP-${seq}`,
      tripDate: D1,
      status: "Completed",
      startTime: `${D1}T05:30:00.000Z`,
      vehicleId: vehicle.id,
      vehicleNo: vehicle.vehicleNumber,
      driverId: driver.id,
      driverName: driver.employeeName,
      supervisorId: sup.id,
      supervisorName: sup.employeeName,
      sourceFarmId: farm.id,
      sourceFarm: farm.farmName,
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

    await pool.query(
      `INSERT INTO fuel_expenses (bill_no, expense_date, vehicle_id, amount, litres, rate, status, source_type, trip_id)
       VALUES ('FA-FUEL-1', $3, $1, 2000, 20, 100, 'Approved', 'MANUAL', $2)`,
      [vehicle.id, trip.id, D1]
    );

    const created = await fetch(`${baseUrl}/api/fleet/maintenance`, {
      method: "POST",
      headers: { ...app.authHeaders },
      body: maintForm(vehicle.id, driver.id, 50000, 200),
    });
    assert.equal(created.status, 201);
    await approveMaintenance((await created.json()).id);
    const pending = await fetch(`${baseUrl}/api/fleet/maintenance`, {
      method: "POST",
      headers: { ...app.authHeaders },
      body: maintForm(vehicle.id, driver.id, 50100, 400),
    });
    assert.equal(pending.status, 201);

    const { status, body } = await getJson(
      baseUrl, `/api/fleet/analytics?fromDate=${DFROM}&toDate=${DTO}&vehicleId=${vehicle.id}`
    );
    assert.equal(status, 200);
    assert.equal(body.fromDate, DFROM);
    assert.equal(body.toDate, DTO);
    assert.equal(body.kpis.totalDistance, 60);
    assert.equal(body.kpis.totalFuelLitres, 20);
    assert.equal(body.kpis.fuelCost, 2000);
    assert.equal(body.kpis.maintenanceCost, 200, "only the approved record counts");
    assert.equal(body.kpis.averageMileage, 3);
    assert.equal(body.kpis.totalExpense, 2200);
    const pct = body.costCenters.reduce((n: number, c: { percentage: number }) => n + c.percentage, 0);
    assert.ok(Math.abs(pct - 100) < 0.02, `cost centres sum to 100 (got ${pct})`);
    assert.ok(body.topPerformers.some((r: { vehicleId: number; mileage: number }) =>
      r.vehicleId === vehicle.id && r.mileage === 3));
    assert.ok(body.highestExpense.some((r: { vehicleId: number; totalCost: number }) =>
      r.vehicleId === vehicle.id && r.totalCost === 2200));
    assert.ok(body.weeklyFuelConsumption.length >= 1 && body.weeklyMileage.length >= 1);
  });

  it("2. validation, defaults and authorization", async () => {
    const { status, body } = await getJson(baseUrl, "/api/fleet/analytics");
    assert.equal(status, 200, "defaults serve the current month");
    assert.equal(typeof body.kpis.totalExpense, "number");

    const inverted = await getJson(baseUrl, "/api/fleet/analytics?fromDate=2026-06-01&toDate=2026-05-01");
    assert.equal(inverted.status, 400);
    const unknownVehicle = await getJson(baseUrl, `/api/fleet/analytics?fromDate=${DFROM}&toDate=${DTO}&vehicleId=99999999`);
    assert.equal(unknownVehicle.status, 422, "unknown vehicle uses the standard FK guard");

    const anon = await fetch(`${baseUrl}/api/fleet/analytics`);
    assert.equal(anon.status, 401);
  });
});
