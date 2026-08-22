import pg from "pg";
const pool = new pg.Pool({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });
async function main() {
  try {
    const r = await pool.query(`SELECT filename, applied_at FROM schema_migrations ORDER BY id`);
    console.log("=== schema_migrations ===");
    for (const row of r.rows) console.log(row);
  } catch (e) {
    console.log("schema_migrations ERROR:", e.message);
  }
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });