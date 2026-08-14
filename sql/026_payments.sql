-- =============================================================================
-- Accounts module — Payments (Accounts → Paid Payments)
--
-- Replaces the frontend localStorage "dmr-payments" ledger with real
-- PostgreSQL storage. A payment is a standalone financial transaction, fully
-- independent from Operations / Fleet / Staff — no derived data, no FK links
-- to other modules (Shop Ledger / Farmer Ledger / Collections are separate
-- later phases and are NOT created here).
--
-- Numbering: PAY-YYYYMMDD-NNN, where YYYYMMDD is the business payment date.
--   - payment_number_counters holds ONE monotonically increasing counter per
--     counter_date. It is incremented with an atomic upsert
--     (INSERT ... ON CONFLICT (counter_date) DO UPDATE ... RETURNING) inside
--     the create transaction, so concurrent creates for the SAME date
--     serialize on the counter row and always receive distinct sequential
--     numbers. Creates for different dates do not contend.
--   - The counter NEVER decreases when a payment is soft-deleted or
--     cancelled — numbers are permanently consumed and never re-issued.
--   - If the create transaction rolls back, the counter increment rolls back
--     with it, so the counter can never end up ahead of the payments it
--     actually issued.
--   - payments.payment_no is NOT NULL + UNIQUE across ALL rows (including
--     soft-deleted and cancelled), so the database is the final guard against
--     number re-use even if application logic were ever bypassed.
--
-- Status uses a dedicated payment_status enum (Draft / Approved / Paid /
-- Cancelled) — the payments workflow is distinct from ops_record_status,
-- which has no Paid / Cancelled states.
--
-- Money is NUMERIC(14, 2) with a CHECK (amount > 0) — never floating point.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE payment_status AS ENUM ('Draft', 'Approved', 'Paid', 'Cancelled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS payments (
  id            SERIAL PRIMARY KEY,
  payment_no    VARCHAR(24) NOT NULL UNIQUE,
  payment_date  DATE NOT NULL,
  payment_type  VARCHAR(50) NOT NULL,
  paid_to       VARCHAR(200) NOT NULL,
  amount        NUMERIC(14, 2) NOT NULL,
  payment_mode  VARCHAR(50) NOT NULL,
  reference_no  VARCHAR(200) NOT NULL DEFAULT '',
  remarks       TEXT,
  category      VARCHAR(50) NOT NULL DEFAULT '',
  status        payment_status NOT NULL DEFAULT 'Draft',
  created_by    VARCHAR(200) NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted       BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at    TIMESTAMPTZ,
  CONSTRAINT payments_amount_positive CHECK (amount > 0)
);

-- Re-assert database-level uniqueness across ALL rows (including soft-deleted
-- and cancelled). Non-partial, so deleted numbers stay consumed forever.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_payment_no ON payments (payment_no);

CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments (payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_payment_type ON payments (payment_type);
CREATE INDEX IF NOT EXISTS idx_payments_payment_mode ON payments (payment_mode);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);
CREATE INDEX IF NOT EXISTS idx_payments_deleted ON payments (deleted);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments (created_at DESC);

-- Per-date numbering counters (see header comment).
CREATE TABLE IF NOT EXISTS payment_number_counters (
  counter_date  DATE PRIMARY KEY,
  last_sequence INTEGER NOT NULL DEFAULT 0
);

-- updated_at trigger (set_updated_at is defined in 001_init_schema.sql).
-- created_at is never touched by updates — audit timestamps are preserved.
DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
