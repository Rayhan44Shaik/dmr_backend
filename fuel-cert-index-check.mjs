import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const idx = await c.query(
  "SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('fuel_expenses', 'trip_diesel_entries') AND indexdef ILIKE '%trip_fuel_entry_index%'"
);
console.log("ENTRY-IDX:" + JSON.stringify(idx.rows, null, 1));
const all = await c.query(
  "SELECT indexname FROM pg_indexes WHERE tablename = 'fuel_expenses'"
);
console.log("ALL-FUEL-IDX:" + JSON.stringify(all.rows.map((r) => r.indexname)));
await c.end();
