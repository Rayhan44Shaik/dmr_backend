-- =============================================================================
-- Fix fuel_expenses.ops_status drift.
-- The pre-existing create()/update() service code never wrote ops_status
-- (only the legacy `status` column), so every row created after migration
-- 004 was stuck at the ops_status column default ('Draft') regardless of its
-- real approval state. ops_status is now the canonical approval field
-- (fuelExpensesService.ts), so backfill it from the legacy `status` column
-- for any row where it drifted.
-- =============================================================================
UPDATE fuel_expenses
SET ops_status = CASE
  WHEN status::text = 'Approved' THEN 'Approved'::ops_record_status
  ELSE 'Pending Approval'::ops_record_status
END
WHERE ops_status = 'Draft'::ops_record_status
  AND COALESCE(deleted, FALSE) = FALSE;
