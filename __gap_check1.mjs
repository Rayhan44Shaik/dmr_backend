import pg from "pg";
const client = new pg.Client({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });
await client.connect();
const trip = await client.query(
  `SELECT id, trip_no, total_birds, total_weight, total_birds_delivered, total_delivered_weight,
          total_mortality_count, total_mortality_weight, total_shops, dc_weight, farm_bird_count, farm_load_weight
   FROM trips WHERE id = 1008`
);
console.log("TRIP:", JSON.stringify(trip.rows[0], null, 2));
const deliveries = await client.query(
  `SELECT id, shop_name, birds, weight, mortality, rate, amount, deleted FROM trip_deliveries WHERE trip_id = 1008 ORDER BY id`
);
console.log("DELIVERIES:", JSON.stringify(deliveries.rows, null, 2));
await client.end();
