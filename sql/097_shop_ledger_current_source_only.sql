-- Shop Ledger is a live statement, not an edit history.  A Shop Sale or an
-- approved Collection therefore has exactly one ledger row containing its
-- CURRENT values.  Historical correction rows caused duplicate/zero-quantity
-- transactions in the Shop Ledger and Cumulative views.

BEGIN;

-- Rebuild sales from the authoritative current Shop Sales rows. This removes
-- old trip-level rows and all sale corrections, leaving one delivery-linked
-- sale per active delivery.
DELETE FROM shop_ledger
WHERE reference_type IN ('trip', 'shop_sale') OR entry_type = 'correction';

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

-- Rebuild collections from their authoritative current approved records.
DELETE FROM shop_ledger WHERE reference_type = 'collection';

INSERT INTO shop_ledger(
  shop_id, entry_date, entry_type, reference_type, reference_id, debit, credit, note
)
SELECT c.shop_id, c.collection_date, 'collection', 'collection', c.id, 0,
       ROUND(COALESCE(c.amount, 0)::numeric, 2),
       'Collection credit (current approved value)'
  FROM collections c
 WHERE c.shop_id IS NOT NULL
   AND COALESCE(c.deleted, FALSE) = FALSE
   AND COALESCE(c.is_financial, FALSE) = TRUE
   AND COALESCE(c.amount, 0) > 0;

-- Keep the Shop Master balance as the denormalized mirror of the rebuilt,
-- current-only ledger.
UPDATE shops s
   SET current_balance = s.opening_balance + COALESCE((
     SELECT SUM(l.debit - l.credit) FROM shop_ledger l WHERE l.shop_id = s.id
   ), 0);

-- Future Rate Entry locks must also write one delivery-linked sale row, not a
-- trip-level aggregate that cannot follow a later Shop Sale edit precisely.
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
      INSERT INTO shop_ledger(
        shop_id, entry_date, entry_type, reference_type, reference_id, debit, credit, note
      ) VALUES (
        d.shop_id, NEW.trip_date, 'sale', 'shop_sale', d.id, d.amount, 0,
        'Shop sale debit (Rate Entry locked)'
      );
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

COMMIT;
