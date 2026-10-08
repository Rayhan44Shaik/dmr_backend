ALTER TABLE employees ADD COLUMN IF NOT EXISTS secondary_department VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_employees_secondary_department ON employees (secondary_department) WHERE secondary_department IS NOT NULL;
