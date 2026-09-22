-- Evolve the existing bird_types master into a backwards-compatible general
-- "Others" catalog. Existing rows remain Bird records and all trip FKs stay valid.
ALTER TABLE bird_types
  ADD COLUMN IF NOT EXISTS category VARCHAR(30) NOT NULL DEFAULT 'Bird',
  ADD COLUMN IF NOT EXISTS owner_name VARCHAR(150) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(20) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7);

ALTER TABLE bird_types DROP CONSTRAINT IF EXISTS chk_bird_types_positive_weight;
ALTER TABLE bird_types
  ADD CONSTRAINT chk_others_category CHECK (category IN ('Bird', 'Fuel Bunk')),
  ADD CONSTRAINT chk_others_weight CHECK (
    (category = 'Bird' AND average_weight > 0) OR
    (category = 'Fuel Bunk' AND average_weight >= 0)
  ),
  ADD CONSTRAINT chk_others_gps CHECK (
    (latitude IS NULL AND longitude IS NULL) OR
    (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  );

CREATE INDEX IF NOT EXISTS idx_bird_types_category_status
  ON bird_types(category, status, bird_type);
