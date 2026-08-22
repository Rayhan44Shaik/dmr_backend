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
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_trip_delivery_emails UNIQUE (trip_id, delivery_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_delivery_emails_trip
  ON trip_delivery_emails (trip_id);
