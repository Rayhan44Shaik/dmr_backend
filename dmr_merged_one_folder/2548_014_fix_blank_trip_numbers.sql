-- =============================================================================
-- 014_fix_blank_trip_numbers.sql
--
-- Repair trips that were created with a blank/empty trip_no (the historical
-- "Duplicate record" / blank "Trip No" symptom). The trips.trip_no column is
-- NOT NULL UNIQUE, so a second empty trip_no fires 23505 → HTTP 409.
--
-- We do NOT delete data. Instead we assign each malformed trip a valid
-- sequential TR-YYYYMMDD-### number, continuing after the highest existing
-- number already used for that trip date, in id order (within one transaction).
-- Deleted rows retain their numbers (a consumed sequence is never reused).
-- =============================================================================

DO $$
DECLARE
  rec RECORD;
  last_date DATE := NULL;
  seq INT;
  base INT;
BEGIN
  FOR rec IN
    SELECT id, trip_date
    FROM trips
    WHERE trip_no IS NULL
       OR trip_no = ''
       OR trip_no !~ '^TR-\d{8}-\d{3}$'
    ORDER BY trip_date, id
  LOOP
    IF last_date IS DISTINCT FROM rec.trip_date THEN
      last_date := rec.trip_date;
      SELECT COALESCE(MAX((substring(trip_no from '\d{3}$'))::int), 0)
        INTO base
        FROM trips
       WHERE trip_date = rec.trip_date
         AND trip_no ~ '^TR-\d{8}-\d{3}$';
      seq := base;
    END IF;
    seq := seq + 1;
    UPDATE trips
       SET trip_no = 'TR-' || to_char(rec.trip_date, 'YYYYMMDD') || '-'
                     || lpad(seq::text, 3, '0')
     WHERE id = rec.id;
  END LOOP;
END $$;