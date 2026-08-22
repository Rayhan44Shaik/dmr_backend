-- =============================================================================
-- Collection Entry — real financial collections, Shop balance, Shop Ledger
--
-- Establishes ONE authoritative balance system:
--
--   shops.opening_balance        historical opening (already exists; imported /
--                                edited via Shop Master — never touched here)
--   shops.current_balance        running outstanding (mirror, always recomputed
--                                from shop_ledger — never stored by the client)
--   shop_ledger                  single source of truth (DEBIT = sale,
--                                CREDIT = collection, differential corrections)
--
-- Financial events:
--   • Rate Entry lock  → one-time shop_ledger DEBIT per delivery (trigger below
--                        OBSERVES rate_completed transition; it never modifies
--                        Rate Entry, so rateEntryService is untouched).
--   • Shop Sales add   → DEBIT (service hook).
--   • Shop Sales edit  → differential DR/CR correction (service hook).
--   • Collection       → CREDIT at approval, applied exactly once.
--   • Sale/collection reversals roll back through shop_ledger BEFORE the row is
--     marked deleted, so shop.current_balance never goes stale.
--
-- Every ledger mutation re-runs the SAME recalc so current_balance = opening +
-- Σ(debit) − Σ(credit) can never drift out of sync with the ledger.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Shop balance: running outstanding mirror
-- ---------------------------------------------------------------------------
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS current_balance NUMERIC(14, 2) NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Shop Ledger — single source of truth for a shop's finances
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shop_ledger (
  id             SERIAL PRIMARY KEY,
  shop_id        INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  entry_date     DATE NOT NULL,
  entry_type     VARCHAR(20) NOT NULL,   -- 'sale' | 'collection' | 'correction'
  reference_type VARCHAR(20) NOT NULL,   -- 'trip' | 'shop_sale' | 'collection' | 'opening'
  reference_id   INTEGER NOT NULL DEFAULT 0,
  debit          NUMERIC(14, 2) NOT NULL DEFAULT 0,
  credit         NUMERIC(14, 2) NOT NULL DEFAULT 0,
  note           TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (debit >= 0),
  CHECK (credit >= 0),
  CHECK (debit + credit > 0)
);

CREATE INDEX IF NOT EXISTS idx_shop_ledger_shop_date ON shop_ledger(shop_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_shop_ledger_ref ON shop_ledger(reference_type, reference_id);

-- Backfill current_balance to the historical opening for pre-migration shops,
-- so the recalc invariant (current = opening + Σdebit − Σcredit) starts true.
UPDATE shops s
SET current_balance = s.opening_balance
WHERE NOT EXISTS (
  SELECT 1 FROM shop_ledger l WHERE l.shop_id = s.id
);

-- ---------------------------------------------------------------------------
-- Collections — permanent unique numbering
--
-- Also used as the author for user-editable opening_balance: when a shop's
-- opening balance is changed through the Shop Master, we must not rewrite it
-- from a collection snapshots ever again.
-- ---------------------------------------------------------------------------

-- Per-day monotonic counter. PostgreSQL resolves the ON CONFLICT .. DO UPDATE
-- atomically: concurrent transactions serialize on the row lock and each gets
-- a strictly increasing last_value. Because the counter is never decremented,
-- numbers are never reused, even when a collection is deleted. The actual
-- Col-YYYYMMDD-NNN string is produced in the same statement.
CREATE TABLE IF NOT EXISTS collection_sequences (
  seq_date   DATE PRIMARY KEY,
  last_value INTEGER NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION collection_no_for_date(p_date DATE)
RETURNS TEXT AS $$
DECLARE
  v_seq INTEGER;
BEGIN
  INSERT INTO collection_sequences(seq_date, last_value)
  VALUES (p_date, 1)
  ON CONFLICT (seq_date)
  DO UPDATE SET last_value = collection_sequences.last_value + 1
  RETURNING last_value INTO v_seq;

  RETURN 'Col-' || to_char(p_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 3, '0');
END;
$$ LANGUAGE plpgsql;
-- VOLATILE (default for plpgsql) because it WRITES to collection_sequences via
-- an atomic upsert. It is invoked inside the caller's transaction, so a later
-- failure rolls the counter back with it. The upsert serializes concurrent
-- callers on the seq_date row lock, guaranteeing monotonic, gap-only, no-reuse
-- numbering; collection_no's UNIQUE constraint is the hard backstop.

-- ---------------------------------------------------------------------------
-- Collections — snapshot + audit columns the financial flow needs
-- ---------------------------------------------------------------------------
ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS collector       VARCHAR(200) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS closing_balance NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS deleted_by      VARCHAR(200),
  ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_financial    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS amount          NUMERIC(14, 2);

-- Mirror the user-facing `amount` onto the legacy `amount_collected` too so
-- every read path (old and new) stays consistent.
UPDATE collections
SET amount = amount_collected
WHERE amount IS NULL;

-- Positive amount guard (no-op if already present; table is unused pre-migration).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'collections_amount_collected_positive'
      AND conrelid = 'collections'::regclass
  ) THEN
    ALTER TABLE collections
      ADD CONSTRAINT collections_amount_collected_positive
      CHECK (amount_collected > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_collections_shop_date
  ON collections(shop_id, collection_date);

-- ---------------------------------------------------------------------------
-- Rate Entry lock → bake each delivery of the trip as a sale DEBIT
--
-- Fires exactly once (rate_completed FALSE -> TRUE), inside the same
-- transaction as rateEntryService.lock(). It only READS rate state; it never
-- writes trips.rate_completed, so the Rate Entry module is unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bake_trip_sales_into_ledger()
RETURNS TRIGGER AS $$
DECLARE
  d RECORD;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.rate_completed AND NOT OLD.rate_completed THEN
    FOR d IN
      SELECT shop_id, amount
      FROM trip_deliveries
      WHERE trip_id = NEW.id
        AND COALESCE(deleted, FALSE) = FALSE
        AND shop_id IS NOT NULL
        AND amount > 0
    LOOP
      INSERT INTO shop_ledger(
        shop_id, entry_date, entry_type, reference_type, reference_id, debit, credit, note
      ) VALUES (
        d.shop_id, NEW.trip_date, 'sale', 'trip', NEW.id, d.amount, 0,
        'Trip sale debit (Rate Entry locked)'
      );
    END LOOP;

    -- Recompute every shop touched by this trip from the ledger (single source).
    FOR d IN
      SELECT DISTINCT shop_id
      FROM shop_ledger
      WHERE reference_type = 'trip' AND reference_id = NEW.id
    LOOP
      UPDATE shops s
      SET current_balance = s.opening_balance + COALESCE(
        (SELECT SUM(debit) - SUM(credit) FROM shop_ledger WHERE shop_id = s.id), 0
      )
      WHERE s.id = d.shop_id;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trip_rate_lock_sales_ledger ON trips;
CREATE TRIGGER trg_trip_rate_lock_sales_ledger
  AFTER UPDATE OF rate_completed ON trips
  FOR EACH ROW
  WHEN (NEW.rate_completed AND NOT OLD.rate_completed)
  EXECUTE FUNCTION bake_trip_sales_into_ledger();