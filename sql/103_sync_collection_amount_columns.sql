-- Collection amount has three compatibility columns. pgAdmin operators often
-- edit amount_collected directly, while the modern application reads amount.
-- Keep all three synchronized so direct database corrections immediately flow
-- to Pending Collections, Collection Entry and the Shop Ledger trigger.

CREATE OR REPLACE FUNCTION normalize_collection_amount_columns()
RETURNS TRIGGER AS $$
DECLARE
  canonical NUMERIC(14, 2);
BEGIN
  IF TG_OP = 'INSERT' THEN
    canonical := COALESCE(NEW.amount, NEW.amount_collected, NEW.amount_due);
  ELSIF NEW.amount_collected IS DISTINCT FROM OLD.amount_collected THEN
    canonical := NEW.amount_collected;
  ELSIF NEW.amount IS DISTINCT FROM OLD.amount THEN
    canonical := NEW.amount;
  ELSIF NEW.amount_due IS DISTINCT FROM OLD.amount_due THEN
    canonical := NEW.amount_due;
  ELSE
    canonical := COALESCE(NEW.amount, NEW.amount_collected, NEW.amount_due);
  END IF;

  IF canonical IS NOT NULL THEN
    NEW.amount := canonical;
    NEW.amount_collected := canonical;
    NEW.amount_due := canonical;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Repair existing never-financial pending rows where a direct pgAdmin edit
-- changed amount_collected but left the application-facing amount stale.
UPDATE collections
   SET amount = amount_collected,
       amount_due = amount_collected,
       updated_at = NOW()
 WHERE status = 'Pending Approval'
   AND COALESCE(deleted, FALSE) = FALSE
   AND COALESCE(is_financial, FALSE) = FALSE
   AND amount_collected IS NOT NULL
   AND (amount IS DISTINCT FROM amount_collected OR amount_due IS DISTINCT FROM amount_collected);

DROP TRIGGER IF EXISTS trg_normalize_collection_amount_columns ON collections;
CREATE TRIGGER trg_normalize_collection_amount_columns
  BEFORE INSERT OR UPDATE OF amount, amount_collected, amount_due
  ON collections
  FOR EACH ROW EXECUTE FUNCTION normalize_collection_amount_columns();
