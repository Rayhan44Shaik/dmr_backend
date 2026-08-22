-- =============================================================================
-- 037_step5_diesel_persistence.sql
--
-- Trip Entry Step 5 — durable diesel bills + GPS columns.
-- Diesel drafts are never stored. Only a successful per-row Submit writes a
-- trip_diesel_entries row. client_key is the idempotency key for retries.
-- =============================================================================

ALTER TABLE trip_diesel_entries
  ADD COLUMN IF NOT EXISTS amount NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS gps_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS gps_lon DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS gps_accuracy DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS gps_captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_diesel_client_key
  ON trip_diesel_entries (trip_id, client_key)
  WHERE client_key IS NOT NULL;

-- Legacy rows created by the old full-replace path are treated as submitted.
UPDATE trip_diesel_entries
   SET submitted = TRUE,
       submitted_at = COALESCE(submitted_at, NOW()),
       amount = ROUND(COALESCE(litres, 0) * COALESCE(rate, 0), 2)
 WHERE submitted = FALSE
   AND COALESCE(litres, 0) > 0
   AND COALESCE(rate, 0) > 0;
