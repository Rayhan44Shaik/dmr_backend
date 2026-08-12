const { Pool } = require("pg");
const p = new Pool({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries", max: 1 });
(async () => {
  const r = await p.query("SELECT count(*)::text as c FROM trips");
  console.log("trips:", r.rows[0].c);
  const s = await p.query("SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_type.oid = enumtypid WHERE typname='trip_status'");
  console.log("trip_status:", s.rows.map((x) => x.enumlabel).join(","));
  await p.end();
})().catch((e) => { console.error(e); process.exit(1); });