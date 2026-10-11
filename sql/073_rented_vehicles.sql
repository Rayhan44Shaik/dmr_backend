ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS is_rented BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS is_rented_vehicle BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN vehicles.is_rented IS
  'True when the vehicle is operated by an external rental provider.';
COMMENT ON COLUMN trips.is_rented_vehicle IS
  'Snapshot of the vehicle rental status when the trip was created; retained for history.';
