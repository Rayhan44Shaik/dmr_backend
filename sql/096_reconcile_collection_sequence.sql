-- Keep Collection Entry numbering monotonic even after a database restore or
-- an administrative reload that restores `collections` without restoring the
-- companion `collection_sequences` row. The per-date row lock serializes all
-- normal creates/imports; the maximum permanent number already present is the
-- lower bound, so COL-...-001 through COL-...-192 can never be reused and the
-- next number is COL-...-193.
CREATE OR REPLACE FUNCTION collection_no_for_date(p_date DATE)
RETURNS TEXT AS $$
DECLARE
  v_seq INTEGER;
  v_existing_max INTEGER;
  v_date_token TEXT := to_char(p_date, 'YYYYMMDD');
BEGIN
  SELECT COALESCE(MAX(
           CASE
             WHEN UPPER(collection_no) LIKE ('COL-' || v_date_token || '-%')
             THEN split_part(collection_no, '-', 3)::INTEGER
             ELSE 0
           END
         ), 0)
    INTO v_existing_max
    FROM collections
   WHERE collection_date = p_date;

  -- The conflicting row is PostgreSQL's per-date allocator lock. Concurrent
  -- callers serialize here; each advances from the larger of the counter or
  -- the permanent high-water number found in `collections`.
  INSERT INTO collection_sequences(seq_date, last_value)
  VALUES (p_date, v_existing_max + 1)
  ON CONFLICT (seq_date)
  DO UPDATE SET last_value = GREATEST(
    collection_sequences.last_value + 1,
    EXCLUDED.last_value
  )
   RETURNING last_value INTO v_seq;

  RETURN 'COL-' || v_date_token || '-' || lpad(v_seq::text, 3, '0');
END;
$$ LANGUAGE plpgsql;
