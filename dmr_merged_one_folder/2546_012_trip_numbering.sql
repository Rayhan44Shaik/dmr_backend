-- ---------------------------------------------------------------------------
-- 012_trip_numbering.sql
-- Trip numbers are now TR-YYYYMMDD-### (was TRP-YYYYMMDD-### / TRIP-YYYYMMDD-###).
-- Renumber every trip per date to a clean sequential series (001..n) in id
-- order, resolving any legacy prefix duplicates, and keep uniqueness.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t RECORD;
  i INTEGER := 0;
  last_date DATE := NULL;
BEGIN
  FOR t IN
    SELECT id, trip_date
    FROM trips
    ORDER BY trip_date, id
  LOOP
    IF last_date IS DISTINCT FROM t.trip_date THEN
      i := 0;
      last_date := t.trip_date;
    END IF;
    i := i + 1;
    UPDATE trips
       SET trip_no = 'TR-' || to_char(t.trip_date, 'YYYYMMDD') || '-' || lpad(i::text, 3, '0')
     WHERE id = t.id;
  END LOOP;
END $$;

-- The UNIQUE constraint (trips_trip_no_key) already enforces uniqueness;
-- drop the redundant non-unique index that duplicated it.
DROP INDEX IF EXISTS idx_trips_trip_no;