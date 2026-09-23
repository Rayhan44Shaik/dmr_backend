import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query(
  `SELECT (SELECT COUNT(*) FROM trips WHERE trip_no LIKE 'LIVE-%' OR trip_no LIKE 'FECERT-%') AS trips,
          (SELECT COUNT(*) FROM fuel_expenses WHERE bill_no LIKE 'LIVE-%' OR bill_no LIKE 'FECERT-%' OR pump_name LIKE 'LivePump-%' OR pump_name LIKE 'FEPump-%') AS fuel,
          (SELECT COUNT(*) FROM vehicles WHERE vehicle_number LIKE 'LV-%' OR vehicle_number LIKE 'FV-%') AS vehicles,
          (SELECT COUNT(*) FROM fleet_maintenance WHERE garage LIKE 'LG-%') AS maint,
          (SELECT COUNT(*) FROM employees WHERE email LIKE 'livedrv%' OR email LIKE 'fecert%') AS employees,
          (SELECT COUNT(*) FROM application_users WHERE username LIKE 'test-owner-%' OR username LIKE 'fecert-owner-%') AS users,
          (SELECT COUNT(*) FROM trip_diesel_entries td JOIN trips t ON t.id = td.trip_id WHERE t.trip_no LIKE 'LIVE-%' OR t.trip_no LIKE 'FECERT-%') AS diesel`
);
console.log("FINAL-SWEEP:" + JSON.stringify(r.rows[0]));
await c.end();
