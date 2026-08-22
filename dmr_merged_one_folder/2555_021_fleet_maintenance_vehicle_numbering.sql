-- =============================================================================
-- Fleet module — Vehicle-specific maintenance numbering
--
-- Changes maintenance bill numbers from the global-per-day format
--   MNT-YYYYMMDD-NNN
-- to a vehicle-specific sequential format
--   MNT-<VEHICLE-NO>-<NNN>
--
-- 1. fleet_maintenance_number_counters holds ONE monotonically increasing
--    counter per vehicle. The counter is incremented with an atomic upsert
--    (INSERT ... ON CONFLICT (vehicle_id) DO UPDATE ... RETURNING) inside the
--    create transaction, so:
--      - concurrent creates for the SAME vehicle serialize on the counter row
--        and always receive distinct sequential numbers,
--      - the counter NEVER decreases when a maintenance record is deleted /
--        soft-deleted / rejected — deleted numbers are permanently consumed,
--      - the sequence is per-vehicle, never global across vehicles.
--
-- 2. Existing rows keep their historical MNT-YYYYMMDD-NNN numbers untouched
--    (never rewritten). The generator only produces MNT-<VEHICLE-NO>-<NNN>,
--    which lives in a separate namespace and cannot collide with the
--    historical date-based format.
--
-- 3. Database-level uniqueness is enforced for ALL rows — active, soft-deleted
--    and historical — by the existing NOT NULL UNIQUE constraint on
--    fleet_maintenance.bill_no plus the explicit unique index
--    idx_fleet_maintenance_bill_no. Both are non-partial (they include
--    soft-deleted rows), so a deleted number can never be re-issued. They are
--    re-asserted below for defense in depth.
-- =============================================================================

CREATE TABLE IF NOT EXISTS fleet_maintenance_number_counters (
  vehicle_id    INTEGER PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE,
  last_sequence INTEGER NOT NULL DEFAULT 0
);

-- Seed the per-vehicle counters from any already-existing vehicle-format MNT
-- numbers (MNT-<vehicle>-<NNN>) so a fresh counter never re-issues a number
-- that is already in use. Historical MNT-YYYYMMDD-NNN rows are excluded — they
-- live in a different namespace and are preserved untouched.
INSERT INTO fleet_maintenance_number_counters (vehicle_id, last_sequence)
SELECT fm.vehicle_id,
       MAX(COALESCE((substring(fm.bill_no from '[0-9]+$'))::int, 0))
FROM fleet_maintenance fm
WHERE fm.vehicle_id IS NOT NULL
  AND fm.bill_no ~ '^MNT-.*-[0-9]+$'
  AND fm.bill_no !~ '^MNT-[0-9]{8}-[0-9]{3}$'
GROUP BY fm.vehicle_id
ON CONFLICT (vehicle_id) DO NOTHING;

-- Re-assert database-level uniqueness across ALL rows (including soft-deleted
-- and historical records). Non-partial, so deleted numbers stay consumed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fleet_maintenance_bill_no
  ON fleet_maintenance (bill_no);
