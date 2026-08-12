import pg from "pg";
const p = new pg.Pool({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });
(async () => {
  // Revert all Step 2-5 data my partial test run wrote into trip 52
  // (it must remain exactly as the user left it: Step 1 submitted, Draft).
  const r = await p.query(
    `UPDATE trips SET
       status = 'Draft',
       source_farm_id = NULL, source_farm = NULL, reached_time = NULL,
       dest_meter = NULL, pickup_tolls = 0, farm_address = NULL,
       avg_bird_weight = NULL, farm_remarks = NULL,
       farm_step_submitted = FALSE,
       dc_weight = 0, total_birds = 0, boxes = 0, avg_weight = 0,
       pickup_load_time = NULL, dc_photo_key = NULL,
       pickup_step_submitted = FALSE,
       delivery_step_submitted = FALSE,
       closing_meter = NULL, end_meter = NULL, end_time = NULL,
       delivery_tolls = 0, destination_tolls = 0, meals = 0, loading = 0,
       meals_tiffin = 0, vehicle_maintenance = 0, others_rc = 0,
       others1_amt = 0, others2_amt = 0, others3_amt = 0,
       others4_amt = 0, others5_amt = 0, fuel = 0, expense = 0,
       remarks = '', submitted_at = NULL,
       end_step_submitted = FALSE, expenses_step_submitted = FALSE,
       total_km = 0, total_shops = 0, total_weight = 0,
       total_delivered_weight = 0, total_birds_delivered = 0,
       total_mortality = 0, total_mortality_count = 0,
       total_mortality_weight = 0, weight_loss = 0, survival_rate = 0,
       last_shop = NULL, rate_completed = FALSE,
       updated_at = NOW()
     WHERE id = 52`
  );
  await p.query(`DELETE FROM trip_boxes WHERE trip_id = 52`);
  await p.query(`DELETE FROM trip_deliveries WHERE trip_id = 52`);
  await p.query(`DELETE FROM trip_diesel_entries WHERE trip_id = 52`);
  await p.query(`DELETE FROM trip_media WHERE trip_id = 52`);
  console.log("trip 52 reverted, rows updated:", r.rowCount);
  const chk = await p.query(`SELECT id, trip_no, trip_date, status, start_step_submitted, farm_step_submitted, vehicle_id, driver_id, supervisor_id FROM trips WHERE id=52`);
  console.log("trip 52 now:", chk.rows[0]);
  await p.end();
})().catch((e) => { console.error(e.message); process.exit(1); });