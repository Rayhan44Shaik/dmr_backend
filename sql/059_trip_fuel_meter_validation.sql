-- =============================================================================
-- Fuel + Meter production validation (fuel/meter scope only)
--
-- 1. trip_fuel_bill_counters — ONE monotonically increasing counter per trip
--    for backend-authoritative trip fuel bill numbers (<trip_no>-F001, -F002,
--    ...). Allocation is an atomic upsert (INSERT ... ON CONFLICT DO UPDATE
--    ... RETURNING) inside the caller's transaction, serialized per trip with
--    pg_advisory_xact_lock, so:
--      - concurrent creates for the SAME trip serialize and always receive
--        distinct sequential numbers,
--      - the counter NEVER decreases when a fuel bill is deleted / cancelled /
--        rejected / soft-deleted — consumed numbers are never re-issued,
--      - sequences are per-trip, never shared across trips.
--    The global UNIQUE(fuel_expenses.bill_no) stays the final guard; any
--    residual collision surfaces as 23505 (409) with a full rollback.
--
-- 2. vehicle_meter_events — exclude inactive vehicles from every arm so
--    deleted/soft-deleted/cancelled (Inactive) vehicles never participate in
--    current/previous meter lookup, validation, locking or conflict detection.
--    The authoritative vehicle model is vehicles.status (Active/Inactive);
--    no second status system is introduced.
--
-- Safe: additive table, CREATE OR REPLACE VIEW (read model only), seeded
-- counters only for rows already using the new number pattern. No DROP, no
-- column changes, no data rewrites.
-- =============================================================================

CREATE TABLE IF NOT EXISTS trip_fuel_bill_counters (
  trip_id       INTEGER PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
  last_sequence INTEGER NOT NULL DEFAULT 0
);

-- Defensive seed: if any rows already use the <trip_no>-FNNN pattern (e.g. a
-- retried certification run), start the counter above the highest consumed
-- sequence so a fresh counter never re-issues a number already in use.
INSERT INTO trip_fuel_bill_counters (trip_id, last_sequence)
SELECT fe.trip_id,
       MAX(COALESCE((substring(fe.bill_no from 'F([0-9]+)$'))::int, 0))
FROM fuel_expenses fe
WHERE fe.trip_id IS NOT NULL
  AND fe.bill_no ~ '-F[0-9]+$'
GROUP BY fe.trip_id
ON CONFLICT (trip_id) DO NOTHING;

CREATE OR REPLACE VIEW vehicle_meter_events AS
SELECT
  vehicle_id,
  'TRIP_START'::text AS source_type,
  id::text AS record_id,
  trip_no AS ref,
  opening_meter AS meter,
  trip_date AS event_date,
  COALESCE(start_step_submitted_at, start_time, created_at) AS event_instant,
  created_at
FROM trips
WHERE deleted = FALSE
  AND vehicle_id IS NOT NULL
  AND opening_meter IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM vehicles v
    WHERE v.id = trips.vehicle_id AND v.status = 'Active'
  )

UNION ALL

SELECT
  vehicle_id,
  'TRIP_END'::text AS source_type,
  id::text AS record_id,
  trip_no AS ref,
  COALESCE(closing_meter, end_meter) AS meter,
  trip_date AS event_date,
  COALESCE(expenses_step_submitted_at, end_time, created_at) AS event_instant,
  created_at
FROM trips
WHERE deleted = FALSE
  AND vehicle_id IS NOT NULL
  AND COALESCE(closing_meter, end_meter) IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM vehicles v
    WHERE v.id = trips.vehicle_id AND v.status = 'Active'
  )

UNION ALL

SELECT
  fe.vehicle_id,
  'FUEL'::text AS source_type,
  fe.id::text AS record_id,
  fe.bill_no AS ref,
  fe.meter_reading AS meter,
  fe.expense_date AS event_date,
  fe.created_at AS event_instant,
  fe.created_at
FROM fuel_expenses fe
WHERE COALESCE(fe.deleted, FALSE) = FALSE
  AND fe.vehicle_id IS NOT NULL
  AND fe.meter_reading IS NOT NULL
  AND fe.meter_reading > 0
  AND NOT EXISTS (
    SELECT 1
      FROM trips t
     WHERE t.id = fe.trip_id
       AND COALESCE(t.deleted, FALSE) = TRUE
  )
  AND EXISTS (
    SELECT 1 FROM vehicles v
    WHERE v.id = fe.vehicle_id AND v.status = 'Active'
  )

UNION ALL

SELECT
  vehicle_id,
  'MAINTENANCE'::text AS source_type,
  id::text AS record_id,
  bill_no AS ref,
  current_km AS meter,
  maintenance_date AS event_date,
  created_at AS event_instant,
  created_at
FROM fleet_maintenance
WHERE COALESCE(deleted, FALSE) = FALSE
  AND vehicle_id IS NOT NULL
  AND current_km IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM vehicles v
    WHERE v.id = fleet_maintenance.vehicle_id AND v.status = 'Active'
  );
