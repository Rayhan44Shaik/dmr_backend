-- Preserve existing historical data while reserving every non-empty reference
-- number against future reuse (case/outer-whitespace insensitive).
CREATE TABLE IF NOT EXISTS collection_reference_registry (
  normalized_reference TEXT PRIMARY KEY,
  collection_id BIGINT NOT NULL UNIQUE REFERENCES collections(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (normalized_reference = LOWER(BTRIM(normalized_reference))),
  CHECK (normalized_reference <> '')
);

INSERT INTO collection_reference_registry(normalized_reference, collection_id)
SELECT LOWER(BTRIM(reference_no)), MIN(id)
  FROM collections
 WHERE BTRIM(COALESCE(reference_no, '')) <> ''
 GROUP BY LOWER(BTRIM(reference_no))
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION reserve_collection_reference()
RETURNS TRIGGER AS $$
DECLARE
  v_reference TEXT := LOWER(BTRIM(COALESCE(NEW.reference_no, '')));
  v_owner BIGINT;
BEGIN
  IF TG_OP = 'UPDATE' AND LOWER(BTRIM(COALESCE(OLD.reference_no, ''))) = v_reference THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND BTRIM(COALESCE(OLD.reference_no, '')) <> '' THEN
    DELETE FROM collection_reference_registry WHERE collection_id = OLD.id;
  END IF;

  IF v_reference <> '' THEN
    SELECT collection_id INTO v_owner
      FROM collection_reference_registry
     WHERE normalized_reference = v_reference;
    IF v_owner IS NOT NULL AND v_owner <> NEW.id THEN
      RAISE EXCEPTION 'Reference number already exists.' USING ERRCODE = '23505';
    END IF;
    INSERT INTO collection_reference_registry(normalized_reference, collection_id)
    VALUES (v_reference, NEW.id)
    ON CONFLICT (normalized_reference) DO UPDATE
      SET collection_id = EXCLUDED.collection_id
      WHERE collection_reference_registry.collection_id = EXCLUDED.collection_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_collections_reference_unique ON collections;
CREATE TRIGGER trg_collections_reference_unique
  AFTER INSERT OR UPDATE OF reference_no ON collections
  FOR EACH ROW EXECUTE FUNCTION reserve_collection_reference();
