-- Orders can legitimately capture two equal partial drops for the same shop
-- (for example 10 boxes now and 10 boxes later). The legacy Shop Sales guard
-- keyed on trip/shop/birds/weight treats those distinct events as duplicates.
-- Orders rows already have the concurrency-safe (trip_id, client_key) unique
-- index from migration 036, while the service enforces captured <= assigned.
-- Keep the legacy duplicate rule for Shop Sales only.

DROP INDEX IF EXISTS idx_trip_deliveries_no_dup_sale;

CREATE UNIQUE INDEX idx_trip_deliveries_no_dup_sale
  ON trip_deliveries (trip_id, shop_id, birds, weight)
  WHERE deleted = FALSE
    AND shop_id IS NOT NULL
    AND remarks NOT LIKE '[ORDER]%';
