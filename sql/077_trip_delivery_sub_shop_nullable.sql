-- A delivery may use only the selected Shop Master, without a sub-shop.
-- Keep the existing empty-string default for omitted inserts, but allow
-- explicit NULL values from delivery updates.
ALTER TABLE trip_deliveries
  ALTER COLUMN sub_shop_name DROP NOT NULL;
