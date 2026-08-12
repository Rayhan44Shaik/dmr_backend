import pg from "pg";
const pool = new pg.Pool({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });
async function main() {
  const e = await pool.query(`SELECT id, employee_no, employee_name, department, status FROM employees WHERE employee_name ILIKE '%TripTest%' ORDER BY id`);
  console.log("TripTest employees:", e.rowCount);
  for (const r of e.rows) console.log(`  id=${r.id} no=${r.employee_no} '${r.employee_name}' ${r.department} ${r.status}`);

  const v = await pool.query(`SELECT id, vehicle_no, vehicle_number, status FROM vehicles WHERE vehicle_number ILIKE '%TEST%' OR vehicle_no=9000 ORDER BY id`);
  console.log("TEST vehicles:", v.rowCount);
  for (const r of v.rows) console.log(`  id=${r.id} no=${r.vehicle_no} '${r.vehicle_number}' ${r.status}`);

  const t = await pool.query(`SELECT id, trip_no, trip_date, status, deleted FROM trips WHERE trip_date='2026-08-12' OR trip_date='2026-08-11' ORDER BY id`);
  console.log("trips:");
  for (const r of t.rows) console.log(`  #${r.id} ${r.trip_no} ${String(r.trip_date).slice(0,10)} ${r.status} del=${r.deleted}`);

  const crewtest = await pool.query(`SELECT c.id, c.trip_id, c.employee_id, c.employee_name, c.role FROM trip_crew c JOIN trips t ON t.id=c.trip_id WHERE c.employee_name ILIKE '%TripTest%' ORDER BY c.id`);
  console.log("TripTest crew:", crewtest.rowCount);
  for (const r of crewtest.rows) console.log(`  ${JSON.stringify(r)}`);
  await pool.end();
}
main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });