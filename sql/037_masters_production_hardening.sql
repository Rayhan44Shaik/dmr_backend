-- Masters production hardening. Adds the fields already used by the Shops UI,
-- enforces safe values for new writes, and indexes common master filters.

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS shop_number VARCHAR(50) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS secondary_phone_number VARCHAR(30) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(30) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email VARCHAR(254) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city VARCHAR(200) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS paper_rate INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS association_type VARCHAR(30) NOT NULL DEFAULT '';

UPDATE shops SET city = village WHERE city = '' AND village <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_shops_shop_number_nonblank
  ON shops (LOWER(shop_number)) WHERE BTRIM(shop_number) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS ux_banks_account_number_nonblank
  ON banks (account_number) WHERE BTRIM(account_number) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS ux_vehicles_engine_number_nonblank
  ON vehicles (LOWER(engine_number)) WHERE BTRIM(engine_number) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS ux_vehicles_chassis_number_nonblank
  ON vehicles (LOWER(chassis_number)) WHERE BTRIM(chassis_number) <> '';

CREATE INDEX IF NOT EXISTS idx_employees_status_department_name
  ON employees (status, department, employee_name);
CREATE INDEX IF NOT EXISTS idx_vehicles_status_number ON vehicles (status, vehicle_number);
CREATE INDEX IF NOT EXISTS idx_farms_status_name ON farms (status, farm_name);
CREATE INDEX IF NOT EXISTS idx_shops_status_city_name ON shops (status, city, shop_name);
CREATE INDEX IF NOT EXISTS idx_banks_status_name ON banks (status, bank_name);
CREATE INDEX IF NOT EXISTS idx_bird_types_status_name ON bird_types (status, bird_type);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'shops'::regclass AND conname = 'chk_shops_latitude') THEN
    ALTER TABLE shops ADD CONSTRAINT chk_shops_latitude CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'shops'::regclass AND conname = 'chk_shops_longitude') THEN
    ALTER TABLE shops ADD CONSTRAINT chk_shops_longitude CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'shops'::regclass AND conname = 'chk_shops_paper_rate') THEN
    ALTER TABLE shops ADD CONSTRAINT chk_shops_paper_rate CHECK (paper_rate BETWEEN 1 AND 30) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'vehicles'::regclass AND conname = 'chk_vehicles_positive_capacity') THEN
    ALTER TABLE vehicles ADD CONSTRAINT chk_vehicles_positive_capacity CHECK (no_of_boxes > 0 AND bird_capacity > 0 AND capacity_kg > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'vehicles'::regclass AND conname = 'chk_vehicles_emi_day') THEN
    ALTER TABLE vehicles ADD CONSTRAINT chk_vehicles_emi_day CHECK (emi_day IS NULL OR emi_day BETWEEN 1 AND 31) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'vehicles'::regclass AND conname = 'chk_vehicles_total_emis') THEN
    ALTER TABLE vehicles ADD CONSTRAINT chk_vehicles_total_emis CHECK (total_emis IS NULL OR total_emis > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'farms'::regclass AND conname = 'chk_farms_positive_capacity') THEN
    ALTER TABLE farms ADD CONSTRAINT chk_farms_positive_capacity CHECK (capacity > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'bird_types'::regclass AND conname = 'chk_bird_types_positive_weight') THEN
    ALTER TABLE bird_types ADD CONSTRAINT chk_bird_types_positive_weight CHECK (average_weight > 0) NOT VALID;
  END IF;
END $$;
