import pg from "pg";
const client = new pg.Client({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });
await client.connect();
const t = await client.query(`SELECT id, trip_no, total_birds, farm_bird_count, created_at, updated_at FROM trips WHERE id = 52`);
console.log("TRIP 52:", JSON.stringify(t.rows[0]));
const d = await client.query(`SELECT id, shop_name, birds, weight, mortality, created_at FROM trip_deliveries WHERE trip_id = 52`);
console.log("DELIVERIES:", JSON.stringify(d.rows));
await client.end();
