-- Collection Entry stays locked by the application rules, but administrators
-- may correct its source row directly in PostgreSQL. Keep the one canonical
-- collection credit and the denormalized shop balances synchronized for every
-- INSERT/UPDATE/DELETE, including amount, date, shop, approval and soft-delete
-- corrections made outside the API.

CREATE OR REPLACE FUNCTION sync_collection_ledger_from_collection()
RETURNS TRIGGER AS $$
DECLARE
  old_shop_id INTEGER;
  new_shop_id INTEGER;
BEGIN
  old_shop_id := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD.shop_id ELSE NULL END;
  new_shop_id := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.shop_id ELSE NULL END;

  -- Remove the previous canonical row first. This also handles shop moves,
  -- unapproval/rejection, soft deletion and hard deletion without leaving a
  -- stale credit behind.
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    DELETE FROM shop_ledger
     WHERE reference_type = 'collection'
       AND reference_id = OLD.id;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE')
     AND NEW.shop_id IS NOT NULL
     AND COALESCE(NEW.deleted, FALSE) = FALSE
     AND (COALESCE(NEW.is_financial, FALSE) = TRUE OR NEW.status = 'Approved')
     AND COALESCE(NEW.amount, NEW.amount_collected, 0) > 0 THEN
    INSERT INTO shop_ledger(
      shop_id, entry_date, entry_type, reference_type, reference_id,
      debit, credit, note
    ) VALUES (
      NEW.shop_id, NEW.collection_date, 'collection', 'collection', NEW.id,
      0, ROUND(COALESCE(NEW.amount, NEW.amount_collected, 0)::numeric, 2),
      'Collection credit (current approved value)'
    );
  END IF;

  UPDATE shops s
     SET current_balance = s.opening_balance + COALESCE((
       SELECT SUM(l.debit - l.credit)
         FROM shop_ledger l
        WHERE l.shop_id = s.id
     ), 0)
   WHERE s.id = old_shop_id OR s.id = new_shop_id;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_collection_ledger_from_collection ON collections;
CREATE TRIGGER trg_sync_collection_ledger_from_collection
  AFTER INSERT OR UPDATE OF amount, amount_collected, collection_date, shop_id,
    status, is_financial, deleted OR DELETE
  ON collections
  FOR EACH ROW EXECUTE FUNCTION sync_collection_ledger_from_collection();
