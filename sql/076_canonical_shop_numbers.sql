-- Shop numbers are derived from the immutable numeric shop_no sequence.
-- This repairs historical timestamp-based values and prevents every write
-- path (UI, import, API, or future tooling) from creating them again.

CREATE OR REPLACE FUNCTION enforce_canonical_shop_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.shop_no IS NULL OR NEW.shop_no < 1 THEN
    RAISE EXCEPTION 'shop_no must be a positive number';
  END IF;
  NEW.shop_number := 'SHOP-' || LPAD(NEW.shop_no::text, 6, '0');
  RETURN NEW;
END;
$$;

UPDATE shops
   SET shop_number = 'SHOP-' || LPAD(shop_no::text, 6, '0')
 WHERE shop_number IS DISTINCT FROM 'SHOP-' || LPAD(shop_no::text, 6, '0');

DROP TRIGGER IF EXISTS trg_shops_canonical_number ON shops;
CREATE TRIGGER trg_shops_canonical_number
BEFORE INSERT OR UPDATE OF shop_no, shop_number ON shops
FOR EACH ROW EXECUTE FUNCTION enforce_canonical_shop_number();
