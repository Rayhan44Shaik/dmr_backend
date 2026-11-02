ALTER TABLE fuel_expenses
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_fuel_expenses_deleted_at
  ON fuel_expenses (deleted, deleted_at DESC);
