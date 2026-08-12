import pg from "pg";
const p = new pg.Pool({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });
// Remove leftover test employee/vehicle created by an earlier aborted run of my verify script.
const emp = await p.query(`SELECT id, employee_name FROM employees WHERE employee_name LIKE 'FixDrv-%' OR employee_name LIKE 'FixSup-%' OR employee_name LIKE 'FixHlp-%' OR employee_name LIKE 'FixLod-%' OR employee_name LIKE 'Step1Fix%' OR employee_name LIKE 'SFH %'`);
for (const x of emp.rows) {
  await p.query(`UPDATE trips SET driver_id=NULL, supervisor_id=NULL WHERE driver_id=$1 OR supervisor_id=$1`, [x.id]);
  await p.query(`UPDATE trip_crew SET employee_id=NULL WHERE employee_id=$1`, [x.id]);
  await p.query(`DELETE FROM employees WHERE id=$1`, [x.id]);
  console.log("deleted leftover test employee", x.id, x.employee_name);
}
const veh = await p.query(`SELECT id, vehicle_number FROM vehicles WHERE vehicle_number LIKE 'TEST-Step1Flow%' OR vehicle_number LIKE 'TEST-Step1Fix%' OR vehicle_number LIKE 'TEST-%' AND status='Active'`);
for (const x of veh.rows) {
  await p.query(`UPDATE trips SET vehicle_id=NULL WHERE vehicle_id=$1`, [x.id]);
  await p.query(`DELETE FROM vehicles WHERE id=$1`, [x.id]);
  console.log("deleted leftover test vehicle", x.id, x.vehicle_number);
}
await p.end();