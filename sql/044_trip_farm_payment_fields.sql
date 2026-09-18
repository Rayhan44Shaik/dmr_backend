-- =============================================================================
-- Trip farm payment settlement fields (Accounts → Farmer Payments)
-- Persists paid amount / date / mode / reference on the trip row itself.
-- Existing farm_rate / farm_amount / dc_weight columns are left intact.
-- =============================================================================

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS farm_paid_amount NUMERIC(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS farm_payment_date DATE NULL,
  ADD COLUMN IF NOT EXISTS farm_payment_mode VARCHAR(50) DEFAULT '',
  ADD COLUMN IF NOT EXISTS farm_payment_reference VARCHAR(100) DEFAULT '';
