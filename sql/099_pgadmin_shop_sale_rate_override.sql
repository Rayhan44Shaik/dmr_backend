-- Shop Sales remains locked in the application after 14 days.  Database
-- administrators may still correct a delivery directly in pgAdmin.  The
-- database therefore must not reject a direct SQL rate/weight/birds/amount
-- update; instead it keeps the canonical Shop Ledger row in sync.

-- 098 installed a database-wide edit guard.  Remove only that trigger: the
-- API/service layer continues to enforce the 14-day Shop Sales edit window.
DROP TRIGGER IF EXISTS trg_trip_deliveries_rate_lock ON trip_deliveries;

CREATE OR REPLACE FUNCTION sync_shop_sale_ledger_from_delivery()
RETURNS TRIGGER AS $$
DECLARE
  delivery_date DATE;
BEGIN
  -- Shop reassignment is a business operation handled by the application,
  -- because it must move the sale between two shop ledgers.  This trigger is
  -- deliberately for same-shop financial corrections made by an administrator.
  IF NEW.shop_id IS NULL
     OR COALESCE(NEW.deleted, FALSE)
     OR NEW.shop_id IS DISTINCT FROM OLD.shop_id
     OR NEW.amount IS NOT DISTINCT FROM OLD.amount THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.amount, 0) <= 0 THEN
    DELETE FROM shop_ledger
     WHERE shop_id = NEW.shop_id
       AND entry_type = 'sale'
       AND reference_type = 'shop_sale'
       AND reference_id = NEW.id;
  ELSE
    UPDATE shop_ledger
       SET debit = ROUND(NEW.amount::numeric, 2),
           credit = 0,
           note = 'Shop sale debit (current delivery value)'
     WHERE shop_id = NEW.shop_id
       AND entry_type = 'sale'
       AND reference_type = 'shop_sale'
       AND reference_id = NEW.id;

    IF NOT FOUND THEN
      SELECT trip_date INTO delivery_date FROM trips WHERE id = NEW.trip_id;
      INSERT INTO shop_ledger(
        shop_id, entry_date, entry_type, reference_type, reference_id, debit, credit, note
      ) VALUES (
        NEW.shop_id, delivery_date, 'sale', 'shop_sale', NEW.id,
        ROUND(NEW.amount::numeric, 2), 0, 'Shop sale debit (current delivery value)'
      );
    END IF;
  END IF;

  UPDATE shops s
     SET current_balance = s.opening_balance + COALESCE((
       SELECT SUM(l.debit - l.credit) FROM shop_ledger l WHERE l.shop_id = s.id
     ), 0)
   WHERE s.id = NEW.shop_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_shop_sale_ledger_from_delivery ON trip_deliveries;
CREATE TRIGGER trg_sync_shop_sale_ledger_from_delivery
  AFTER UPDATE OF birds, weight, rate, amount ON trip_deliveries
  FOR EACH ROW EXECUTE FUNCTION sync_shop_sale_ledger_from_delivery();
