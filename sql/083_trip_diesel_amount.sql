ALTER TABLE trip_diesel_entries
  ADD COLUMN IF NOT EXISTS amount NUMERIC(12, 2);

UPDATE trip_diesel_entries
   SET amount = ROUND(COALESCE(litres, 0) * COALESCE(rate, 0), 2)
 WHERE amount IS NULL;
