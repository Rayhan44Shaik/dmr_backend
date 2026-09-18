-- Step 5 per-row diesel submit: GPS, client idempotency key, submitted stamp.
ALTER TABLE trip_diesel_entries
  ADD COLUMN IF NOT EXISTS client_key TEXT,
  ADD COLUMN IF NOT EXISTS gps_lat NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS gps_lon NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS gps_accuracy NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS gps_captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_diesel_client_key
  ON trip_diesel_entries (trip_id, client_key)
  WHERE client_key IS NOT NULL;
