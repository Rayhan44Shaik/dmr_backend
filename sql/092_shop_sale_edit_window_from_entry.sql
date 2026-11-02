-- Shop Sales edit window: two weeks from the moment Rate Entry is locked and
-- the trip enters Shop Sales. Delivery rows may have been created much earlier
-- in Trip Delivery, so their created_at timestamp must not consume this window.

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
    FROM trips
    WHERE id = OLD.trip_id;

    IF parent_rate_completed THEN
      RAISE EXCEPTION 'trip_deliveries row % is on a rate-locked trip %',
        OLD.id, OLD.trip_id
        USING ERRCODE = 'check_violation',
              DETAIL = 'Cannot delete a shop delivery after Rate Entry has finalized the trip.',
              HINT = 'Correct birds, weight, rate or amount through Shop Sales during its two-week edit window.';
    END IF;

    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND (
       COALESCE(NEW.birds, -1)  IS DISTINCT FROM COALESCE(OLD.birds, -1)
    OR COALESCE(NEW.weight, -1) IS DISTINCT FROM COALESCE(OLD.weight, -1)
    OR COALESCE(NEW.rate, -1)   IS DISTINCT FROM COALESCE(OLD.rate, -1)
    OR COALESCE(NEW.amount, -1) IS DISTINCT FROM COALESCE(OLD.amount, -1)
  ) THEN
    SELECT COALESCE(rate_completed, FALSE), rate_locked_at
      INTO parent_rate_completed, parent_rate_locked_at
    FROM trips
    WHERE id = NEW.trip_id;

    -- created_at is a compatibility fallback for legacy rate-completed trips
    -- that predate the rate_locked_at column/data backfill.
    shop_sales_entered_at := COALESCE(parent_rate_locked_at, NEW.created_at);

    IF parent_rate_completed
       AND trip_deliveries_window_expired(shop_sales_entered_at) THEN
      RAISE EXCEPTION
        'trip_deliveries row % is locked (2-week Shop Sales window closed)',
        NEW.id
        USING ERRCODE = 'check_violation',
              DETAIL = format(
                'Refused birds/weight/rate/amount change after %s. shop_sales_entered_at=%s, now=%s.',
                shop_sales_entered_at + INTERVAL '14 days',
                shop_sales_entered_at,
                CURRENT_TIMESTAMP
              ),
              HINT = 'Birds, weight, rate and amount are editable for 2 weeks after the trip enters Shop Sales.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
