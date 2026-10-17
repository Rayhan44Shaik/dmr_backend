-- trip_deliveries must reference a Shop Master row. The stored display name is
-- a denormalized snapshot and must never be accepted as independent free text.
CREATE OR REPLACE FUNCTION canonicalize_trip_delivery_shop()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  canonical_shop_name VARCHAR(200);
BEGIN
  IF NEW.shop_id IS NULL THEN
    IF NULLIF(BTRIM(COALESCE(NEW.shop_name, '')), '') IS NOT NULL THEN
      RAISE EXCEPTION 'A Shop Master selection is required for delivery shop name "%"', NEW.shop_name
        USING ERRCODE = '23503';
    END IF;

    NEW.shop_name := '';
    RETURN NEW;
  END IF;

  SELECT shop_name
    INTO canonical_shop_name
    FROM shops
   WHERE id = NEW.shop_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shop Master id % does not exist', NEW.shop_id
      USING ERRCODE = '23503';
  END IF;

  NEW.shop_name := canonical_shop_name;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trip_deliveries_shop_master ON trip_deliveries;
CREATE TRIGGER trg_trip_deliveries_shop_master
BEFORE INSERT OR UPDATE OF shop_id, shop_name ON trip_deliveries
FOR EACH ROW
EXECUTE FUNCTION canonicalize_trip_delivery_shop();

-- Repair any existing display-name drift while retaining each row's selected
-- Shop Master identity.
UPDATE trip_deliveries delivery
   SET shop_name = shop.shop_name
  FROM shops shop
 WHERE delivery.shop_id = shop.id
   AND delivery.shop_name IS DISTINCT FROM shop.shop_name;
