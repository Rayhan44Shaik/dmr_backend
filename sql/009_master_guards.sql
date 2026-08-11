-- =============================================================================
-- Master hardening: audit fields + duplicate guards
--   created_by / updated_by   -> audit trail (nullable until auth exists)
--   unique functional indexes -> DB-level duplicate prevention
-- =============================================================================

ALTER TABLE employees ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);

ALTER TABLE farms ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);

ALTER TABLE shops ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);

ALTER TABLE banks ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
ALTER TABLE banks ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);

ALTER TABLE bird_types ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
ALTER TABLE bird_types ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);

ALTER TABLE routes ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
ALTER TABLE routes ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);

-- Business-key uniqueness (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_name_unique ON shops (LOWER(shop_name));
CREATE UNIQUE INDEX IF NOT EXISTS idx_farms_name_unique ON farms (LOWER(farm_name));
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_number_unique ON vehicles (LOWER(vehicle_number));
CREATE UNIQUE INDEX IF NOT EXISTS idx_banks_name_unique ON banks (LOWER(bank_name));
CREATE UNIQUE INDEX IF NOT EXISTS idx_bird_types_name_unique ON bird_types (LOWER(bird_type));
CREATE UNIQUE INDEX IF NOT EXISTS idx_routes_name_unique ON routes (LOWER(route_name));