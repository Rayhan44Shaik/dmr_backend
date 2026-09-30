-- =============================================================================
-- Universal Vehicle Meter Reading Validation — read model
--
-- No new table, no new column on `vehicles`. Every meter-bearing transaction
-- already lives in an existing table (trips, fuel_expenses, fleet_maintenance);
-- this view UNIONs them into one chronological event stream per vehicle so a
-- single backend validator (backend/src/utils/vehicleMeterLedger.ts) can find
-- "the latest accepted meter reading for this vehicle" without duplicating any
-- data. Nothing ever writes to this view — it is a read model only.
--
-- Chronological ordering is two-tiered, derived from columns that already
-- exist on each table (nothing invented):
--   1. event_date (DATE) — the record's business date. This is the PRIMARY
--      sort key so that a Trip (which has precise intraday timestamps) never
--      unfairly outranks a same-day Fuel/Maintenance record (which only has a
--      business date, no time-of-day) or vice versa. Comparing at day
--      granularity first keeps cross-module ordering fair.
--        * Trip opening/closing meter : trip_date
--        * Fuel meter_reading         : expense_date
--        * Maintenance current_km     : maintenance_date
--   2. event_instant (TIMESTAMPTZ) — tiebreaks same-day records with the most
--      precise "this actually happened at" timestamp available:
--        * Trip opening : COALESCE(start_step_submitted_at, start_time, created_at)
--        * Trip closing : COALESCE(expenses_step_submitted_at, end_time, created_at)
--        * Fuel / Maintenance : created_at (no intraday business timestamp
--          exists for these — created_at is the actual persisted transaction
--          time, which is the correct fallback per the requirement to use the
--          real persisted timestamp rather than inventing a new convention)
--   3. created_at, then record_id — final deterministic tiebreak for the rare
--      case two rows share both event_date and event_instant.
--
-- Fuel: both MANUAL and TRIP-sourced rows count as real meter events; rows
-- where meter_reading is NULL or <= 0 are excluded — the trip-diesel sync
-- defaults an omitted diesel-row meter to 0, which is not a real reading.
--
-- record_id + source_type let a caller exclude a specific record from its own
-- comparison when validating an edit to that same record. Closing meter is
-- COALESCE(closing_meter, end_meter) — the two columns are legacy duplicates
-- of each other throughout tripsService.ts.
-- =============================================================================

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

UNION ALL

SELECT
  vehicle_id,
  'FUEL'::text AS source_type,
  id::text AS record_id,
  bill_no AS ref,
  meter_reading AS meter,
  expense_date AS event_date,
  created_at AS event_instant,
  created_at
FROM N
WHERE COALESCE(deleted, FALSE) = FALSE
  AND vehicle_id IS NOT NULL
  AND meter_reading IS NOT NULL
  AND meter_reading > 0

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
  AND current_km IS NOT NULL;
