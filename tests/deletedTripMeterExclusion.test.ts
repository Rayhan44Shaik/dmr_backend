/**
 * Deleted trips must not anchor fuel/meter validation.
 *
 * Regression: trip diesel rows sync into fuel_expenses (source_type = 'TRIP',
 * bill_no like 'TRF-…') but soft-deleting the trip left those fuel rows live,
 * so Step 1 opening-meter validation kept failing with
 * "Meter reading must be greater than the previous reading … (from Fuel
 * TRF-…)" against a deleted trip's fuel meter.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");
const { tripsService } = await import("../src/services/tripsService.js");
const { getLatestVehicleMeter, validateVehicleMeter } = await import("../src/utils/vehicleMeterLedger.js");

after(async () => {
  await testDb.close();
  await pool.end();
});

describe("deleted trip meter exclusion", () => {
  it("ignores fuel synced from a deleted trip in last-meter lookup", async () => {
    const vehicle = await mastersService.upsertVehicle({
      vehicleNumber: "TN38DMR001",
      vehicleType: "Lorry",
      noOfBoxes: 40,
      birdCapacity: 2000,
      capacityKg: 3000,
      engineNumber: "TNENGDEL001",
      chassisNumber: "TNCHSDEL001",
      status: "Active",
    });

    // Live trip with a modest opening meter (today's business date).
    const live = await pool.query(
      `INSERT INTO trips (trip_no, trip_date, vehicle_id, opening_meter, status)
       VALUES ('TR-LIVE-001', CURRENT_DATE, $1, 90000, 'Pending')
       RETURNING id`,
      [vehicle.id]
    );
    assert.ok(Number(live.rows[0].id) > 0);

    // Trip that will be deleted, carrying a high synced fuel meter.
    const doomed = await pool.query(
      `INSERT INTO trips (trip_no, trip_date, vehicle_id, opening_meter)
       VALUES ('TR-DOOMED-001', CURRENT_DATE, $1, 1000)
       RETURNING id`,
      [vehicle.id]
    );
    const doomedId = Number(doomed.rows[0].id);
    await pool.query(
      `INSERT INTO fuel_expenses
         (bill_no, expense_date, vehicle_id, trip_id, source_type, meter_reading, litres, rate, amount)
       VALUES ('TRF-20260921-004', CURRENT_DATE, $1, $2, 'TRIP', 205005, 10, 90, 900)`,
      [vehicle.id, doomedId]
    );

    // Deleting the trip must retire its synced fuel rows with it.
    await tripsService.softDelete(doomedId, "test cleanup");
    const fuel = await pool.query(`SELECT deleted FROM fuel_expenses WHERE bill_no = 'TRF-20260921-004'`);
    assert.equal(fuel.rows[0].deleted, true);

    // The Step 1 hint must skip the deleted trip's fuel and report live data.
    const latest = await tripsService.lastClosingMeter(vehicle.id);
    assert.ok(latest, "expected a latest meter reading");
    assert.notEqual(latest!.closingMeter, 205005);
    assert.equal(latest!.closingMeter, 90000);

    // Fleet Maintenance uses the universal endpoint directly and must observe
    // the exact same deleted-trip exclusion as Trip Step 1.
    const maintenanceLatest = await getLatestVehicleMeter(null, vehicle.id);
    assert.ok(maintenanceLatest);
    assert.equal(maintenanceLatest!.meter, 90000);
  });

  it("excludes the edited trip's own meters from last-meter lookup", async () => {
    const vehicle = await mastersService.upsertVehicle({
      vehicleNumber: "TN38DMR002",
      vehicleType: "Lorry",
      noOfBoxes: 40,
      birdCapacity: 2000,
      capacityKg: 3000,
      engineNumber: "TNENGDEL002",
      chassisNumber: "TNCHSDEL002",
      status: "Active",
    });
    const trip = await pool.query(
      `INSERT INTO trips (trip_no, trip_date, vehicle_id, opening_meter)
       VALUES ('TR-EDIT-001', CURRENT_DATE, $1, 50000)
       RETURNING id`,
      [vehicle.id]
    );
    const tripId = Number(trip.rows[0].id);
    await pool.query(
      `INSERT INTO fuel_expenses
         (bill_no, expense_date, vehicle_id, trip_id, source_type, meter_reading, litres, rate, amount)
       VALUES ('TRF-EDIT-001', CURRENT_DATE, $1, $2, 'TRIP', 60000, 10, 90, 900)`,
      [vehicle.id, tripId]
    );

    // Without exclusion the trip's own synced fuel is the latest reading.
    const unexcluded = await tripsService.lastClosingMeter(vehicle.id);
    assert.ok(unexcluded);
    assert.equal(unexcluded!.closingMeter, 60000);

    // Editing that trip must not see its own start meter or its own fuel.
    const excluded = await tripsService.lastClosingMeter(vehicle.id, tripId);
    assert.equal(excluded, null);
  });

  it("lets a trip close after its own diesel bills while retaining cross-trip chronology", async () => {
    const vehicle = await mastersService.upsertVehicle({
      vehicleNumber: "TN38DMR003",
      vehicleType: "Lorry",
      noOfBoxes: 40,
      birdCapacity: 2000,
      capacityKg: 3000,
      engineNumber: "TNENGDEL003",
      chassisNumber: "TNCHSDEL003",
      status: "Active",
    });
    const trip = await pool.query(
      `INSERT INTO trips
         (trip_no, trip_date, vehicle_id, opening_meter, closing_meter, created_at)
       VALUES ('TR-SELF-FUEL-001', CURRENT_DATE, $1, 800, 1000, NOW() - INTERVAL '2 hours')
       RETURNING id`,
      [vehicle.id]
    );
    const tripId = Number(trip.rows[0].id);
    await pool.query(
      `INSERT INTO fuel_expenses
         (bill_no, expense_date, vehicle_id, trip_id, source_type, meter_reading,
          litres, rate, amount, created_at)
       VALUES
         ('TRF-SELF-001', CURRENT_DATE, $1, $2, 'TRIP', 900, 10, 90, 900, NOW() - INTERVAL '1 hour'),
         ('TRF-SELF-002', CURRENT_DATE, $1, $2, 'TRIP', 999, 10, 90, 900, NOW())`,
      [vehicle.id, tripId]
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await assert.doesNotReject(() =>
        validateVehicleMeter(client, {
          vehicleId: vehicle.id,
          newMeter: 1000,
          eventDate: new Date().toISOString().slice(0, 10),
          eventInstant: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
          excludeTripId: tripId,
          context: "Trip closing meter",
        })
      );
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });
});
