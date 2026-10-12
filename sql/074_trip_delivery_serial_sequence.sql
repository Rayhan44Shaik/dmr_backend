-- Repair legacy Step 4 delivery serials.
--
-- Browser-managed serial_no values allowed duplicates (for example 6, 6),
-- and pending [ORDER] plan rows could consume 1..N even though those rows are
-- hidden from the captured-delivery table. Number actual captures first and
-- keep pending assignment plans afterward in their existing route order.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY trip_id, leg_id
           ORDER BY
             CASE
               WHEN remarks LIKE '[ORDER]%' AND auto_capture_time IS NULL THEN 1
               ELSE 0
             END,
             auto_capture_time ASC NULLS LAST,
             serial_no ASC NULLS LAST,
             id ASC
         ) AS next_serial
    FROM trip_deliveries
   WHERE COALESCE(deleted, FALSE) = FALSE
)
UPDATE trip_deliveries delivery
   SET serial_no = ranked.next_serial
  FROM ranked
 WHERE delivery.id = ranked.id
   AND delivery.serial_no IS DISTINCT FROM ranked.next_serial;
