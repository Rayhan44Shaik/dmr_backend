-- Trip Entry + Operations hardening indexes (additive only)
CREATE INDEX IF NOT EXISTS idx_trips_list
  ON trips (trip_date DESC, status, deleted)
  WHERE deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_trips_vehicle_date
  ON trips (vehicle_id, trip_date DESC)
  WHERE deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_trip_deliveries_trip_shop
  ON trip_deliveries (trip_id, shop_id);

CREATE INDEX IF NOT EXISTS idx_fuel_expenses_trip_bill
  ON fuel_expenses (trip_id, bill_no);

CREATE INDEX IF NOT EXISTS idx_trip_deliveries_amount
  ON trip_deliveries (trip_id)
  WHERE amount > 0;

-- Fix ineffective approved index (trips use Completed, not Approved)
DROP INDEX IF EXISTS idx_trips_approved;
CREATE INDEX IF NOT EXISTS idx_trips_completed
  ON trips (status, trip_date DESC)
  WHERE status = 'Completed' AND deleted = FALSE;
