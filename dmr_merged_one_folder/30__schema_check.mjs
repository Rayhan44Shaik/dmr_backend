import pg from "pg";
const p = new pg.Pool({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });
const r = await p.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('trips','trip_crew')`);
for (const x of r.rows) console.log("IDX:", x.indexdef);
const t = await p.query(`SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name='trips' ORDER BY ordinal_position`);
console.log("--- trips columns ---");
for (const c of t.rows) console.log(c.column_name, "|", c.is_nullable, "|", c.column_default);
await p.end();