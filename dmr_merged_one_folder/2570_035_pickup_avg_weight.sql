-- =============================================================================
-- 035_pickup_avg_weight.sql
-- Step 3 (Pickup / Box Details): per-box Average Weight.
-- Adds a nullable avg_weight column to trip_boxes. Existing rows are left
-- untouched (average is derived on read from weight/birds when null), so no
-- historical data is rewritten. Non-destructive; no table is dropped/recreated.
-- =============================================================================

ALTER TABLE trip_boxes
  ADD COLUMN IF NOT EXISTS avg_weight NUMERIC(10, 3);
