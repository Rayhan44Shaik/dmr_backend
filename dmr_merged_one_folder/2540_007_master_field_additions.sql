-- =============================================================================
-- Master field additions to match frontend master forms
--   shops.opening_balance   -> Shop form "Opening Balance" (required)
--   vehicles.emi_day        -> Vehicle form "EMI Day"
--   vehicles.total_emis     -> Vehicle form "Total EMIs"
-- =============================================================================

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS emi_day INTEGER,
  ADD COLUMN IF NOT EXISTS total_emis INTEGER;
