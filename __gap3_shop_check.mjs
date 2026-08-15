import pg from "pg";
const client = new pg.Client({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });
await client.connect();
const r = await client.query(`SELECT id, shop_name, status, updated_at FROM shops WHERE id IN (1,10)`);
console.log(JSON.stringify(r.rows));
await client.end();
