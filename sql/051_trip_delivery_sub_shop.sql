-- Optional delivery-point name beneath the selected Shop Master identity.
ALTER TABLE trip_deliveries
  ADD COLUMN IF NOT EXISTS sub_shop_name VARCHAR(200) NOT NULL DEFAULT '';
