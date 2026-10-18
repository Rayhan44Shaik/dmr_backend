CREATE TABLE IF NOT EXISTS trip_pickup_import_fingerprints (
  id BIGSERIAL PRIMARY KEY,
  trip_id BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  leg_id BIGINT NOT NULL REFERENCES trip_legs(id) ON DELETE CASCADE,
  hash_algorithm TEXT NOT NULL CHECK (hash_algorithm = 'SHA-256'),
  hash_version INTEGER NOT NULL CHECK (hash_version = 1),
  content_hash CHAR(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  original_filename TEXT NOT NULL,
  byte_length BIGINT NOT NULL CHECK (byte_length > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_id, leg_id, hash_algorithm, hash_version, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_trip_pickup_import_fingerprint_leg
  ON trip_pickup_import_fingerprints (trip_id, leg_id);
