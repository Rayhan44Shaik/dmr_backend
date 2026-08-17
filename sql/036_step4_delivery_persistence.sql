-- =============================================================================
-- 036_step4_delivery_persistence.sql
--
-- Trip Entry Step 4 (Shop Deliveries) — idempotent per-shop persistence.
--
-- Step 4 supports saving one shop delivery at a time (a single shop can take
-- more than an hour to enter) and must be retry-safe: a repeated Save must
-- UPDATE the same delivery row, never create a duplicate.
--
-- The frontend assigns every new delivery a stable client_key
-- (crypto.randomUUID()). The partial unique index on (trip_id, client_key)
-- is the database-level idempotency guarantee: an INSERT with a client_key
-- that already exists for this trip fails with a unique violation, and the
-- service layer converts that into an UPDATE of the existing row. This is the
-- same first-write-wins pattern already used elsewhere (trip_media, salary,
-- etc.) and is fully concurrency-safe.
-- =============================================================================

ALTER TABLE trip_deliveries
  ADD COLUMN IF NOT EXISTS client_key TEXT;

-- Idempotency guard: a client_key is unique per trip. NULLs (legacy rows
-- created before this migration, or rows inserted by the full-replace submit
-- path) are allowed to repeat because Postgres treats NULLs as distinct, and
-- those rows are matched by their server id instead.
CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_deliveries_client_key
  ON trip_deliveries (trip_id, client_key)
  WHERE client_key IS NOT NULL;
