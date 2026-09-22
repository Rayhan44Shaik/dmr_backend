-- Preserve whether a diesel purchase used a registered Fuel Bunk or an
-- ad-hoc Other location. Master-backed rows retain a FK to bird_types so the
-- API can verify and resolve the authoritative name/GPS.
ALTER TABLE trip_diesel_entries
  ADD COLUMN IF NOT EXISTS bunk_source VARCHAR(10) NOT NULL DEFAULT 'OTHER',
  ADD COLUMN IF NOT EXISTS fuel_bunk_id INTEGER REFERENCES bird_types(id) ON DELETE SET NULL;

UPDATE trip_diesel_entries d
SET bunk_source = 'MASTER',
    fuel_bunk_id = b.id
FROM bird_types b
WHERE b.category = 'Fuel Bunk'
  AND LOWER(BTRIM(b.bird_type)) = LOWER(BTRIM(d.bunk_name))
  AND d.fuel_bunk_id IS NULL;

ALTER TABLE trip_diesel_entries
  DROP CONSTRAINT IF EXISTS chk_trip_diesel_bunk_source;

ALTER TABLE trip_diesel_entries
  ADD CONSTRAINT chk_trip_diesel_bunk_source
  CHECK (
    (bunk_source = 'MASTER' AND fuel_bunk_id IS NOT NULL) OR
    (bunk_source = 'OTHER' AND fuel_bunk_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_trip_diesel_fuel_bunk
  ON trip_diesel_entries(fuel_bunk_id)
  WHERE fuel_bunk_id IS NOT NULL;
