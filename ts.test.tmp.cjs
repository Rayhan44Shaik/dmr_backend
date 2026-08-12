const { Pool } = require("pg");
const p = new Pool({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });
(async () => {
  const tz = await p.query("SHOW TimeZone");
  console.log("TimeZone:", tz.rows[0].TimeZone);
  const localeStr = new Date().toLocaleString();
  const isoStr = new Date().toISOString();
  console.log("localeStr:", JSON.stringify(localeStr), "| isoStr:", JSON.stringify(isoStr));
  for (const v of [localeStr, isoStr]) {
    try {
      const r = await p.query("SELECT $1::timestamptz AS v", [v]);
      console.log("OK  ", JSON.stringify(v), "->", r.rows[0].v.toISOString());
    } catch (e) {
      console.log("FAIL", JSON.stringify(v), "->", e.message);
    }
  }
  await p.end();
})().catch((e) => { console.error(e); process.exit(1); });