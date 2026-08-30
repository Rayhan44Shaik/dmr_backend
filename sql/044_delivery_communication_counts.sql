-- =============================================================================
-- 044 Delivery communication send/attempt counts (Email + WhatsApp)
--
-- Adds send_count and attempt_count to trip_delivery_emails
-- Creates trip_delivery_whatsapp with identical structure
-- =============================================================================

-- 1. Add count columns to trip_delivery_emails
ALTER TABLE public.trip_delivery_emails
  ADD COLUMN IF NOT EXISTS send_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.trip_delivery_emails.send_count IS 'Number of successful email sends for this delivery';
COMMENT ON COLUMN public.trip_delivery_emails.attempt_count IS 'Total email send attempts (success + failure) for this delivery';

-- 2. Create trip_delivery_whatsapp table (mirrors trip_delivery_emails)
CREATE TABLE IF NOT EXISTS public.trip_delivery_whatsapp (
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
  send_count      INTEGER NOT NULL DEFAULT 0,
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT uq_trip_delivery_whatsapp UNIQUE (trip_id, delivery_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_delivery_whatsapp_trip
  ON public.trip_delivery_whatsapp (trip_id);

COMMENT ON TABLE public.trip_delivery_whatsapp IS 'Per-delivery WhatsApp send status and counts (one row per trip+delivery)';
COMMENT ON COLUMN public.trip_delivery_whatsapp.send_count IS 'Number of successful WhatsApp sends for this delivery';
COMMENT ON COLUMN public.trip_delivery_whatsapp.attempt_count IS 'Total WhatsApp send attempts (success + failure) for this delivery';

-- 3. Updated_at trigger for trip_delivery_whatsapp (reusing existing function if available)
-- The trigger function update_updated_at_column() should already exist from earlier migrations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_trip_delivery_whatsapp_updated_at'
  ) THEN
    CREATE TRIGGER trg_trip_delivery_whatsapp_updated_at
    BEFORE UPDATE ON public.trip_delivery_whatsapp
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;