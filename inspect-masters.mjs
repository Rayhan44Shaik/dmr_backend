import pg from "pg";

const pool = new pg.Pool({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });

async function main() {
  console.log("=== vehicles ===");
  const v = await pool.query(`SELECT id, vehicle_number, status FROM vehicles ORDER BY id`);
  for (const r of v.rows) console.log(r);

  console.log("\n=== employees ===");
  const e = await pool.query(`SELECT id, employee_name, department, status FROM employees ORDER BY id`);
  for (const r of e.rows) console.log(r);

  await pool.end();
}
main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });