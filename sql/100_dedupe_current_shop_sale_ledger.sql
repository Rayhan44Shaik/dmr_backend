-- A Shop Sale has exactly one current financial row.  Rebuild the current
-- delivery-linked rows once so prior Rate Entry locks cannot leave duplicates.
DELETE FROM shop_ledger
 WHERE entry_type = 'sale'
   AND reference_type = 'shop_sale';

INSERT INTO shop_ledger(
  shop_id, entry_date, entry_type, reference_type, reference_id, debit, credit, note
)
SELECT d.shop_id, t.trip_date, 'sale', 'shop_sale', d.id,
       ROUND(COALESCE(d.amount, 0)::numeric, 2), 0,
       'Shop sale debit (current delivery value)'
  FROM trip_deliveries d
  JOIN trips t ON t.id = d.trip_id
 WHERE d.shop_id IS NOT NULL
   AND COALESCE(d.deleted, FALSE) = FALSE
   AND COALESCE(d.amount, 0) > 0;

UPDATE shops s
   SET current_balance = s.opening_balance + COALESCE((
     SELECT SUM(l.debit - l.credit) FROM shop_ledger l WHERE l.shop_id = s.id
   ), 0);

-- Rate Entry may run after the delivery row already has its canonical ledger
-- row.  Only create the row when it is genuinely absent.
CREATE OR REPLACE FUNCTION bake_trip_sales_into_ledger()
RETURNS TRIGGER AS $$
DECLARE
  d RECORD;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.rate_completed AND NOT OLD.rate_completed THEN
    FOR d IN
      SELECT id, shop_id, amount
        FROM trip_deliveries
       WHERE trip_id = NEW.id
         AND COALESCE(deleted, FALSE) = FALSE
         AND shop_id IS NOT NULL
         AND amount > 0
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM shop_ledger
         WHERE shop_id = d.shop_id
           AND entry_type = 'sale'
           AND reference_type = 'shop_sale'
           AND reference_id = d.id
      ) THEN
        INSERT INTO shop_ledger(
          shop_id, entry_date, entry_type, reference_type, reference_id, debit, credit, note
        ) VALUES (
          d.shop_id, NEW.trip_date, 'sale', 'shop_sale', d.id, d.amount, 0,
          'Shop sale debit (Rate Entry locked)'
        );
      END IF;
    END LOOP;
    UPDATE shops s
       SET current_balance = s.opening_balance + COALESCE((
         SELECT SUM(l.debit - l.credit) FROM shop_ledger l WHERE l.shop_id = s.id
       ), 0)
     WHERE s.id IN (
       SELECT DISTINCT shop_id FROM trip_deliveries
        WHERE trip_id = NEW.id AND shop_id IS NOT NULL
     );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
