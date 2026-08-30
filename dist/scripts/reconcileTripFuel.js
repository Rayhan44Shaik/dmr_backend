/**
 * Reconcile completed trips whose diesel bills are missing from fuel_expenses.
 * Fuel-only: never mutates trips, never rewrites posted Approved fuel.
 */
import { pool, withTransaction } from "../config/db.js";
import { ingestCompletedTripDieselToFuel } from "../utils/tripFuelSync.js";
async function main() {
    const dryRun = process.argv.includes("--dry-run");
    const client = await pool.connect();
    try {
        const trips = await client.query(`
      SELECT t.id, t.trip_no
      FROM trips t
      WHERE COALESCE(t.deleted, FALSE) = FALSE
        AND t.status = 'Completed'
        AND EXISTS (
          SELECT 1 FROM trip_diesel_entries d
          WHERE d.trip_id = t.id
            AND COALESCE(d.submitted, TRUE) = TRUE
            AND COALESCE(d.litres, 0) > 0
            AND COALESCE(d.rate, 0) > 0
        )
      ORDER BY t.id
    `);
        if (trips.rowCount === 0) {
            console.log("No completed trips with diesel bills found.");
            return;
        }
        console.log(`Found ${trips.rowCount} completed trip(s) with diesel bills.`);
        for (const t of trips.rows) {
            console.log(`  - Trip #${t.id} (${t.trip_no})`);
        }
        if (dryRun) {
            console.log("\n--dry-run: no changes made.");
            return;
        }
        const ingested = await withTransaction((tx) => ingestCompletedTripDieselToFuel(tx));
        console.log(`Done. ingest touched ${ingested} completed trip(s).`);
    }
    finally {
        client.release();
        await pool.end();
    }
}
main().catch((err) => {
    console.error("Reconciliation failed.");
    process.exitCode = 1;
});
//# sourceMappingURL=reconcileTripFuel.js.map