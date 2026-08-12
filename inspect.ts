import { pool } from "./src/config/db.js";

async function q(label: string, text: string, params?: unknown[]) {
  const r = await pool.query(text, params);
  console.log(`\n=== ${label} (${r.rowCount} rows) ===`);
  console.table(r.rows);
  return r;
}

async function main() {
  await q("trips all", `SELECT id, trip_no, trip_date, status, deleted,
    start_step_submitted, end_step_submitted, expenses_step_submitted,
    vehicle_id, vehicle_no, driver_id, supervisor_id, opening_meter
    FROM trips ORDER BY trip_date DESC, id DESC LIMIT 40`);

  await q("trip_crew", `SELECT * FROM trip_crew ORDER BY trip_id LIMIT 80`);

  await q("distinct trip_no collisions", `
    SELECT trip_no, COUNT(*) c FROM trips GROUP BY trip_no HAVING COUNT(*) > 1`);

  await q("unique indexes on trips", `
    SELECT indexname, indexdef FROM pg_indexes WHERE tablename='trips'`);

  await q("constraints on trips", `
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint WHERE conrelid = 'trips'::regclass`);

  await q("constraints on trip_crew", `
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint WHERE conrelid = 'trip_crew'::regclass`);

  await q("max trip_no seq per date", `
    SELECT trip_date,
      max((substring(trip_no from '\\d{3}$'))::int) AS max_seq
    FROM trips WHERE trip_no ~ '^TR-\\d{8}-\\d{3}$'
    GROUP BY trip_date ORDER BY trip_date DESC LIMIT 10`);

  await q("duplicate vehicle active assignment", `
    SELECT vehicle_id, count(*) c
    FROM trips
    WHERE deleted = FALSE AND status <> 'Completed' AND vehicle_id IS NOT NULL
    GROUP BY vehicle_id HAVING count(*) > 1`);

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });