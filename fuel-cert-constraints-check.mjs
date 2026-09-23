import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const fuel = await c.query(
  "SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'fuel_expenses'::regclass AND contype = 'u'"
);
console.log("FUEL-UNIQUES:" + JSON.stringify(fuel.rows));
const trips = await c.query(
  "SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'trips'::regclass AND contype = 'u'"
);
console.log("TRIP-UNIQUES:" + JSON.stringify(trips.rows));
await c.end();
