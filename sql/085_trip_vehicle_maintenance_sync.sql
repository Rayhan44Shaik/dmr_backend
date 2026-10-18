ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS vehicle_maintenance_note VARCHAR(120);

ALTER TABLE fleet_maintenance
  ADD COLUMN IF NOT EXISTS source_trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fleet_maintenance_source_trip
  ON fleet_maintenance (source_trip_id)
  WHERE source_trip_id IS NOT NULL AND COALESCE(deleted, FALSE) = FALSE;
