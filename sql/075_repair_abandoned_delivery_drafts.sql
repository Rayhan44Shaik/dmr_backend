-- Repair rows created by the former open-form Step 4 autosave.
-- Complete rows remain deliveries and recover their original chronological
-- capture position from created_at. Incomplete rows were never Save-Shop
-- captures and must not consume boxes, shop counts, serials or weight loss.

UPDATE trip_deliveries
   SET auto_capture_time = created_at
 WHERE auto_capture_time IS NULL
   AND client_key IS NOT NULL
   AND COALESCE(remarks, '') NOT LIKE '[ORDER]%'
   AND COALESCE(shop_id, 0) > 0
   AND COALESCE(birds, 0) > 0
   AND COALESCE(weight, 0) > 0;

DELETE FROM trip_deliveries
 WHERE auto_capture_time IS NULL
   AND client_key IS NOT NULL
   AND COALESCE(remarks, '') NOT LIKE '[ORDER]%';

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY trip_id, leg_id
           ORDER BY auto_capture_time ASC NULLS LAST, id ASC
         ) AS next_serial
    FROM trip_deliveries
   WHERE COALESCE(deleted, FALSE) = FALSE
)
UPDATE trip_deliveries delivery
   SET serial_no = ranked.next_serial
  FROM ranked
 WHERE delivery.id = ranked.id
   AND delivery.serial_no IS DISTINCT FROM ranked.next_serial;

-- Keep parent KPIs in sync with the repaired delivery source of truth.
WITH totals AS (
  SELECT trip_id,
         COUNT(*)::int AS shops,
         COALESCE(SUM(birds), 0)::int AS birds,
         COALESCE(SUM(weight), 0) AS weight,
         COALESCE(SUM(mortality), 0)::int AS mortality,
         COALESCE(SUM(mort_kg), 0) AS mortality_weight,
         COALESCE(
           SUM(GREATEST(0, COALESCE(farm_weight, 0) - weight - COALESCE(mort_kg, 0)))
             FILTER (WHERE delivery_mode = 'weight'),
           0
         ) AS weight_loss
    FROM trip_deliveries
   WHERE COALESCE(deleted, FALSE) = FALSE
   GROUP BY trip_id
)
UPDATE trips trip
   SET total_shops = totals.shops,
       total_birds_delivered = totals.birds,
       total_delivered_weight = totals.weight,
       total_mortality_count = totals.mortality,
       total_mortality_weight = totals.mortality_weight,
       weight_loss = totals.weight_loss
  FROM totals
 WHERE trip.id = totals.trip_id;
