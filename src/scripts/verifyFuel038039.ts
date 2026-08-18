/**
 * Read-only verification of Fuel migrations 038/039 against DATABASE_URL.
 * Usage (existing tsx, same as other backend scripts):
 *   npx tsx src/scripts/verifyFuel038039.ts
 * Optional (idempotent re-apply of 039 SQL only, for catch-up after a 039 edit):
 *   npx tsx src/scripts/verifyFuel038039.ts --reapply-039
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../config/db.js";

async function one<T extends Record<string, unknown>>(sql: string, params: unknown[] = []) {
  const r = await pool.query<T>(sql, params);
  return r.rows;
}

async function main() {
  if (process.argv.includes("--reapply-039")) {
    const sqlPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../sql/039_fuel_trip_independence.sql");
    console.log("reapply", sqlPath);
    await pool.query(fs.readFileSync(sqlPath, "utf8"));
  }

  const applied = await one<{ filename: string }>(
    `SELECT filename FROM schema_migrations WHERE filename IN (
       '038_fuel_expenses_hardening.sql','039_fuel_trip_independence.sql'
     ) ORDER BY filename`
  );
  console.log("schema_migrations 038/039:", applied);

  const cols = await one(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_name = 'fuel_expenses'
       AND column_name IN (
         'trip_id','source_trip_id','source_trip_no','trip_fuel_entry_index',
         'bill_no','ops_status','amount','litres','rate',
         'gps_lat','gps_lon','gps_accuracy','gps_captured_at'
       )
     ORDER BY column_name`
  );
  console.log("fuel_expenses columns:", cols);

  const fks = await one<{ conname: string; def: string }>(
    `SELECT c.conname, pg_get_constraintdef(c.oid) AS def
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (c.conkey)
     WHERE t.relname = 'fuel_expenses' AND c.contype = 'f' AND a.attname = 'trip_id'`
  );
  console.log("trip_id FKs:", fks);

  const idx = await one<{ indexname: string; indexdef: string }>(
    `SELECT indexname, indexdef FROM pg_indexes
     WHERE tablename = 'fuel_expenses'
       AND indexname IN (
         'ux_fuel_expenses_manual_bill_no',
         'ux_fuel_expenses_source_trip_entry',
         'ux_fuel_expenses_trip_entry',
         'idx_fuel_expenses_source_trip_no',
         'idx_fuel_expenses_bill_no',
         'fuel_expenses_bill_no_key'
       )
     ORDER BY indexname`
  );
  console.log("indexes:", idx);

  const counts = await one(
    `SELECT
       (SELECT COUNT(*)::int FROM fuel_expenses) AS fuel_rows,
       (SELECT COUNT(*)::int FROM fuel_expenses WHERE source_type = 'TRIP') AS trip_rows,
       (SELECT COUNT(*)::int FROM fuel_expenses WHERE source_type = 'MANUAL') AS manual_rows,
       (SELECT COUNT(*)::int FROM fuel_expenses WHERE source_type = 'TRIP' AND source_trip_id IS NULL) AS trip_missing_source_id,
       (SELECT COUNT(*)::int FROM fuel_expenses WHERE source_type = 'TRIP' AND COALESCE(deleted, FALSE) = FALSE AND (source_trip_no IS NULL OR source_trip_no = '')) AS trip_missing_source_no,
       (SELECT COUNT(*)::int FROM (
          SELECT bill_no FROM fuel_expenses WHERE source_type = 'MANUAL' GROUP BY bill_no HAVING COUNT(*) > 1
        ) d) AS duplicate_manual_bill_no,
       (SELECT COUNT(*)::int FROM (
          SELECT source_trip_id, trip_fuel_entry_index
          FROM fuel_expenses
          WHERE source_type = 'TRIP' AND COALESCE(deleted, FALSE) = FALSE AND source_trip_id IS NOT NULL
          GROUP BY 1, 2 HAVING COUNT(*) > 1
        ) d) AS duplicate_source_trip_identity,
       (SELECT COUNT(*)::int FROM fuel_expenses fe
         WHERE fe.trip_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM trips t WHERE t.id = fe.trip_id)) AS invalid_trip_fk`
  );
  console.log("data checks:", counts);

  const seq = await one(`SELECT ymd, last_seq FROM fuel_manual_bill_seq ORDER BY ymd`);
  console.log("fuel_manual_bill_seq:", seq);

  const maxBills = await one(
    `SELECT substring(bill_no from '^BILL-(\\d{8})-') AS ymd,
            MAX(substring(bill_no from '^BILL-\\d{8}-(\\d+)$')::int) AS max_seq
     FROM fuel_expenses
     WHERE source_type = 'MANUAL' AND bill_no ~ '^BILL-\\d{8}-\\d+$'
     GROUP BY 1
     ORDER BY 1`
  );
  console.log("existing MANUAL bill max by date:", maxBills);

  const orphans = await one(
    `SELECT id, bill_no, trip_id, source_trip_id, source_trip_no, source_type, deleted, amount, litres, rate
     FROM fuel_expenses
     WHERE source_type = 'TRIP'
       AND (source_trip_id IS NULL OR source_trip_no IS NULL OR source_trip_no = '')`
  );
  console.log("TRIP rows missing snapshot identity:", orphans);

  const sampleBills = await one(
    `SELECT source_type, bill_no FROM fuel_expenses ORDER BY created_at DESC LIMIT 25`
  );
  console.log("sample bill_no:", sampleBills);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
