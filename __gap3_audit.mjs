import pg from "pg";
const client = new pg.Client({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });
await client.connect();

async function run(label, sql) {
  const r = await client.query(sql);
  console.log(`\n-- ${label} --`);
  console.log(sql.trim());
  console.log("RESULT:", JSON.stringify(r.rows));
}

await run(
  "Duplicate Shop Sales (same trip+shop+birds+weight, active)",
  `SELECT trip_id, shop_id, birds, weight, COUNT(*) AS cnt
     FROM trip_deliveries WHERE deleted = FALSE AND shop_id IS NOT NULL
    GROUP BY trip_id, shop_id, birds, weight HAVING COUNT(*) > 1`
);

await run(
  "Orphan Shop Sales / deliveries (trip_id has no matching trips row)",
  `SELECT d.id, d.trip_id FROM trip_deliveries d
    LEFT JOIN trips t ON t.id = d.trip_id WHERE t.id IS NULL`
);

await run(
  "Invalid trip references on rate_entry (trip_id has no matching trips row)",
  `SELECT r.id, r.trip_id FROM rate_entry r
    LEFT JOIN trips t ON t.id = r.trip_id WHERE t.id IS NULL`
);

await run(
  "Invalid/inactive shop references on active Shop Sales (shop_id set but shop missing or inactive)",
  `SELECT d.id, d.trip_id, d.shop_id, s.status AS shop_status
     FROM trip_deliveries d LEFT JOIN shops s ON s.id = d.shop_id
    WHERE d.deleted = FALSE AND d.shop_id IS NOT NULL AND (s.id IS NULL OR s.status <> 'Active')`
);

await run(
  "Rates below 50 on active deliveries with a non-zero rate",
  `SELECT id, trip_id, shop_name, rate FROM trip_deliveries WHERE deleted = FALSE AND rate IS NOT NULL AND rate > 0 AND rate < 50`
);

await run(
  "Rates above 300 on active deliveries",
  `SELECT id, trip_id, shop_name, rate FROM trip_deliveries WHERE deleted = FALSE AND rate > 300`
);

await run(
  "Negative rates",
  `SELECT id, trip_id, shop_name, rate FROM trip_deliveries WHERE rate < 0`
);

await run(
  "Negative birds",
  `SELECT id, trip_id, shop_name, birds FROM trip_deliveries WHERE birds < 0`
);

await run(
  "Negative weight",
  `SELECT id, trip_id, shop_name, weight FROM trip_deliveries WHERE weight < 0`
);

await run(
  "Amount != weight * rate mismatches (active deliveries with rate>0), tolerance 0.01",
  `SELECT id, trip_id, shop_name, weight, rate, amount, ROUND(weight * rate, 2) AS expected
     FROM trip_deliveries
    WHERE deleted = FALSE AND rate > 0
      AND ABS(amount - ROUND(weight * rate, 2)) > 0.01`
);

await run(
  "Bird capacity violations (sum of active delivered+mortality birds > trip capacity)",
  `SELECT t.id AS trip_id, t.trip_no,
          COALESCE(NULLIF(t.farm_bird_count,0), t.total_birds) AS capacity_birds,
          SUM(d.birds + d.mortality) AS allocated_birds
     FROM trips t JOIN trip_deliveries d ON d.trip_id = t.id AND d.deleted = FALSE
    GROUP BY t.id, t.trip_no, t.farm_bird_count, t.total_birds
   HAVING SUM(d.birds + d.mortality) > COALESCE(NULLIF(t.farm_bird_count,0), t.total_birds)`
);

await run(
  "Weight capacity violations (sum of active delivered+mortality weight > trip capacity)",
  `SELECT t.id AS trip_id, t.trip_no,
          COALESCE(NULLIF(t.farm_load_weight,0), t.dc_weight) AS capacity_weight,
          SUM(d.weight + COALESCE(d.mort_kg,0)) AS allocated_weight
     FROM trips t JOIN trip_deliveries d ON d.trip_id = t.id AND d.deleted = FALSE
    GROUP BY t.id, t.trip_no, t.farm_load_weight, t.dc_weight
   HAVING SUM(d.weight + COALESCE(d.mort_kg,0)) > COALESCE(NULLIF(t.farm_load_weight,0), t.dc_weight)`
);

await run(
  "rate_entry.locked vs trips.rate_completed cache consistency",
  `SELECT t.id AS trip_id, t.trip_no, t.rate_completed, r.locked AS rate_entry_locked
     FROM trips t JOIN rate_entry r ON r.trip_id = t.id
    WHERE t.rate_completed IS DISTINCT FROM r.locked`
);

await run(
  "Unexpected locked rate_entry rows on trips NOT Approved/Completed",
  `SELECT r.id, r.trip_id, t.status, r.locked
     FROM rate_entry r JOIN trips t ON t.id = r.trip_id
    WHERE r.locked = TRUE AND t.status NOT IN ('Approved','Completed')`
);

await run(
  "Shop Sales visible (locked rate_entry) but trip not Approved/Completed",
  `SELECT d.id, d.trip_id, t.status
     FROM trip_deliveries d
     JOIN trips t ON t.id = d.trip_id
     JOIN rate_entry r ON r.trip_id = t.id AND r.locked = TRUE
    WHERE d.deleted = FALSE AND t.status NOT IN ('Approved','Completed')`
);

await run(
  "Trip List <-> Trip Delivery consistency: total_shops / total_birds_delivered / total_delivered_weight drift vs live SUM",
  `SELECT t.id AS trip_id, t.trip_no,
          t.total_shops AS cached_shops, sub.cnt AS live_shops,
          t.total_birds_delivered AS cached_birds, sub.birds AS live_birds,
          t.total_delivered_weight AS cached_weight, sub.wt AS live_weight
     FROM trips t
     JOIN (
       SELECT trip_id, COUNT(*) cnt, COALESCE(SUM(birds),0) birds, COALESCE(SUM(weight),0) wt
         FROM trip_deliveries WHERE deleted = FALSE GROUP BY trip_id
     ) sub ON sub.trip_id = t.id
    WHERE t.total_shops IS DISTINCT FROM sub.cnt
       OR t.total_birds_delivered IS DISTINCT FROM sub.birds
       OR t.total_delivered_weight IS DISTINCT FROM sub.wt`
);

await run(
  "Mortality-caused bird overflow (birds + mortality alone, per row, exceeds row's own delivered birds sanity - i.e. mortality negative)",
  `SELECT id, trip_id, shop_name, birds, mortality FROM trip_deliveries WHERE mortality < 0`
);

await client.end();
