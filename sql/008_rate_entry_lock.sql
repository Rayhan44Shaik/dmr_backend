-- =============================================================================
-- Rate Entry — lock state + 10-day Shop Sales correction window
--
-- The authoritative shop-wise rate for a completed trip lives in:
--
--   trips (1) ──< trip_deliveries (N)
--                 ├─ shop_id / shop_name
--                 ├─ bird_type_id / bird_type
--                 ├─ birds / weight / mortality
--                 ├─ rate          <-- rate finalized by Rate Entry (editable by
--                 │                    Shop Sales during the 10-day correction window)
--                 └─ amount        <-- weight * rate (always server-computed)
--
-- The Rate Entry lock state is stored on the parent trip:
--
--   trips.rate_completed = TRUE  → Rate Entry has been finalized, the 10-day
--                                  Shop Sales correction window has started.
--   trips.rate_locked_at         → authoritative timestamp for the window.
--   trips.rate_locked_by         → actor who performed the lock.
--
-- Correction window (evaluated against PostgreSQL server time):
--
--   editable : rate_locked_at <= CURRENT_TIMESTAMP < rate_locked_at + 10 days
--   locked   : CURRENT_TIMESTAMP >= rate_locked_at + 10 days
--
--   • Before lock               → existing behavior, no restriction.
--   • During the 10-day window  → Shop Sales may correct birds / weight /
--                                 rate (and the derived amount). Deliveries
--                                 themselves cannot be deleted or replaced.
--   • After 10 days             → birds, weight, rate, amount become
--                                 PERMANENTLY immutable.
--
-- `rate_completed = TRUE` therefore does NOT mean "immediately immutable";
-- it means "Rate Entry is finalized and the correction window is running".
--
-- PostgreSQL is the single source of truth — no client, other service, or
-- future bug can bypass the permanent lock by mutating rows directly.
-- =============================================================================

-- 1) Audit columns for the rate lock ------------------------------------------------
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS rate_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rate_locked_by VARCHAR(200);

-- Backfill rate_locked_at for any trip already marked rate_completed.
UPDATE trips
SET rate_locked_at = COALESCE(approved_at, updated_at, NOW())
WHERE COALESCE(rate_completed, FALSE) = TRUE
  AND rate_locked_at IS NULL;

-- 2) Indexes for the Rate Entry work queue ------------------------------------------
-- Eligibility predicate: status='Completed' AND deleted=FALSE AND rate_completed=FALSE.
CREATE INDEX IF NOT EXISTS idx_trips_rate_entry_eligible
  ON trips (trip_date DESC, id DESC)
  WHERE status = 'Completed'
    AND COALESCE(deleted, FALSE) = FALSE
    AND COALESCE(rate_completed, FALSE) = FALSE;

-- Locked trips are consumed by Shop Sales / Collections.
CREATE INDEX IF NOT EXISTS idx_trips_rate_locked
  ON trips (trip_date DESC, id DESC)
  WHERE status = 'Completed'
    AND COALESCE(deleted, FALSE) = FALSE
    AND rate_completed = TRUE;

CREATE INDEX IF NOT EXISTS idx_trip_deliveries_trip
  ON trip_deliveries (trip_id);

-- 3) 10-day correction-window guard -------------------------------------------------
--
-- Determines whether the protected operational/financial columns of a delivery
-- may still change. Returns TRUE once the correction window has permanently
-- closed. The decision uses SERVER time (CURRENT_TIMESTAMP), never client time.
CREATE OR REPLACE FUNCTION trip_deliveries_window_expired(
  locked_at TIMESTAMPTZ
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN locked_at IS NOT NULL
     AND CURRENT_TIMESTAMP >= locked_at + INTERVAL '10 days';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION trip_deliveries_rate_lock_guard()
RETURNS TRIGGER AS $$
DECLARE
  parent_rate_completed BOOLEAN;
  parent_locked_at      TIMESTAMPTZ;
  window_expired        BOOLEAN;
BEGIN
  -- ── DELETE ──────────────────────────────────────────────────────────────
  -- A delivery row may never be deleted once Rate Entry has locked the trip.
  -- Shop Sales corrects fields in place during the 10-day window; it does not
  -- remove deliveries. This protects birds/weight/rate/amount from being
  -- zeroed by a row deletion.
  IF TG_OP = 'DELETE' THEN
    SELECT COALESCE(rate_completed, FALSE), rate_locked_at
      INTO parent_rate_completed, parent_locked_at
    FROM trips
    WHERE id = OLD.trip_id;

    IF parent_rate_completed THEN
      RAISE EXCEPTION 'trip_deliveries row % is on a rate-locked trip %',
        OLD.id, OLD.trip_id
        USING ERRCODE = 'check_violation',
              DETAIL = 'Cannot delete a shop delivery after Rate Entry has finalized the trip.',
              HINT  = 'Correct birds/weight/rate via Shop Sales within the 10-day window.';
    END IF;

    RETURN OLD;
  END IF;

  -- ── UPDATE ──────────────────────────────────────────────────────────────
  IF TG_OP = 'UPDATE' THEN
    -- Only protect the operational/financial columns. Harmless touches
    -- (remarks, updated_at, shop denormalization that is unchanged) must
    -- still be allowed even after the window has expired.
    IF COALESCE(NEW.birds, -1)   IS DISTINCT FROM COALESCE(OLD.birds, -1)
       OR COALESCE(NEW.weight, -1)  IS DISTINCT FROM COALESCE(OLD.weight, -1)
       OR COALESCE(NEW.rate, -1)    IS DISTINCT FROM COALESCE(OLD.rate, -1)
       OR COALESCE(NEW.amount, -1)  IS DISTINCT FROM COALESCE(OLD.amount, -1)
    THEN
      SELECT COALESCE(rate_completed, FALSE), rate_locked_at
        INTO parent_rate_completed, parent_locked_at
      FROM trips
      WHERE id = NEW.trip_id;

      IF parent_rate_completed THEN
        window_expired := trip_deliveries_window_expired(parent_locked_at);

        IF window_expired THEN
          RAISE EXCEPTION
            'trip_deliveries row % is permanently locked (10-day correction window closed on trip %)',
            NEW.id, NEW.trip_id
            USING ERRCODE = 'check_violation',
                  DETAIL = format(
                    'Refused birds/weight/rate/amount change after %s. locked_at=%s, now=%s.',
                    parent_locked_at + INTERVAL '10 days',
                    parent_locked_at,
                    CURRENT_TIMESTAMP
                  ),
                  HINT = 'Birds, weight, rate and amount are immutable 10 days after Rate Entry lock.';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trip_deliveries_rate_lock ON trip_deliveries;
CREATE TRIGGER trg_trip_deliveries_rate_lock
  BEFORE UPDATE OR DELETE ON trip_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION trip_deliveries_rate_lock_guard();
