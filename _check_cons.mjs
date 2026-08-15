import pg from "pg";
const p = new pg.Pool({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries", connectionTimeoutMillis: 5000 });
const c = await p.connect();
try {
  const r = await c.query(
    "SELECT conname, pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid='salary_records'::regclass ORDER BY conname"
  );
  for (const x of r.rows) console.log(`  ${x.conname} | ${x.def}`);
} finally {
  c.release();
  await p.end();
}