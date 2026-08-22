-- =============================================================================
-- 023_shop_sales_hardening.sql
-- Shop Sales are trip_deliveries rows (see shopSalesService.ts) — no separate
-- shop_sales table. This gives each delivery/shop-sale a real, permanent,
-- per-trip sale number and a proper soft-delete flag (instead of the old
-- behaviour of zeroing birds/weight/amount, which destroyed history).
-- =============================================================================

ALTER TABLE trip_deliveries
  ADD COLUMN IF NOT EXISTS sale_no        VARCHAR(50),
  ADD COLUMN IF NOT EXISTS deleted        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_reason TEXT;

-- Backfill sale_no for existing rows: <trip_no>-S<seq>, sequential per trip
-- in id order, matching the format the app now generates for new rows.
WITH numbered AS (
  SELECT d.id, t.trip_no,
         ROW_NUMBER() OVER (PARTITION BY d.trip_id ORDER BY d.id) AS seq
  FROM trip_deliveries d
  JOIN trips t ON t.id = d.trip_id
)
UPDATE trip_deliveries d
SET sale_no = numbered.trip_no || '-S' || lpad(numbered.seq::text, 2, '0')
FROM numbered
WHERE d.id = numbered.id
  AND d.sale_no IS NULL;

-- Any orphaned deliveries with no resolvable trip_no (should not exist given
-- the FK, but guard the NOT NULL below regardless) fall back to a row-id key.
UPDATE trip_deliveries
SET sale_no = 'TD-' || id
WHERE sale_no IS NULL;

ALTER TABLE trip_deliveries
  ALTER COLUMN sale_no SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_deliveries_sale_no ON trip_deliveries (sale_no);
CREATE INDEX IF NOT EXISTS idx_trip_deliveries_trip_deleted ON trip_deliveries (trip_id, deleted);
