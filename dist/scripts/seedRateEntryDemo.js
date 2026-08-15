import { pool } from "../config/db.js";
async function main() {
    const shop = await pool.query(`INSERT INTO shops (shop_no, shop_name) VALUES ($1, $2) RETURNING id`, [900001, "Demo Verify Shop"]);
    const shopId = shop.rows[0].id;
    const trip = await pool.query(`INSERT INTO trips (trip_no, trip_date, status, deleted, vehicle_no, driver_name, supervisor_name, source_farm, total_birds, total_weight, total_shops, dc_weight)
     VALUES ($1, CURRENT_DATE, 'Completed', FALSE, 'TN-01-DEMO', 'Demo Driver', 'Demo Supervisor', 'Demo Farm', 100, 200, 1, 200)
     RETURNING id`, [`DEMO-VERIFY-${Date.now()}`]);
    const tripId = trip.rows[0].id;
    const delivery = await pool.query(`INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, birds, weight, rate)
     VALUES ($1, $2, $3, $4, $5, $6, NULL)
     RETURNING id`, [tripId, `DEMO-VERIFY-${Date.now()}-S01`, shopId, "Demo Verify Shop", 100, 200]);
    console.log(JSON.stringify({ tripId, shopId, deliveryId: delivery.rows[0].id }));
    await pool.end();
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=seedRateEntryDemo.js.map