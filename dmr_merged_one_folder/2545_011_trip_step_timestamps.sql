-- ---------------------------------------------------------------------------
-- 011_trip_step_timestamps.sql
-- First-submission timestamps for each trip wizard step.
-- Once set, these are never overwritten (idempotent first-write wins).
-- ---------------------------------------------------------------------------

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS start_step_submitted_at     TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS farm_step_submitted_at      TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS pickup_step_submitted_at    TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deliveries_step_submitted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS expenses_step_submitted_at  TIMESTAMPTZ NULL;

-- Backfill for trips already created before this migration.
-- Best-effort: use submitted_at (the legacy submission marker) so existing
-- trips keep a sensible timestamp instead of the migration time.
UPDATE trips
   SET start_step_submitted_at = COALESCE(start_step_submitted_at, submitted_at)
 WHERE start_step_submitted = TRUE AND start_step_submitted_at IS NULL;

UPDATE trips
   SET farm_step_submitted_at = COALESCE(farm_step_submitted_at, submitted_at)
 WHERE farm_step_submitted = TRUE AND farm_step_submitted_at IS NULL;

UPDATE trips
   SET pickup_step_submitted_at = COALESCE(pickup_step_submitted_at, submitted_at)
 WHERE pickup_step_submitted = TRUE AND pickup_step_submitted_at IS NULL;

UPDATE trips
   SET deliveries_step_submitted_at = COALESCE(deliveries_step_submitted_at, submitted_at)
 WHERE delivery_step_submitted = TRUE AND deliveries_step_submitted_at IS NULL;

UPDATE trips
   SET expenses_step_submitted_at = COALESCE(expenses_step_submitted_at, submitted_at)
 WHERE expenses_step_submitted = TRUE AND expenses_step_submitted_at IS NULL;
