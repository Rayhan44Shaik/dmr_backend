-- Shop Sales edit window: two weeks from the delivery INSERT timestamp
-- (trip_deliveries.created_at), not the trip date and not rate_locked_at.
-- Rate Entry must still be locked before Shop Sales exists; once it is,
-- birds/weight/rate/amount may be corrected until created_at + 14 days.

CREATE OR REPLACE FUNCTION trip_deliveries_window_expired(
  locked_at TIMESTAMPTZ
) RETURNS BOOLEAN AS $$
BEGIN
  -- Parameter name is kept as `locked_at` so CREATE OR REPLACE can replace
  -- 032 without DROP. The value passed by the trigger is the delivery
  -- INSERT timestamp (`trip_deliveries.created_at`), not rate_locked_at.
  RETURN locked_at IS NOT NULL
     AND CURRENT_TIMESTAMP >= locked_at + INTERVAL '14 days';
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION trip_deliveries_rate_lock_guard()
RETURNS TRIGGER AS $$
DECLARE
  parent_rate_completed BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT COALESCE(rate_completed, FALSE)
      INTO parent_rate_completed
    FROM trips
    WHERE id = OLD.trip_id;

    IF parent_rate_completed THEN
      RAISE EXCEPTION 'trip_deliveries row % is on a rate-locked trip %',
        OLD.id, OLD.trip_id
        USING ERRCODE = 'check_violation',
              DETAIL = 'Cannot delete a shop delivery after Rate Entry has finalized the trip.',
              HINT  = 'Correct birds/weight/rate via Shop Sales within 2 weeks of insert.';
    END IF;

    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(NEW.birds, -1)   IS DISTINCT FROM COALESCE(OLD.birds, -1)
       OR COALESCE(NEW.weight, -1)  IS DISTINCT FROM COALESCE(OLD.weight, -1)
       OR COALESCE(NEW.rate, -1)    IS DISTINCT FROM COALESCE(OLD.rate, -1)
       OR COALESCE(NEW.amount, -1)  IS DISTINCT FROM COALESCE(OLD.amount, -1)
    THEN
      SELECT COALESCE(rate_completed, FALSE)
        INTO parent_rate_completed
      FROM trips
      WHERE id = NEW.trip_id;

      IF parent_rate_completed
         AND trip_deliveries_window_expired(NEW.created_at) THEN
        RAISE EXCEPTION
          'trip_deliveries row % is locked (2-week insert window closed)',
          NEW.id
          USING ERRCODE = 'check_violation',
                DETAIL = format(
                  'Refused birds/weight/rate/amount change after %s. inserted_at=%s, now=%s.',
                  NEW.created_at + INTERVAL '14 days',
                  NEW.created_at,
                  CURRENT_TIMESTAMP
                ),
                HINT = 'Birds, weight, rate and amount are editable for 2 weeks from the Shop Sale insert date.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
