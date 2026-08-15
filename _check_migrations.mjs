import pg from "pg";
const p = new pg.Pool({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries", connectionTimeoutMillis: 5000 });
const c = await p.connect();
try {
  const r = await c.query("SELECT id, filename, applied_at FROM schema_migrations ORDER BY id");
  console.log(`count=${r.rows.length}`);
  for (const x of r.rows) console.log(`  ${x.id} | ${x.filename}`);
  const cols = await c.query(
    "SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_name='salary_records' ORDER BY ordinal_position"
  );
  console.log("salary_records columns:");
  for (const x of cols.rows) console.log(`  ${x.column_name}:${x.data_type}:null=${x.is_nullable}`);
  const idx = await c.query("SELECT indexname, indexdef FROM pg_indexes WHERE tablename='salary_records'");
  console.log("salary_records indexes:");
  for (const x of idx.rows) console.log(`  ${x.indexname} | ${x.indexdef}`);
} finally {
  c.release();
  await p.end();
}