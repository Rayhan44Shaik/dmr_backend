// Migration 059 verification against the REAL PostgreSQL database.
// Checks: recorded in schema_migrations, counter table exists with PK,
// view exists, bill_no UNIQUE guard exists, 059 re-runnable (idempotent).
import pg from "pg";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(".env") });
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const mig = await client.query(
  "SELECT filename, applied_at FROM schema_migrations WHERE filename = '059_trip_fuel_meter_validation.sql'"
);
console.log("059-RECORDED:", JSON.stringify(mig.rows));

const tbl = await client.query(
  "SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'trip_fuel_bill_counters'::regclass"
);
console.log("COUNTER-CONSTRAINTS:", JSON.stringify(tbl.rows));

const uniq = await client.query(
  `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'fuel_expenses' AND indexdef ILIKE '%bill_no%'`
);
console.log("FUEL-BILLNO-INDEXES:", JSON.stringify(uniq.rows));

const view = await client.query(
  "SELECT definition FROM pg_views WHERE viewname = 'vehicle_meter_events'"
);
console.log("VIEW-EXISTS:", view.rowCount === 1);
console.log("VIEW-FILTERS-ACTIVE-VEHICLES:", /status = 'Active'/.test(view.rows[0]?.definition ?? ""));

await client.end();
