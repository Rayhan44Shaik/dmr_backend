-- =============================================================================
-- 043 Delivery WhatsApp status (Shop Delivery WhatsApp System)
--
-- One status row per (trip_id, delivery_id). WhatsApp metadata only — never
-- duplicates trips, deliveries, or shops.
-- =============================================================================

CREATE TABLE IF NOT EXISTS trip_delivery_whatsapp (
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
  CONSTRAINT uq_trip_delivery_whatsapp UNIQUE (trip_id, delivery_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_delivery_whatsapp_trip
  ON trip_delivery_whatsapp (trip_id);