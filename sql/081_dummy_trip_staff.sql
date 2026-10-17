ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS is_dummy BOOLEAN NOT NULL DEFAULT FALSE;

WITH requested(employee_name, department, role, sequence_no) AS (
  VALUES
    ('XX_Loader', 'Loader', 'Loader', 1),
    ('XX_Loader_2', 'Loader', 'Loader', 2),
    ('XX_Driver', 'Driver', 'Driver', 3),
    ('XX_Driver_2', 'Driver', 'Driver', 4),
    ('XX_Helper', 'Helper', 'Helper', 5),
    ('XX_Helper_2', 'Helper', 'Helper', 6),
    ('XX_Supervisor', 'Supervisor', 'Supervisor', 7),
    ('XX_Supervisor_2', 'Supervisor', 'Supervisor', 8)
), numbered AS (
  SELECT requested.*,
         (SELECT COALESCE(MAX(employee_no), 0) FROM employees) + sequence_no AS employee_no
    FROM requested
)
INSERT INTO employees (
  employee_no, employee_name, department, role, phone_number, email,
  address, joining_date, aadhar_number, license_number, salary, status,
  avatar, secondary_department, is_dummy
)
SELECT employee_no, employee_name, department, role, '', '',
       'Dummy trip workflow profile', NULL, NULL, NULL, 0, 'Active',
       NULL, NULL, TRUE
  FROM numbered
ON CONFLICT (LOWER(department), LOWER(employee_name))
DO UPDATE SET
  role = EXCLUDED.role,
  salary = 0,
  status = 'Active',
  secondary_department = NULL,
  is_dummy = TRUE,
  updated_at = NOW();

CREATE INDEX IF NOT EXISTS idx_employees_dummy
  ON employees (is_dummy)
  WHERE is_dummy = TRUE;
