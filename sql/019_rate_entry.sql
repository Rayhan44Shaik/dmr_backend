-- =============================================================================
-- Rate Entry (Trip -> Rate Entry -> Shop Sales)
-- One rate record per trip, keyed by the real trip_id FK (never trip_no).
-- Reuses the existing trips table as the source of truth — no duplicate
-- trip data is stored here beyond the rate itself.
-- =============================================================================

CREATE TABLE IF NOT EXISTS rate_entry (
  id              SERIAL PRIMARY KEY,
  trip_id         INTEGER NOT NULL UNIQUE REFERENCES trips(id) ON DELETE CASCADE,
  bird_type_id    INTEGER REFERENCES bird_types(id) ON DELETE SET NULL,
  bird_type       VARCHAR(100) NOT NULL DEFAULT '',
  rate            NUMERIC(12, 2) NOT NULL DEFAULT 0,
  remarks         TEXT NOT NULL DEFAULT '',
  created_by      VARCHAR(200) NOT NULL DEFAULT '',
  updated_by      VARCHAR(200),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- UNIQUE(trip_id) above is the duplicate-protection guarantee: a second
-- INSERT for the same trip fails at the database level (23505), even under
-- concurrent requests — the application layer maps that to a 409 conflict.

CREATE INDEX IF NOT EXISTS idx_rate_entry_trip ON rate_entry (trip_id);
CREATE INDEX IF NOT EXISTS idx_rate_entry_bird_type ON rate_entry (bird_type_id);
