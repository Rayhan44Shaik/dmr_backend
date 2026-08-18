-- =============================================================================
-- 038 Fuel Expenses hardening (idempotent, transactional, non-destructive)
--
-- Adds GPS columns, allows TRIP display bill numbers to repeat across trips
-- by removing the table-level UNIQUE(bill_no), keeps a lookup index, creates
-- fuel_manual_bill_seq and initializes it from existing MANUAL BILL-* numbers.
--
-- Does not UPDATE litres, rate, amount, bill_no, or approval fields.
-- Does not DELETE fuel rows.
-- =============================================================================

BEGIN;

ALTER TABLE fuel_expenses
  ADD COLUMN IF NOT EXISTS gps_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS gps_lon DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS gps_accuracy DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS gps_captured_at TIMESTAMPTZ;

-- Table-level UNIQUE(bill_no) from 001 would block two trips on the same date
-- from both using TR-YYYYMMDD-001. Drop only that uniqueness, not the rows.
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'fuel_expenses'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) ~* '\(bill_no\)'
      AND pg_get_constraintdef(c.oid) !~* 'source_type'
  LOOP
    EXECUTE format('ALTER TABLE fuel_expenses DROP CONSTRAINT IF EXISTS %I', rec.conname);
  END LOOP;
END $$;

DROP INDEX IF EXISTS fuel_expenses_bill_no_key;

-- Abort if MANUAL bill numbers already collide (including soft-deleted).
DO $$
DECLARE
  dup_count integer;
  sample text;
BEGIN
  SELECT COUNT(*)::int, string_agg(bill_no, ', ' ORDER BY bill_no)
    INTO dup_count, sample
  FROM (
    SELECT bill_no
    FROM fuel_expenses
    WHERE source_type = 'MANUAL'
    GROUP BY bill_no
    HAVING COUNT(*) > 1
  ) d;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      '038 abort: % duplicate MANUAL bill_no value(s). Resolve before unique index. Samples: %',
      dup_count,
      COALESCE(sample, '');
  END IF;
END $$;

-- Never reuse a MANUAL bill number, including after soft-delete.
CREATE UNIQUE INDEX IF NOT EXISTS ux_fuel_expenses_manual_bill_no
  ON fuel_expenses (bill_no)
  WHERE source_type = 'MANUAL';

-- Lookup indexes: IF NOT EXISTS so 002/005 indexes are not duplicated.
CREATE INDEX IF NOT EXISTS idx_fuel_expenses_bill_no
  ON fuel_expenses (bill_no);

CREATE INDEX IF NOT EXISTS idx_fuel_expenses_vehicle_date
  ON fuel_expenses (vehicle_id, expense_date);

CREATE TABLE IF NOT EXISTS fuel_manual_bill_seq (
  ymd CHAR(8) PRIMARY KEY,
  last_seq INTEGER NOT NULL
);

-- Initialize / raise sequence from existing MANUAL bills. Never reset downward.
INSERT INTO fuel_manual_bill_seq (ymd, last_seq)
SELECT m.ymd, m.max_seq
FROM (
  SELECT
    substring(bill_no from '^BILL-(\d{8})-') AS ymd,
    MAX(substring(bill_no from '^BILL-\d{8}-(\d+)$')::integer) AS max_seq
  FROM fuel_expenses
  WHERE source_type = 'MANUAL'
    AND bill_no ~ '^BILL-\d{8}-\d+$'
  GROUP BY 1
) m
WHERE m.ymd IS NOT NULL
  AND m.max_seq IS NOT NULL
ON CONFLICT (ymd) DO UPDATE
  SET last_seq = GREATEST(fuel_manual_bill_seq.last_seq, EXCLUDED.last_seq);

COMMIT;
