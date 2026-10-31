import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const { pool } = await import("../src/config/db.js");
const { tripExpensesService } = await import("../src/services/tripExpensesService.js");

before(async () => {
  const vehicle = await pool.query(`INSERT INTO vehicles(vehicle_no,vehicle_number,vehicle_type,bird_capacity,capacity_kg,status) VALUES(9201,'EXP-01','Truck',1000,2000,'Active') RETURNING id`);
  const bunk = await pool.query(
    `INSERT INTO bird_types(bird_type_no,bird_type,average_weight,category,status)
     VALUES(9301,'Shiva Diesel',0,'Fuel Bunk','Active') RETURNING id`,
  );
  const trip = await pool.query(
    `INSERT INTO trips(
        trip_no,trip_date,status,vehicle_id,vehicle_no,driver_name,supervisor_name,
        meals,loading,meals_tiffin,others2_amt,vehicle_maintenance,vehicle_maintenance_note,
        expenses_step_submitted,deleted
      ) VALUES(
        'TR-EXP-1','2026-10-15','Completed',$1,'EXP-01','Driver One','Supervisor One',
        200,80,40,400,150,'Bolt fitting',TRUE,FALSE
      ) RETURNING id`,
    [vehicle.rows[0].id],
  );
  await pool.query(
    `INSERT INTO trip_diesel_entries(trip_id,row_index,litres,rate,meter,bunk_name,bunk_source,fuel_bunk_id)
     VALUES($1,1,10,90,1000,'Shiva Diesel','MASTER',$2),($1,2,5,90,1100,'HP Petrol Bunk','OTHER',NULL)`,
    [trip.rows[0].id, bunk.rows[0].id],
  );
});

after(async () => {
  await testDb.close();
  await pool.end();
});

describe("Operation expenses register", () => {
  it("maps S.PC to supervisor PC, V.M with note, and folds loading/tiffin into others", async () => {
    const result = await tripExpensesService.list({ includeMasterBunks: true });
    const row = result.data.find((item) => item.tripNo === "TR-EXP-1");
    assert.ok(row);
    assert.equal(row.supervisorPc, 400);
    assert.equal(row.vehicleMaintenance, 150);
    assert.equal(row.vehicleMaintenanceNote, "Bolt fitting");
    assert.equal(row.others, 120);
    assert.deepEqual(row.otherBreakdown.map((item) => item.name).sort(), ["Loading", "Tiffin"]);
    assert.equal(row.diesel, 1350);
    assert.equal(row.totalExpense, 2220);
  });

  it("excludes every Fuel Bunk master when Others is selected", async () => {
    const result = await tripExpensesService.list({ includeMasterBunks: false });
    const row = result.data.find((item) => item.tripNo === "TR-EXP-1");
    assert.ok(row);
    assert.equal(row.diesel, 450);
    assert.equal(row.dieselBreakdown.length, 1);
    assert.equal(row.dieselBreakdown[0]?.bunk, "HP Petrol Bunk");
    assert.equal(row.totalExpense, 1320);
  });
});
