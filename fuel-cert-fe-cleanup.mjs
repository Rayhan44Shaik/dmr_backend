import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const TS = "251354";
const tripIds = (await c.query(`SELECT id FROM trips WHERE trip_no LIKE 'FECERT-${TS}-%'`)).rows.map((r) => r.id);
if (tripIds.length) {
  await c.query(`DELETE FROM fuel_expenses WHERE trip_id = ANY($1::int[])`, [tripIds]);
  await c.query(`DELETE FROM trip_diesel_entries WHERE trip_id = ANY($1::int[])`, [tripIds]);
  await c.query(`DELETE FROM trips WHERE id = ANY($1::int[])`, [tripIds]);
}
await c.query(`DELETE FROM fuel_expenses WHERE pump_name LIKE 'FEPump-${TS}%'`);
await c.query(`DELETE FROM vehicles WHERE vehicle_number LIKE 'FV-${TS}-%'`);
await c.query(`DELETE FROM application_users WHERE username = 'fecert-owner-${TS}'`);
const left = await c.query(
  `SELECT (SELECT COUNT(*) FROM trips WHERE trip_no LIKE 'FECERT-${TS}-%') AS trips,
          (SELECT COUNT(*) FROM fuel_expenses WHERE bill_no LIKE 'FECERT-${TS}-%' OR pump_name LIKE 'FEPump-${TS}%') AS fuel,
          (SELECT COUNT(*) FROM vehicles WHERE vehicle_number LIKE 'FV-${TS}-%') AS vehicles,
          (SELECT COUNT(*) FROM application_users WHERE username = 'fecert-owner-${TS}') AS users`
);
console.log("FE-LEFTOVER:" + JSON.stringify(left.rows[0]));
await c.end();
