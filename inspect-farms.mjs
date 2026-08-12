import pg from "pg";
const pool = new pg.Pool({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });
async function main() {
  const f = await pool.query(`SELECT id, farm_name FROM farms ORDER BY id`);
  console.log("=== farms ==="); for (const r of f.rows) console.log(r);
  const s = await pool.query(`SELECT id, shop_name FROM shops ORDER BY id`);
  console.log("=== shops ==="); for (const r of s.rows) console.log(r);
  const e = await pool.query(`SELECT MAX(employee_no) max_e FROM employees`);
  console.log("max employee_no", e.rows[0]);
  const v = await pool.query(`SELECT MAX(vehicle_no) max_v, MAX(id) max_id FROM vehicles`);
  console.log("max vehicle_no", v.rows[0]);
  await pool.end();
}
main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });