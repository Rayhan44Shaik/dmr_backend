-- New delivery selections must come from the active Shop Master list. Existing
-- historical rows may retain an inactive shop until their shop is changed.
CREATE OR REPLACE FUNCTION canonicalize_trip_delivery_shop()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  canonical_shop_name VARCHAR(200);
  canonical_shop_status VARCHAR(50);
BEGIN
  IF NEW.shop_id IS NULL THEN
    IF NULLIF(BTRIM(COALESCE(NEW.shop_name, '')), '') IS NOT NULL THEN
      RAISE EXCEPTION 'A Shop Master selection is required for delivery shop name "%"', NEW.shop_name
        USING ERRCODE = '23503';
    END IF;

    NEW.shop_name := '';
    RETURN NEW;
  END IF;

  SELECT shop_name, status
    INTO canonical_shop_name, canonical_shop_status
    FROM shops
   WHERE id = NEW.shop_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shop Master id % does not exist', NEW.shop_id
      USING ERRCODE = '23503';
  END IF;

  IF (TG_OP = 'INSERT' OR NEW.shop_id IS DISTINCT FROM OLD.shop_id)
     AND canonical_shop_status IS DISTINCT FROM 'Active' THEN
    RAISE EXCEPTION 'Shop Master id % is inactive and cannot be selected for a delivery', NEW.shop_id
      USING ERRCODE = '23503';
  END IF;

  NEW.shop_name := canonical_shop_name;
  RETURN NEW;
END;
$$;
