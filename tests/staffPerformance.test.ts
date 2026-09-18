import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const { pool } = await import("../src/config/db.js");
const { staffPerformanceService } = await import("../src/services/staffPerformanceService.js");

let driverId = 0, supervisorId = 0;
before(async () => {
  const employees = await pool.query(`INSERT INTO employees(employee_no,employee_name,department,role,phone_number,salary,status)
    VALUES(9101,'Driver Evidence','Fleet','Driver','9999999101',20000,'Active'),(9102,'Supervisor Evidence','Operations','Supervisor','9999999102',25000,'Active') RETURNING id,role`);
  driverId = Number(employees.rows.find((r) => r.role === "Driver").id);
  supervisorId = Number(employees.rows.find((r) => r.role === "Supervisor").id);
  const vehicle = await pool.query(`INSERT INTO vehicles(vehicle_no,vehicle_number,vehicle_type,bird_capacity,capacity_kg,status) VALUES(9101,'PERF-01','Truck',1000,2000,'Active') RETURNING id`);
  const trip = await pool.query(`INSERT INTO trips(trip_no,trip_date,status,vehicle_id,vehicle_no,driver_id,driver_name,supervisor_id,supervisor_name,total_km,total_shops,total_birds_delivered,total_delivered_weight,total_mortality_count,weight_loss,vehicle_maintenance,deleted)
    VALUES('TRIP-PERF-1','2026-09-15','Completed',$1,'PERF-01',$2,'Driver Evidence',$3,'Supervisor Evidence',120,3,900,1800,9,4.5,250,FALSE) RETURNING id`, [vehicle.rows[0].id, driverId, supervisorId]);
  await pool.query(`INSERT INTO trip_diesel_entries(trip_id,row_index,litres,rate,meter) VALUES($1,0,20,90,1000)`, [trip.rows[0].id]);
});
after(async () => { await testDb.close(); await pool.end(); });

describe("Staff performance database aggregation", () => {
  it("returns deterministic driver KPIs, weekly data and detail", async () => {
    const result = await staffPerformanceService.drivers({ fromDate: "2026-09-01", toDate: "2026-09-30", personId: driverId });
    assert.equal(result.rows.length, 1); assert.equal(result.kpis.trips, 1); assert.equal(result.kpis.distance, 120);
    assert.equal(result.kpis.fuelLitres, 20); assert.equal(result.kpis.fuelCost, 1800); assert.equal(result.kpis.maintenanceCost, 250);
    assert.equal(result.kpis.mileage, 6); assert.equal(result.weekly[0].week, "2026-09-14"); assert.equal(result.detail?.recentTrips.length, 1);
  });
  it("returns deterministic supervisor delivery KPIs and detail", async () => {
    const result = await staffPerformanceService.supervisors({ fromDate: "2026-09-01", toDate: "2026-09-30", personId: supervisorId });
    assert.equal(result.kpis.shops, 3); assert.equal(result.kpis.birds, 900); assert.equal(result.kpis.mortality, 9); assert.equal(result.kpis.mortalityRate, 1);
    assert.equal(result.rows[0].weight, 1800); assert.equal(result.rows[0].weightLoss, 4.5); assert.equal(result.detail?.recentTrips[0].tripNo, "TRIP-PERF-1");
  });
  it("rejects invalid, reversed, and oversized ranges", async () => {
    await assert.rejects(() => staffPerformanceService.drivers({ fromDate: "bad", toDate: "2026-09-30" }));
    await assert.rejects(() => staffPerformanceService.drivers({ fromDate: "2026-10-01", toDate: "2026-09-30" }));
    await assert.rejects(() => staffPerformanceService.drivers({ fromDate: "2025-01-01", toDate: "2026-09-30" }));
  });
});
