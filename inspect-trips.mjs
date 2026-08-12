import pg from "pg";

const pool = new pg.Pool({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });

async function main() {
  const trips = await pool.query(`
    SELECT id, trip_no, trip_date, status, deleted, vehicle_id, driver_id, supervisor_id,
           start_step_submitted, created_at, updated_at
    FROM trips ORDER BY id DESC LIMIT 60`);
  console.log("=== TRIPS (recent) ===");
  for (const r of trips.rows) {
    console.log(`${r.id}\t'${r.trip_no}'\t${r.trip_date}\t${r.status}\tdeleted=${r.deleted}\tveh=${r.vehicle_id}\tdrv=${r.driver_id}\tsup=${r.supervisor_id}\tssub=${r.start_step_submitted}\t${r.created_at}`);
  }

  console.log("\n=== trips with blank/odd trip_no ===");
  const bad = await pool.query(`
    SELECT id, trip_no, trip_date, status, deleted FROM trips
    WHERE trip_no IS NULL OR trip_no = '' OR trip_no !~ '^TR-[0-9]{8}-[0-9]{3}$'
    ORDER BY id`);
  console.log("count =", bad.rowCount);
  for (const r of bad.rows) console.log(r);

  console.log("\n=== per-date max sequence ===");
  const seq = await pool.query(`
    SELECT trip_date, COUNT(*) AS total,
           MAX((substring(trip_no from '\\d{3}$'))::int) AS max_seq,
           COUNT(*) FILTER (WHERE deleted) AS deleted,
           COUNT(*) FILTER (WHERE status='Draft') AS draft
    FROM trips WHERE trip_no ~ '^TR-\\d{8}-\\d{3}$'
    GROUP BY trip_date ORDER BY trip_date DESC LIMIT 15`);
  for (const r of seq.rows) console.log(`${r.trip_date}\ttotal=${r.total}\tmax_seq=${r.max_seq}\tdeleted=${r.deleted}\tdraft=${r.draft}`);

  console.log("\n=== duplicate trip_no? ===");
  const dup = await pool.query(`
    SELECT trip_no, COUNT(*) FROM trips GROUP BY trip_no HAVING COUNT(*) > 1`);
  console.log("dup count =", dup.rowCount);
  for (const r of dup.rows) console.log(r);

  console.log("\n=== trip_crew ===");
  const crew = await pool.query(`
    SELECT id, trip_id, employee_id, employee_name, role FROM trip_crew ORDER BY id DESC LIMIT 40`);
  for (const r of crew.rows) console.log(`${r.id}\ttrip=${r.trip_id}\temp=${r.employee_id}\t'${r.employee_name}'\t${r.role}`);

  console.log("\n=== Draft trips (resources occupied) ===");
  const drafts = await pool.query(`
    SELECT t.id, t.trip_no, t.trip_date, t.vehicle_id, t.driver_id, t.supervisor_id,
      (SELECT string_agg(employee_name,',') FROM trip_crew c WHERE c.trip_id=t.id AND c.role='helper') AS helpers,
      (SELECT string_agg(employee_name,',') FROM trip_crew c WHERE c.trip_id=t.id AND c.role='loader') AS loaders
    FROM trips t WHERE t.status='Draft' AND t.deleted=FALSE ORDER BY t.id`);
  for (const r of drafts.rows) console.log(r);

  console.log("\n=== constraints/indexes on trips ===");
  const idx = await pool.query(`
    SELECT indexname, indexdef FROM pg_indexes WHERE tablename='trips'`);
  for (const r of idx.rows) console.log(r.indexdef);

  await pool.end();
}

try {
  await main();
} catch (e) {
  console.error("ERROR:", e.message);
  process.exit(1);
}