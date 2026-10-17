WITH requested(employee_name, department, role, sequence_no) AS (
  VALUES
    ('XX_Loader_3', 'Loader', 'Loader', 1),
    ('XX_Loader_4', 'Loader', 'Loader', 2),
    ('XX_Loader_5', 'Loader', 'Loader', 3),
    ('XX_Loader_6', 'Loader', 'Loader', 4),
    ('XX_Loader_7', 'Loader', 'Loader', 5),
    ('XX_Driver_3', 'Driver', 'Driver', 6),
    ('XX_Driver_4', 'Driver', 'Driver', 7),
    ('XX_Driver_5', 'Driver', 'Driver', 8),
    ('XX_Driver_6', 'Driver', 'Driver', 9),
    ('XX_Driver_7', 'Driver', 'Driver', 10),
    ('XX_Helper_3', 'Helper', 'Helper', 11),
    ('XX_Helper_4', 'Helper', 'Helper', 12),
    ('XX_Helper_5', 'Helper', 'Helper', 13),
    ('XX_Helper_6', 'Helper', 'Helper', 14),
    ('XX_Helper_7', 'Helper', 'Helper', 15),
    ('XX_Supervisor_3', 'Supervisor', 'Supervisor', 16),
    ('XX_Supervisor_4', 'Supervisor', 'Supervisor', 17),
    ('XX_Supervisor_5', 'Supervisor', 'Supervisor', 18),
    ('XX_Supervisor_6', 'Supervisor', 'Supervisor', 19),
    ('XX_Supervisor_7', 'Supervisor', 'Supervisor', 20)
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
