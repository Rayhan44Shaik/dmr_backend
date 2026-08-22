-- =============================================================================
-- Trip List integrity hardening (additive, idempotent)
--
-- Deletion for trips is soft-delete represented by BOTH:
--   • trips.deleted = TRUE   (boolean flag)
--   • trips.status  = 'Deleted'  (enum)
--
-- Legacy write paths could leave the two out of sync (e.g. `status='Deleted'`
-- with `deleted=FALSE`, or `deleted=TRUE` with a non-Deleted status), which
-- allowed a deleted trip to leak back into trip lists. This migration repairs
-- any existing inconsistent rows so the DB permanently records deletion, and
-- every query can rely on `deleted = FALSE` / `status = 'Completed'` alone.
-- =============================================================================

-- 1) Any row marked Deleted by status must also carry the soft-delete flag.
UPDATE trips
SET deleted = TRUE
WHERE status = 'Deleted'
  AND COALESCE(deleted, FALSE) = FALSE;

-- 2) Any row carrying the soft-delete flag must also be status Deleted.
UPDATE trips
SET status = 'Deleted'
WHERE COALESCE(deleted, FALSE) = TRUE
  AND status <> 'Deleted';
