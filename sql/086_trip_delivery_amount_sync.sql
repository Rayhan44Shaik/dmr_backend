-- Keep every persisted Rate Entry amount synchronized with its authoritative
-- inputs. API responses also derive this value, but the database guard keeps
-- downstream consumers and historical rows consistent.
CREATE OR REPLACE FUNCTION sync_trip_delivery_amount()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.amount := CASE
    WHEN NEW.rate IS NULL THEN 0
    ELSE ROUND(COALESCE(NEW.weight, 0)::numeric * NEW.rate::numeric, 2)
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_trip_delivery_amount ON trip_deliveries;
CREATE TRIGGER trg_sync_trip_delivery_amount
BEFORE INSERT OR UPDATE OF weight, rate
ON trip_deliveries
FOR EACH ROW
EXECUTE FUNCTION sync_trip_delivery_amount();

UPDATE trip_deliveries
SET amount = CASE
  WHEN rate IS NULL THEN 0
  ELSE ROUND(COALESCE(weight, 0)::numeric * rate::numeric, 2)
END
WHERE amount IS DISTINCT FROM CASE
  WHEN rate IS NULL THEN 0
  ELSE ROUND(COALESCE(weight, 0)::numeric * rate::numeric, 2)
END;
