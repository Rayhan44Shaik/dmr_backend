import pg from "pg";
const p = new pg.Pool({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });

const samples = [
  new Date().toLocaleString(),
  new Date().toISOString(),
  "8/12/2026, 4:10:00 PM",
  "8/12/2026, 16:10:00",
];
for (const s of samples) {
  try {
    const r = await p.query(`SELECT $1::timestamptz AS v`, [s]);
    console.log(`OK   '${s}' -> ${r.rows[0].v}`);
  } catch (e) {
    console.log(`FAIL '${s}' -> ${e.code} ${e.message.split("\n")[0]}`);
  }
}
await p.end();