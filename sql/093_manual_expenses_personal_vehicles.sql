-- Manual operating expenses and personal/owner vehicles.
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS is_personal BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE vehicles
  DROP CONSTRAINT IF EXISTS vehicles_rental_personal_exclusive;
ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_rental_personal_exclusive
  CHECK (NOT (is_rented AND is_personal));

CREATE TABLE IF NOT EXISTS manual_expenses (
  id BIGSERIAL PRIMARY KEY,
  expense_no VARCHAR(40) NOT NULL UNIQUE,
  expense_date DATE NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  expense_type VARCHAR(80) NOT NULL,
  description VARCHAR(300) NOT NULL,
  remarks VARCHAR(1000),
  created_by VARCHAR(200) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manual_expenses_date
  ON manual_expenses (expense_date DESC, id DESC);
