-- Keep persisted Rate Entry amounts synchronized with their authoritative
-- inputs WITHOUT restating historical values.
--
-- Batch C5 decision: historical delivery amounts are negotiated business data.
-- A migration must never overwrite an existing non-null amount. Therefore:
--   * INSERT                       : derive amount = weight × rate when both
--                                    inputs exist (new rows follow the rule).
--   * UPDATE OF weight, rate       : recompute, because the caller deliberately
--                                    changed an input.
--   * any other UPDATE             : never touches amount (the trigger is not
--                                    declared for those columns), so remarks,
--                                    birds, shop naming, etc. leave it intact.
--   * either input NULL on UPDATE  : leave amount untouched (not derivable;
--                                    never erase a stored amount).
--   * backfill                     : ONLY rows whose amount IS NULL, and only
--                                    when weight and rate are both present.
--
-- The previous revision of this migration ended with an unconditional
-- `UPDATE trip_deliveries SET amount = weight × rate`, which silently restated
-- every historical negotiated amount. That statement is removed.
CREATE OR REPLACE FUNCTION sync_trip_delivery_amount()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.weight IS NULL OR NEW.rate IS NULL THEN
    -- Not derivable from the inputs. Preserve whatever amount was supplied
    -- (NULL stays NULL on insert; a stored amount survives an update).
    RETURN NEW;
  END IF;

  -- INSERT and UPDATE OF weight, rate both reach here: the amount follows the
  -- inputs. Historical rows are unaffected because this is a row trigger, not
  -- a statement over existing data.
  NEW.amount := ROUND(NEW.weight::numeric * NEW.rate::numeric, 2);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_trip_delivery_amount ON trip_deliveries;
CREATE TRIGGER trg_sync_trip_delivery_amount
BEFORE INSERT OR UPDATE OF weight, rate
ON trip_deliveries
FOR EACH ROW
EXECUTE FUNCTION sync_trip_delivery_amount();

-- Backfill only genuinely missing amounts; existing values are preserved.
UPDATE trip_deliveries
SET amount = ROUND(weight::numeric * rate::numeric, 2)
WHERE amount IS NULL
  AND weight IS NOT NULL
  AND rate IS NOT NULL;
