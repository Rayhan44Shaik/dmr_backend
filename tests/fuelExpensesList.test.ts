/** Fuel expenses list/getById regression: the exact GET /operations/fuel-expenses
 * list path (paginated + includeDeleted) and the trip travelDistance figure. */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();

const { pool } = await import("../src/config/db.js");
const { fuelExpensesService } = await import("../src/services/fuelExpensesService.js");

after(async () => {
  await testDb.close();
  await pool.end();
});

describe("fuel list smoke", () => {
  it("lists with includeDeleted + pagination (the 500ing query shape)", async () => {
    const v = await pool.query<{ id: number }>(
      `INSERT INTO vehicles (vehicle_no, vehicle_number, vehicle_type, no_of_boxes, bird_capacity, capacity_kg, status)
       VALUES (9001, 'SMOKE01', 'Lorry', 10, 1000, 2000, 'Active') RETURNING id`
    );
    await pool.query(
      `INSERT INTO fuel_expenses (bill_no, expense_date, vehicle_id, vehicle_no, meter_reading, amount, rate, litres, petrol_bunk, ops_status, created_by)
       VALUES ('FUEL-SMOKE-1', '2026-11-01', $1, 'SMOKE01', 1000, 1000, 100, 10, 'Bunk', 'Pending Approval', 'smoke')`,
      [v.rows[0].id]
    );
    const page = await fuelExpensesService.list({
      pagination: { page: 1, limit: 200, offset: 0 },
      includeDeleted: true,
    } as never);
    const rows = Array.isArray(page) ? page : page.data;
    assert.ok(rows.length >= 1);
    assert.equal((page as { meta: { total: number } }).meta.total >= 1, true);
  });

  it("computes travelDistance for trip-linked bills", async () => {
    const t = await pool.query<{ id: number }>(
      `INSERT INTO trips (trip_no, trip_date, status, opening_meter, end_meter) VALUES ('SMOKE-TRIP-1', '2026-11-01', 'Completed', 1000, 1250) RETURNING id`
    );
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO fuel_expenses (bill_no, expense_date, trip_id, source_type, meter_reading, amount, rate, litres, petrol_bunk, ops_status, created_by)
       VALUES ('FUEL-SMOKE-2', '2026-11-01', $1, 'TRIP', 1200, 500, 100, 5, 'Bunk', 'Approved', 'smoke') RETURNING id`,
      [t.rows[0].id]
    );
    const found = await fuelExpensesService.getById(inserted.rows[0].id);
    assert.equal(found.travelDistance, 250);
  });
});

describe("fuel distance source of truth (saved trip step-wise distance)", () => {
  it("prefers the saved trips.total_km over the odometer span", async () => {
    const t = await pool.query<{ id: number }>(
      `INSERT INTO trips (trip_no, trip_date, status, opening_meter, end_meter, total_km)
       VALUES ('SMOKE-TRIP-KM', '2026-11-02', 'Completed', 1000, 1250, 263.5) RETURNING id`
    );
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO fuel_expenses (bill_no, expense_date, trip_id, source_type, meter_reading, amount, rate, litres, petrol_bunk, ops_status, created_by)
       VALUES ('FUEL-SMOKE-KM', '2026-11-02', $1, 'TRIP', 1200, 500, 100, 5, 'Bunk', 'Approved', 'smoke') RETURNING id`,
      [t.rows[0].id]
    );
    const found = await fuelExpensesService.getById(inserted.rows[0].id);
    assert.equal(found.travelDistance, 263.5);
  });

  it("falls back to the odometer span only when total_km is not saved", async () => {
    const t = await pool.query<{ id: number }>(
      `INSERT INTO trips (trip_no, trip_date, status, opening_meter, end_meter, total_km)
       VALUES ('SMOKE-TRIP-ODO', '2026-11-02', 'Completed', 2000, 2300, 0) RETURNING id`
    );
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO fuel_expenses (bill_no, expense_date, trip_id, source_type, meter_reading, amount, rate, litres, petrol_bunk, ops_status, created_by)
       VALUES ('FUEL-SMOKE-ODO', '2026-11-02', $1, 'TRIP', 2200, 500, 100, 5, 'Bunk', 'Approved', 'smoke') RETURNING id`,
      [t.rows[0].id]
    );
    const found = await fuelExpensesService.getById(inserted.rows[0].id);
    assert.equal(found.travelDistance, 300);
  });

  it("manual bills carry no trip distance or load context", async () => {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO fuel_expenses (bill_no, expense_date, meter_reading, amount, rate, litres, petrol_bunk, ops_status, created_by)
       VALUES ('FUEL-SMOKE-MAN', '2026-11-02', 1000, 1000, 100, 10, 'Bunk', 'Pending Approval', 'smoke') RETURNING id`
    );
    const found = await fuelExpensesService.getById(inserted.rows[0].id);
    assert.equal(found.travelDistance, null);
    assert.deepEqual(found.tripLoads, []);
    assert.equal(found.tripLoadCount, 0);
  });

  it("exposes the linked multi-load trip DC/load context for the Load 1/Load 2 display", async () => {
    const t = await pool.query<{ id: number }>(
      `INSERT INTO trips (trip_no, trip_date, status, opening_meter, end_meter, total_km, leg_count)
       VALUES ('SMOKE-TRIP-ML', '2026-11-02', 'Completed', 5000, 5600, 600, 2) RETURNING id`
    );
    const tripId = t.rows[0].id;
    await pool.query(
      `INSERT INTO trip_legs (trip_id, leg_index, source_farm, total_birds, dc_weight, pickup_step_submitted)
       VALUES ($1, 1, 'Farm A', 400, 800, TRUE), ($1, 2, 'Farm B', 300, 600, TRUE)`,
      [tripId]
    );
    const first = await pool.query<{ id: string }>(
      `INSERT INTO fuel_expenses (bill_no, expense_date, trip_id, trip_fuel_entry_index, source_type, meter_reading, amount, rate, litres, petrol_bunk, ops_status, created_by)
       VALUES ('FUEL-SMOKE-ML1', '2026-11-02', $1, 1, 'TRIP', 5200, 2000, 100, 20, 'Bunk', 'Approved', 'smoke') RETURNING id`,
      [tripId]
    );
    await pool.query(
      `INSERT INTO fuel_expenses (bill_no, expense_date, trip_id, trip_fuel_entry_index, source_type, meter_reading, amount, rate, litres, petrol_bunk, ops_status, created_by)
       VALUES ('FUEL-SMOKE-ML2', '2026-11-02', $1, 2, 'TRIP', 5400, 1500, 100, 15, 'Bunk', 'Approved', 'smoke')`,
      [tripId]
    );
    const found = await fuelExpensesService.getById(first.rows[0].id);
    assert.equal(found.travelDistance, 600);
    assert.equal(found.tripFuelEntryIndex, 1);
    assert.equal(found.tripLoadCount, 2);
    assert.deepEqual(
      (found.tripLoads ?? []).map((load) => [load.load, load.farmName, load.dcWeight, load.birds]),
      [[1, "Farm A", 800, 400], [2, "Farm B", 600, 300]],
    );
    // Every bill on the same trip reads the same saved trip distance.
    const page = await fuelExpensesService.list({ search: "SMOKE-TRIP-ML", includeDeleted: true } as never);
    const rows = Array.isArray(page) ? page : page.data;
    const tripRows = rows.filter((row) => row.tripNo === "SMOKE-TRIP-ML");
    assert.equal(tripRows.length, 2);
    for (const row of tripRows) assert.equal(row.travelDistance, 600);
  });
});
