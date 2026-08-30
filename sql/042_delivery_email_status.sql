-- =============================================================================
-- 042 Delivery email status (Shop Delivery Email System)
--
-- 041 is already used by EMI payment idempotency. This feature uses 042 so
-- EMI and other modules are not touched.
--
-- One status row per (trip_id, delivery_id). Email metadata only — never
-- duplicates trips, deliveries, or shops.
-- =============================================================================

CREATE TABLE IF NOT EXISTS trip_delivery_emails (
  id              SERIAL PRIMARY KEY,
  trip_id         INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  delivery_id     INTEGER NOT NULL REFERENCES trip_deliveries(id) ON DELETE CASCADE,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  recipient       VARCHAR(200),
  sent_at         TIMESTAMPTZ,
  failure_reason  TEXT,
  send_count      INTEGER NOT NULL DEFAULT 0,
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_trip_delivery_emails UNIQUE (trip_id, delivery_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_delivery_emails_trip
  ON trip_delivery_emails (trip_id);

-- Add send_count and attempt_count columns if they don't exist (for existing installations)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trip_delivery_emails' AND column_name = 'send_count'
  ) THEN
    ALTER TABLE trip_delivery_emails ADD COLUMN send_count INTEGER NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trip_delivery_emails' AND column_name = 'attempt_count'
  ) THEN
    ALTER TABLE trip_delivery_emails ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;
