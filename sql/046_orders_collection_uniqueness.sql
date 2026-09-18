-- One server-authoritative Orders collection container per operational day.
-- Ordinary vehicle-less Trip Entry drafts are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS ux_trips_orders_collection_day
  ON trips (trip_date)
  WHERE deleted = FALSE
    AND vehicle_id IS NULL
    AND remarks = '[ORDER_COLLECTION]';
