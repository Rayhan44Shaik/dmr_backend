-- =============================================================================
-- Employee duplicate guards
--   department + employee name  -> case-insensitive unique
--   phone_number                -> unique (non-empty)
--   email                       -> unique, case-insensitive (non-empty)
-- Empty/blank values stay allowed (multiple rows may share '' / NULL email).
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_dept_name_unique
  ON employees (LOWER(department), LOWER(employee_name));

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_phone_unique
  ON employees (phone_number)
  WHERE phone_number <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_email_unique
  ON employees (LOWER(email))
  WHERE email <> '';
