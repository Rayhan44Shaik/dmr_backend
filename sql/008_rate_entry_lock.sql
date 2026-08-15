-- =============================================================================
-- Rate Entry — final lock state + immutable rate/amount on trip_deliveries
--
-- The authoritative shop-wise rate for a completed trip lives in:
--
--   trips (1) ──< trip_deliveries (N)
--                 ├─ shop_id / shop_name
--                 ├─ bird_type_id / bird_type
--                 ├─ birds / weight / mortality
--                 ├─ rate          <-- actual rate entered in Rate Entry
--                 └─ amount        <-- weight * rate (computed)
--
-- The Rate Entry lock state is stored on the parent trip:
--
--   trips.rate_completed = TRUE  → rates are finalized / locked / immutable
--
-- This migration:
--   1. Adds rate-lock audit columns (rate_locked_at, rate_locked_by).
--   2. Adds supporting indexes for the Rate Entry work queue.
--   3. Installs a row-level trigger that REJECTS any UPDATE/DELETE of
--      trip_deliveries.rate / trip_deliveries.amount once the parent trip
--      is rate-locked. PostgreSQL is the single source of truth — no client
--      (frontend, other service, or even a future bug) can ever mutate a
--      locked rate.
--
-- Backwards compatible: existing `rate_completed` semantics are preserved.
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

-- 3) Immutable locked-rate trigger --------------------------------------------------
CREATE OR REPLACE FUNCTION trip_deliveries_rate_lock_guard()
RETURNS TRIGGER AS $$
DECLARE
  parent_locked BOOLEAN;
BEGIN
  -- On DELETE, consult the OLD row's parent trip.
  IF TG_OP = 'DELETE' THEN
    SELECT COALESCE(rate_completed, FALSE)
      INTO parent_locked
    FROM trips
    WHERE id = OLD.trip_id;

    IF parent_locked THEN
      RAISE EXCEPTION 'trip_deliveries row % is locked by rate entry on trip %',
        OLD.id, OLD.trip_id
        USING ERRCODE = 'check_violation',
              DETAIL = 'Cannot delete a shop delivery whose trip rates are finalized.',
              HINT = 'Unlock the trip via the Rate Entry workflow before modifying rates.';
    END IF;

    RETURN OLD;
  END IF;

  -- On UPDATE, only guard when the financial columns change. We never block
  -- harmless updates (e.g. updated_at touch) on a locked trip.
  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(NEW.rate, -1) IS DISTINCT FROM COALESCE(OLD.rate, -1)
       OR COALESCE(NEW.amount, -1) IS DISTINCT FROM COALESCE(OLD.amount, -1) THEN

      SELECT COALESCE(rate_completed, FALSE)
        INTO parent_locked
      FROM trips
      WHERE id = NEW.trip_id;

      IF parent_locked THEN
        RAISE EXCEPTION 'trip_deliveries row % is locked by rate entry on trip %',
          NEW.id, NEW.trip_id
          USING ERRCODE = 'check_violation',
                DETAIL = format(
                  'Refused rate change %s -> %s (amount %s -> %s).',
                  OLD.rate, NEW.rate, OLD.amount, NEW.amount
                ),
                HINT = 'Rates are immutable once a trip is rate-locked.';
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
