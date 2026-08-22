-- =============================================================================
-- Fuel Expense Trip Sync (Phase 3)
-- Adds explicit source tracking + stable trip-fuel identity so Trip Step 5
-- diesel entries can be safely upserted into fuel_expenses without duplicates,
-- and manual fuel entries are never touched by trip synchronization.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fuel_source_type') THEN
    CREATE TYPE fuel_source_type AS ENUM ('TRIP', 'MANUAL');
  END IF;
END $$;

ALTER TABLE fuel_expenses
  ADD COLUMN IF NOT EXISTS source_type fuel_source_type NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS trip_fuel_entry_index INTEGER,
  ADD COLUMN IF NOT EXISTS bunk_address TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS image_mime VARCHAR(100);

-- Backfill: only bills actually created by the trip-sync utility (deterministic
-- bill_no pattern TRIP-{tripId}-D{rowIndex}) are TRIP-sourced. Any other row
-- that merely references a trip_id (e.g. a manual entry linked to a trip)
-- stays MANUAL, per business rule that manual entries default to MANUAL.
UPDATE fuel_expenses
SET source_type = 'TRIP'
WHERE bill_no ~ '^TRIP-\d+-D\d+$';

UPDATE fuel_expenses
SET trip_fuel_entry_index = NULLIF(regexp_replace(bill_no, '^TRIP-\d+-D', ''), '')::int
WHERE source_type = 'TRIP'
  AND bill_no ~ '^TRIP-\d+-D\d+$'
  AND trip_fuel_entry_index IS NULL;

-- Stable identity for trip-generated fuel rows: one bill per (trip, diesel row).
-- Soft-deleted rows are excluded so a removed-then-re-added diesel row can be
-- re-synced as a fresh record without colliding with its old soft-deleted bill.
CREATE UNIQUE INDEX IF NOT EXISTS ux_fuel_expenses_trip_entry
  ON fuel_expenses (trip_id, trip_fuel_entry_index)
  WHERE source_type = 'TRIP' AND deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_fuel_expenses_source_type
  ON fuel_expenses (source_type);
