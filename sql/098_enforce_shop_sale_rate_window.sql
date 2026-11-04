-- Re-assert the Shop Sales 14-day edit guard on every existing database.
-- This protects the same fields whether an update arrives through the UI,
-- API, import path, or a normal direct SQL UPDATE using the application role.

CREATE OR REPLACE FUNCTION trip_deliveries_window_expired(
  locked_at TIMESTAMPTZ
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN locked_at IS NOT NULL
     AND CURRENT_TIMESTAMP >= locked_at + INTERVAL '14 days';
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION trip_deliveries_rate_lock_guard()
RETURNS TRIGGER AS $$
DECLARE
  parent_rate_completed BOOLEAN;
  parent_rate_locked_at TIMESTAMPTZ;
  shop_sales_entered_at TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT COALESCE(rate_completed, FALSE), rate_locked_at
      INTO parent_rate_completed, parent_rate_locked_at
      FROM trips WHERE id = OLD.trip_id;
    IF parent_rate_completed THEN
      RAISE EXCEPTION 'trip_deliveries row % is on a rate-locked trip %', OLD.id, OLD.trip_id
        USING ERRCODE = 'check_violation',
              DETAIL = 'Cannot delete a shop delivery after Rate Entry has finalized the trip.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND (
       COALESCE(NEW.birds, -1) IS DISTINCT FROM COALESCE(OLD.birds, -1)
    OR COALESCE(NEW.weight, -1) IS DISTINCT FROM COALESCE(OLD.weight, -1)
    OR COALESCE(NEW.rate, -1) IS DISTINCT FROM COALESCE(OLD.rate, -1)
    OR COALESCE(NEW.amount, -1) IS DISTINCT FROM COALESCE(OLD.amount, -1)
  ) THEN
    SELECT COALESCE(rate_completed, FALSE), rate_locked_at
      INTO parent_rate_completed, parent_rate_locked_at
      FROM trips WHERE id = NEW.trip_id;
    shop_sales_entered_at := COALESCE(parent_rate_locked_at, NEW.created_at);
    IF parent_rate_completed AND trip_deliveries_window_expired(shop_sales_entered_at) THEN
      RAISE EXCEPTION 'trip_deliveries row % is locked (14-day Shop Sales window closed)', NEW.id
        USING ERRCODE = 'check_violation',
              DETAIL = format('Refused birds/weight/rate/amount change after %s.', shop_sales_entered_at + INTERVAL '14 days'),
              HINT = 'Shop Sales fields are editable for 14 days after the trip enters Shop Sales.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trip_deliveries_rate_lock ON trip_deliveries;
CREATE TRIGGER trg_trip_deliveries_rate_lock
  BEFORE UPDATE OR DELETE ON trip_deliveries
  FOR EACH ROW EXECUTE FUNCTION trip_deliveries_rate_lock_guard();
