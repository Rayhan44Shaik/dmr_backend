-- =============================================================================
-- Shop Sales duplicate/idempotency guard
--
-- The previous protection against duplicate Shop Sales was purely an
-- application-level check for an exact (trip_id, shop_id, birds, weight)
-- match created within the last 5 seconds (see shopSalesService.ts
-- create()). That only caught an accidental instant double-submit — a
-- retried request after 5s, or two requests racing concurrently (a plain
-- SELECT-then-INSERT with no row lock), could both create a duplicate row.
--
-- This replaces the time-boxed guess with a real, concurrency-safe
-- database constraint using the existing identifiers (trip_id, shop_id —
-- no new "sale identity" column introduced). Only active (non-deleted)
-- rows are constrained, so a soft-deleted sale never blocks a legitimate
-- fresh replacement. shop_id IS NOT NULL is required in the predicate
-- because Postgres treats every NULL as distinct in a unique index (not a
-- gap in practice: shopSalesService.create() already requires a non-null
-- shopId for every new Shop Sale).
--
-- Deliberately keyed on birds+weight, not just (trip_id, shop_id): a trip
-- legitimately delivering to the same shop twice with different
-- quantities (two separate box drops) remains allowed — only an exact
-- duplicate of an existing active delivery is rejected.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_deliveries_no_dup_sale
  ON trip_deliveries (trip_id, shop_id, birds, weight)
  WHERE deleted = FALSE AND shop_id IS NOT NULL;
