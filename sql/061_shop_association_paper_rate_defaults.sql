-- Standard Shop Master defaults requested for both existing and future shops.
ALTER TABLE shops
  ALTER COLUMN association_type SET DEFAULT 'Ass Gun',
  ALTER COLUMN paper_rate SET DEFAULT 10;

UPDATE shops
SET association_type = 'Ass Gun',
    paper_rate = 10;
