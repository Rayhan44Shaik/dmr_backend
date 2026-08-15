import pg from "pg";
const client = new pg.Client({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });
await client.connect();
const r = await client.query(`SELECT id, trip_no FROM trips WHERE trip_no LIKE 'TR-20260806%' ORDER BY id`);
console.log(JSON.stringify(r.rows));
const d = await client.query(`SELECT id, trip_id, shop_id FROM trip_deliveries WHERE sale_no LIKE 'GAP2%'`);
console.log("deliveries:", JSON.stringify(d.rows));
await client.end();
