-- =============================================================================
-- Deleted trips must not anchor meter validation.
--
-- Trip diesel rows sync into fuel_expenses (source_type = 'TRIP', bill_no like
-- 'TRF-…') but soft-deleting the trip never touched those fuel rows. The FUEL
-- arm of vehicle_meter_events only checked fuel_expenses.deleted, so a deleted
-- trip's fuel meter kept blocking Step 1 ("Meter reading must be greater than
-- the previous reading … from Fuel TRF-…") and submit-time
-- validateVehicleMeter() for the same vehicle.
--
-- This redefines the view so FUEL events linked to a deleted trip are excluded
-- (manual fuel rows have trip_id NULL and are unaffected). The TRIP_START /
-- TRIP_END arms already excluded deleted trips; MAINTENANCE has no trip link.
-- Future deletes are also cascaded in tripsService.softDelete / updateStatus.
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
