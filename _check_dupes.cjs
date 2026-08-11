const { Pool } = require("pg");
const p = new Pool({
  connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries",
});
(async () => {
  const checks = [
    ["shops (shop_name)", "SELECT LOWER(shop_name), COUNT(*) c FROM shops GROUP BY LOWER(shop_name) HAVING COUNT(*)>1"],
    ["vehicles (vehicle_number)", "SELECT LOWER(vehicle_number), COUNT(*) c FROM vehicles GROUP BY LOWER(vehicle_number) HAVING COUNT(*)>1"],
    ["farms (farm_name)", "SELECT LOWER(farm_name), COUNT(*) c FROM farms GROUP BY LOWER(farm_name) HAVING COUNT(*)>1"],
    ["banks (bank_name)", "SELECT LOWER(bank_name), COUNT(*) c FROM banks GROUP BY LOWER(bank_name) HAVING COUNT(*)>1"],
    ["bird_types (bird_type)", "SELECT LOWER(bird_type), COUNT(*) c FROM bird_types GROUP BY LOWER(bird_type) HAVING COUNT(*)>1"],
  ];
  for (const [label, sql] of checks) {
    const r = await p.query(sql);
    console.log(`${label}: ${r.rows.length > 0 ? "DUPES " + JSON.stringify(r.rows) : "clean"}`);
  }
  await p.end();
})().catch((e) => { console.error(e.message); process.exit(1); });