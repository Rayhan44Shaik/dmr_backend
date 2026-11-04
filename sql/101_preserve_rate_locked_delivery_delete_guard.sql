-- Shop Sales removal follows the same 14-day rule as the rest of the window.
--
-- Administrators may correct the financial values of a delivery directly in
-- pgAdmin at any time (migration 099), but a delivery must not be REMOVED once
-- its Rate Entry lock is older than the approved 14-day Shop Sales window.
-- Removal means either a hard DELETE or a direct soft delete
-- (`deleted` false -> true). Inside the window the trip editor legitimately
-- removes a zeroed sale; after it the delivery is permanent.
--
-- This guard restores only the removal protection that 099 dropped. It never
-- inspects birds/weight/rate/amount, so it cannot reintroduce the expired
-- database-wide update blocker.

-- Single place for the removal rule, shared by the DELETE and soft-delete
-- branches. The window is anchored at the Shop Sales entry stamp
-- (trips.rate_locked_at), falling back to the delivery's own creation time
-- only for legacy rows without one.
CREATE OR REPLACE FUNCTION assert_shop_delivery_removable(
  row_trip_id INTEGER,
  row_created_at TIMESTAMPTZ
) RETURNS VOID AS $$
DECLARE
  parent_rate_completed BOOLEAN;
  parent_rate_locked_at TIMESTAMPTZ;
  shop_sales_entered_at TIMESTAMPTZ;
BEGIN
  SELECT COALESCE(rate_completed, FALSE), rate_locked_at
    INTO parent_rate_completed, parent_rate_locked_at
    FROM trips WHERE id = row_trip_id;

  shop_sales_entered_at := COALESCE(parent_rate_locked_at, row_created_at);

  IF parent_rate_completed AND trip_deliveries_window_expired(shop_sales_entered_at) THEN
    RAISE EXCEPTION 'trip_deliveries row is on a rate-locked trip %', row_trip_id
      USING ERRCODE = 'check_violation',
            DETAIL = 'Cannot delete a shop delivery after the 14-day Shop Sales window has closed.';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trip_deliveries_delete_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM assert_shop_delivery_removable(OLD.trip_id, OLD.created_at);
    RETURN OLD;
  END IF;

  -- A direct SQL soft delete is a deletion too and cannot bypass the rule.
  IF COALESCE(NEW.deleted, FALSE) AND NOT COALESCE(OLD.deleted, FALSE) THEN
    PERFORM assert_shop_delivery_removable(NEW.trip_id, NEW.created_at);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trip_deliveries_delete_guard ON trip_deliveries;
CREATE TRIGGER trg_trip_deliveries_delete_guard
  BEFORE UPDATE OR DELETE ON trip_deliveries
  FOR EACH ROW EXECUTE FUNCTION trip_deliveries_delete_guard();
