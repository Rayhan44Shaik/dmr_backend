-- =============================================================================
-- Fleet module — Maintenance number hardening
--
-- 1. Maintenance numbers (bill_no) are globally unique across ALL records,
--    including soft-deleted / historical rows. The column already declares
--    NOT NULL UNIQUE; this backs it with an explicitly named unique index so
--    uniqueness is enforced at the database level (defense in depth) and any
--    accidental collision surfaces as 23505 → HTTP 409 with a full rollback.
--
-- 2. Partial index for the "Approved = latest approved maintenance per vehicle"
--    query (DISTINCT ON fm.vehicle_id ordered by approved_at DESC, id DESC).
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_fleet_maintenance_bill_no
  ON fleet_maintenance (bill_no);

CREATE INDEX IF NOT EXISTS idx_fleet_maintenance_approved_latest
  ON fleet_maintenance (vehicle_id, approved_at DESC, id DESC)
  WHERE status = 'Approved' AND COALESCE(deleted, FALSE) = FALSE;
