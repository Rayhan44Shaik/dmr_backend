-- =============================================================================
-- 039 Fuel trip independence (idempotent, transactional, non-destructive)
--
-- Snapshots source_trip_id / source_trip_no, ensures trip_id FK is
-- ON DELETE SET NULL (never CASCADE / RESTRICT), unique trip-origin identity
-- that survives trip_id becoming NULL, MANUAL bill_no unique including
-- soft-deleted rows, sequence GREATEST-initialized again.
--
-- Does not UPDATE litres, rate, amount, bill_no, or approval fields.
-- Does not DELETE fuel rows. Does not fabricate trip numbers for orphans.
-- =============================================================================

BEGIN;

ALTER TABLE fuel_expenses
  ADD COLUMN IF NOT EXISTS source_trip_id INTEGER,
  ADD COLUMN IF NOT EXISTS source_trip_no VARCHAR(40);

-- Backfill identity only from existing columns / live trips. No invented values.
UPDATE fuel_expenses
   SET source_trip_id = COALESCE(source_trip_id, trip_id)
 WHERE source_type = 'TRIP'
   AND source_trip_id IS NULL
   AND trip_id IS NOT NULL;

-- Recover historical trip id already encoded in legacy TRIP-{id}-D{index} bill numbers.
-- This is not invented: it is parsed from bill_no. trip_no is still not fabricated.
UPDATE fuel_expenses
   SET source_trip_id = COALESCE(
         source_trip_id,
         NULLIF(substring(bill_no from '^TRIP-(\d+)-D\d+$'), '')::integer
       )
 WHERE source_type = 'TRIP'
   AND source_trip_id IS NULL
   AND bill_no ~ '^TRIP-\d+-D\d+$';

UPDATE fuel_expenses
   SET trip_fuel_entry_index = COALESCE(
         trip_fuel_entry_index,
         NULLIF(substring(bill_no from '^TRIP-\d+-D(\d+)$'), '')::integer
       )
 WHERE source_type = 'TRIP'
   AND trip_fuel_entry_index IS NULL
   AND bill_no ~ '^TRIP-\d+-D\d+$';

UPDATE fuel_expenses fe
   SET source_trip_no = COALESCE(NULLIF(fe.source_trip_no, ''), t.trip_no)
  FROM trips t
 WHERE fe.source_type = 'TRIP'
   AND (fe.source_trip_no IS NULL OR fe.source_trip_no = '')
   AND t.id = COALESCE(fe.trip_id, fe.source_trip_id);

DO $$
DECLARE
  orphan_count integer;
BEGIN
  SELECT COUNT(*)::int INTO orphan_count
  FROM fuel_expenses
  WHERE source_type = 'TRIP'
    AND COALESCE(deleted, FALSE) = FALSE
    AND (source_trip_no IS NULL OR source_trip_no = '');

  IF orphan_count > 0 THEN
    RAISE NOTICE
      '039: % TRIP fuel row(s) have no source_trip_no (trip missing and value was not stored). Left unchanged; not fabricated.',
      orphan_count;
  END IF;
END $$;

-- Recreate only the trip_id FK as SET NULL. Match attname = trip_id so
-- source_trip_id is never treated as a Trip FK (historical orphan reference).
DO $$
DECLARE
  rec record;
  def text;
  already_ok boolean := FALSE;
BEGIN
  FOR rec IN
    SELECT c.oid, c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (c.conkey)
    WHERE n.nspname = 'public'
      AND t.relname = 'fuel_expenses'
      AND c.contype = 'f'
      AND a.attname = 'trip_id'
  LOOP
    def := pg_get_constraintdef(rec.oid);
    IF def ~* 'ON DELETE SET NULL' AND def ~* 'REFERENCES trips' THEN
      already_ok := TRUE;
    ELSE
      EXECUTE format('ALTER TABLE fuel_expenses DROP CONSTRAINT IF EXISTS %I', rec.conname);
      already_ok := FALSE;
    END IF;
  END LOOP;

  IF NOT already_ok AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'fuel_expenses'
      AND c.conname = 'fuel_expenses_trip_id_fkey'
  ) THEN
    ALTER TABLE fuel_expenses
      ADD CONSTRAINT fuel_expenses_trip_id_fkey
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Duplicate TRIP identity must be reported, never merged/deleted.
DO $$
DECLARE
  dup_count integer;
  sample text;
BEGIN
  SELECT COUNT(*)::int, string_agg(src, ', ')
    INTO dup_count, sample
  FROM (
    SELECT source_trip_id::text || ':' || trip_fuel_entry_index::text AS src
    FROM fuel_expenses
    WHERE source_type = 'TRIP'
      AND COALESCE(deleted, FALSE) = FALSE
      AND source_trip_id IS NOT NULL
    GROUP BY source_trip_id, trip_fuel_entry_index
    HAVING COUNT(*) > 1
  ) d;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      '039 abort: % duplicate (source_trip_id, trip_fuel_entry_index) group(s). Resolve before unique index. Samples: %',
      dup_count,
      COALESCE(sample, '');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_fuel_expenses_source_trip_entry
  ON fuel_expenses (source_trip_id, trip_fuel_entry_index)
  WHERE source_type = 'TRIP' AND deleted = FALSE AND source_trip_id IS NOT NULL;

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
      '039 abort: % duplicate MANUAL bill_no value(s), including soft-deleted. Resolve before unique index. Samples: %',
      dup_count,
      COALESCE(sample, '');
  END IF;
END $$;

-- Replace active-only unique (older 038) with never-reuse unique.
DROP INDEX IF EXISTS ux_fuel_expenses_manual_bill_no;
CREATE UNIQUE INDEX ux_fuel_expenses_manual_bill_no
  ON fuel_expenses (bill_no)
  WHERE source_type = 'MANUAL';

CREATE INDEX IF NOT EXISTS idx_fuel_expenses_source_trip_no
  ON fuel_expenses (source_trip_no);

-- Sequence must not collide with existing MANUAL numbers after retry/partial apply.
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
