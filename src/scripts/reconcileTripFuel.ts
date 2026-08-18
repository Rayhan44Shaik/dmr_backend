/**
 * Reconcile existing trips whose diesel/fuel entries never made it into
 * fuel_expenses (e.g. trips completed before the sync/columns existed).
 *
 * Safe to re-run: uses the same (trip_id, trip_fuel_entry_index) identity
 * and upsert logic as the live Step 5 sync, so it never duplicates a bill
 * that already exists, and never touches source_type = 'MANUAL' rows.
 *
 * Usage:
 *   npx tsx src/scripts/reconcileTripFuel.ts --dry-run   # report only
 *   npx tsx src/scripts/reconcileTripFuel.ts             # apply
 */
import { pool, withTransaction } from "../config/db.js";
import { syncDieselToFuelExpenses } from "../utils/tripFuelSync.js";
import { dateOnly, str, num } from "../utils/coerce.js";
import type { DieselEntry } from "../types/models.js";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const client = await pool.connect();
  try {
    const trips = await client.query(`
      SELECT t.id, t.trip_no, t.trip_date, t.vehicle_id, t.vehicle_no,
             t.driver_id, t.driver_name, t.supervisor_id, t.supervisor_name
      FROM trips t
      WHERE t.deleted = FALSE
        AND EXISTS (
          SELECT 1 FROM trip_diesel_entries d
          WHERE d.trip_id = t.id AND (COALESCE(d.litres, 0) > 0 OR COALESCE(d.rate, 0) > 0)
        )
        AND NOT EXISTS (
          SELECT 1 FROM fuel_expenses fe
          WHERE fe.trip_id = t.id AND fe.source_type = 'TRIP' AND COALESCE(fe.deleted, FALSE) = FALSE
        )
      ORDER BY t.id
    `);

    if (trips.rowCount === 0) {
      console.log("No completed trips found with missing Fuel Expense records. Nothing to do.");
      return;
    }

    console.log(
      `Found ${trips.rowCount} trip(s) with diesel entries but no synced Fuel Expense records:`
    );
    for (const t of trips.rows) {
      console.log(`  - Trip #${t.id} (${str(t.trip_no)})`);
    }

    if (dryRun) {
      console.log("\n--dry-run: no changes made. Re-run without --dry-run to apply.");
      return;
    }

    let createdTrips = 0;
    let createdBills = 0;

    for (const t of trips.rows) {
      const dieselRows = await client.query(
        `SELECT row_index, litres, rate, meter, bunk_name, bunk_gps, image_data, image_name,
                gps_lat, gps_lon, gps_accuracy, gps_captured_at
         FROM trip_diesel_entries WHERE trip_id = $1 ORDER BY row_index`,
        [t.id]
      );
      const entries: DieselEntry[] = dieselRows.rows.map((r) => ({
        rowIndex: num(r.row_index),
        litres: r.litres == null ? null : num(r.litres),
        rate: r.rate == null ? null : num(r.rate),
        meter: r.meter == null ? null : num(r.meter),
        bunkName: r.bunk_name == null ? null : str(r.bunk_name),
        bunkGps: r.bunk_gps == null ? null : str(r.bunk_gps),
        imageData: r.image_data == null ? null : str(r.image_data),
        imageName: r.image_name == null ? null : str(r.image_name),
        gpsLat: r.gps_lat == null ? null : num(r.gps_lat),
        gpsLon: r.gps_lon == null ? null : num(r.gps_lon),
        gpsAccuracy: r.gps_accuracy == null ? null : num(r.gps_accuracy),
        gpsCapturedAt: r.gps_captured_at == null ? null : str(r.gps_captured_at),
      }));

      const before = await client.query(
        `SELECT COUNT(*)::int AS c FROM fuel_expenses WHERE trip_id = $1 AND source_type = 'TRIP'`,
        [t.id]
      );

      await withTransaction(async (txClient) => {
        const tripRow = await txClient.query(`SELECT status FROM trips WHERE id = $1`, [t.id]);
        await syncDieselToFuelExpenses(txClient, t.id, dateOnly(t.trip_date) ?? "", entries, {
          vehicleId: t.vehicle_id == null ? null : num(t.vehicle_id),
          vehicleNo: t.vehicle_no == null ? null : str(t.vehicle_no),
          driverId: t.driver_id == null ? null : num(t.driver_id),
          driverName: t.driver_name == null ? null : str(t.driver_name),
          supervisorId: t.supervisor_id == null ? null : num(t.supervisor_id),
          supervisorName: t.supervisor_name == null ? null : str(t.supervisor_name),
          createdBy: "reconciliation-script",
          tripStatus: str(tripRow.rows[0]?.status),
          tripNo: t.trip_no == null ? null : str(t.trip_no),
        });

        if (str(tripRow.rows[0]?.status) === "Completed") {
          await txClient.query(
            `UPDATE fuel_expenses
               SET status = 'Approved', approved_by = 'reconciliation-script', approved_date = NOW(),
                   ops_status = 'Approved', updated_at = NOW()
             WHERE trip_id = $1 AND source_type = 'TRIP' AND status = 'Pending'
               AND COALESCE(deleted, FALSE) = FALSE`,
            [t.id]
          );
        }
      });

      const after = await client.query(
        `SELECT COUNT(*)::int AS c FROM fuel_expenses WHERE trip_id = $1 AND source_type = 'TRIP'`,
        [t.id]
      );
      const delta = (after.rows[0]?.c ?? 0) - (before.rows[0]?.c ?? 0);
      if (delta > 0) {
        createdTrips += 1;
        createdBills += delta;
        console.log(`  Trip #${t.id}: created ${delta} Fuel Expense record(s).`);
      }
    }

    console.log(
      `\nDone. ${createdBills} Fuel Expense record(s) created across ${createdTrips} trip(s).`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Reconciliation failed:", err);
  process.exitCode = 1;
});
