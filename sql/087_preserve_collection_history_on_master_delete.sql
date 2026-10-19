-- Historical transactions must survive master-data cleanup.
--
-- Masters are normally deactivated by the API, but collections.shop_id was
-- created with ON DELETE CASCADE. A direct/administrative hard delete of a
-- shop could therefore erase its complete collection history. Collections
-- already snapshot shop_name, collector, payment_mode, reference_no and
-- remarks, so retaining the transaction and nulling only the optional master
-- link preserves every audit/display value.

ALTER TABLE collections
  ALTER COLUMN shop_id DROP NOT NULL;

ALTER TABLE collections
  DROP CONSTRAINT IF EXISTS collections_shop_id_fkey;

ALTER TABLE collections
  ADD CONSTRAINT collections_shop_id_fkey
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE SET NULL;

