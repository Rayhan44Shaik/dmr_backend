-- Collection numbers use one permanent, case-consistent identity format.
-- Existing mixed-case prefixes are normalized and all future numbers are
-- generated as COL-YYYYMMDD-NNN.

UPDATE collections
   SET collection_no = regexp_replace(collection_no, '^col-', 'COL-', 'i')
 WHERE collection_no ~* '^col-';

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

  RETURN 'COL-' || to_char(p_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 3, '0');
END;
$$ LANGUAGE plpgsql;

