import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const TS = process.argv[2] || "545654";
const tripIds = (await c.query(`SELECT id FROM trips WHERE trip_no LIKE 'LIVE-${TS}-%'`)).rows.map((r) => r.id);
console.log("STRANDED-TRIPS:" + JSON.stringify(tripIds.length));
if (tripIds.length) {
  await c.query(`DELETE FROM fuel_expenses WHERE trip_id = ANY($1::int[])`, [tripIds]);
  await c.query(`DELETE FROM trip_diesel_entries WHERE trip_id = ANY($1::int[])`, [tripIds]);
  await c.query(`DELETE FROM trips WHERE id = ANY($1::int[])`, [tripIds]);
}
await c.query(`DELETE FROM fuel_expenses WHERE pump_name LIKE 'LivePump-${TS}%' OR bill_no LIKE 'LIVE-${TS}-%'`);
await c.query(`DELETE FROM fleet_maintenance WHERE garage LIKE 'LG-${TS}%'`);
await c.query(`DELETE FROM vehicles WHERE vehicle_number LIKE 'LV-${TS}-%'`);
await c.query(`DELETE FROM employees WHERE email LIKE 'livedrv${TS}%'`);
await c.query(`DELETE FROM application_users WHERE username LIKE 'test-owner-%' AND created_at > NOW() - INTERVAL '2 hours'`);
const owners = await c.query(`SELECT username, created_at FROM application_users WHERE username LIKE 'test-owner-%'`);
console.log("TEST-OWNERS:" + JSON.stringify(owners.rows));
const left = await c.query(
  `SELECT (SELECT COUNT(*) FROM trips WHERE trip_no LIKE 'LIVE-${TS}-%') AS trips,
          (SELECT COUNT(*) FROM fuel_expenses WHERE bill_no LIKE 'LIVE-${TS}-%' OR pump_name LIKE 'LivePump-${TS}%') AS fuel,
          (SELECT COUNT(*) FROM vehicles WHERE vehicle_number LIKE 'LV-${TS}-%') AS vehicles,
          (SELECT COUNT(*) FROM fleet_maintenance WHERE garage LIKE 'LG-${TS}%') AS maint,
          (SELECT COUNT(*) FROM employees WHERE email LIKE 'livedrv${TS}%') AS employees`
);
console.log("LEFTOVER-545654:" + JSON.stringify(left.rows[0]));
await c.end();
