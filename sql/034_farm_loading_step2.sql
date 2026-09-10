-- =============================================================================
-- 034_farm_loading_step2.sql
-- Step 2 (Farm Loading): nullable columns for captured GPS coordinates and the
-- completed-trips count. All columns are NULLABLE so GPS and the count stay
-- optional (Save Progress may persist partial state). No existing column is
-- altered/dropped; the trips table is never recreated.
-- =============================================================================

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS farm_gps_lat       NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS farm_gps_lon       NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS farm_gps_accuracy  NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS farm_gps_time      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS farm_completed_trips INTEGER;
