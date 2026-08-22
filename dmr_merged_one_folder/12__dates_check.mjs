import pg from "pg";
const p = new pg.Pool({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });
const r = await p.query(`SELECT id, trip_date::text AS d, trip_no, status, deleted FROM trips ORDER BY id`);
for (const x of r.rows) console.log(x.id, "|", x.d, "|", x.trip_no, "|", x.status, "| del=" + x.deleted);
await p.end();