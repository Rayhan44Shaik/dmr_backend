-- =============================================================================
-- 045 Shop Master — Redesign with new fields
--
-- Adds:
--   shop_number        VARCHAR(20)  -- Business identifier (e.g., SHOP-000001)
--   secondary_phone_number VARCHAR(30) -- Optional secondary mobile
--   city               VARCHAR(200)  -- Replaces village
--   latitude           NUMERIC(10, 7) -- GPS latitude
--   longitude          NUMERIC(10, 7) -- GPS longitude
--   paper_rate         INTEGER       -- 1-30
--   association_type   VARCHAR(100)  -- Association type
--   email              (existing, keep nullable)
--   address            (existing, keep nullable)
-- =============================================================================

-- Add new columns
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS shop_number VARCHAR(20),
  ADD COLUMN IF NOT EXISTS secondary_phone_number VARCHAR(30),
  ADD COLUMN IF NOT EXISTS city VARCHAR(200) DEFAULT '',
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS paper_rate INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS association_type VARCHAR(100) DEFAULT '';

-- Create unique index on shop_number (business identifier)
CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_shop_number ON shops(shop_number);

-- Migrate existing village data to city
UPDATE shops SET city = village WHERE city = '' OR city IS NULL;

-- Generate shop_number for existing records that don't have one
-- Format: SHOP-000001, SHOP-000002, etc.
UPDATE shops 
SET shop_number = 'SHOP-' || LPAD(shop_no::TEXT, 6, '0')
WHERE shop_number IS NULL OR shop_number = '';

-- Make shop_number NOT NULL after backfill
ALTER TABLE shops ALTER COLUMN shop_number SET NOT NULL;

-- Make city NOT NULL after backfill (optional - keep nullable for flexibility)
-- ALTER TABLE shops ALTER COLUMN city SET NOT NULL;

-- Drop the old village column if no longer needed (optional - keep for migration safety)
-- ALTER TABLE shops DROP COLUMN IF EXISTS village;

-- Add check constraint for paper_rate (1-30)
ALTER TABLE shops 
  ADD CONSTRAINT chk_shops_paper_rate 
  CHECK (paper_rate >= 0 AND paper_rate <= 30);

-- Add check constraint for latitude (-90 to 90)
ALTER TABLE shops 
  ADD CONSTRAINT chk_shops_latitude 
  CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90));

-- Add check constraint for longitude (-180 to 180)
ALTER TABLE shops 
  ADD CONSTRAINT chk_shops_longitude 
  CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));

-- Add check constraint for phone numbers (10 digits)
ALTER TABLE shops 
  ADD CONSTRAINT chk_shops_phone_number 
  CHECK (phone_number ~ '^[0-9]{10}$');

ALTER TABLE shops 
  ADD CONSTRAINT chk_shops_secondary_phone_number 
  CHECK (secondary_phone_number IS NULL OR secondary_phone_number = '' OR secondary_phone_number ~ '^[0-9]{10}$');

-- Add index for search performance
CREATE INDEX IF NOT EXISTS idx_shops_city ON shops(city);
CREATE INDEX IF NOT EXISTS idx_shops_association_type ON shops(association_type);
CREATE INDEX IF NOT EXISTS idx_shops_paper_rate ON shops(paper_rate);