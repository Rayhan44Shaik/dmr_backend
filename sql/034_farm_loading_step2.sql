-- =============================================================================
-- 034_farm_loading_step2.sql
-- Step 2 (Farm Loading): nullable GPS capture columns.
-- GPS stays optional (Save Progress may persist partial state).
-- =============================================================================

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS farm_gps_lat       NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS farm_gps_lon       NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS farm_gps_accuracy  NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS farm_gps_time      TIMESTAMPTZ;
