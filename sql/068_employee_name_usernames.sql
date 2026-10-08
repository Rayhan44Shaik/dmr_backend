-- Replace the temporary user@<employee number> convention with readable,
-- employee-name usernames. Duplicate names retain a compact employee-number
-- suffix so the unique username constraint remains deterministic.
WITH candidates AS (
  SELECT
    u.id,
    e.employee_no,
    COALESCE(
      NULLIF(UPPER(regexp_replace(e.employee_name, '[^a-zA-Z0-9]', '', 'g')), ''),
      'EMPLOYEE' || e.employee_no::text
    ) AS base_username,
    COUNT(*) OVER (
      PARTITION BY COALESCE(
        NULLIF(UPPER(regexp_replace(e.employee_name, '[^a-zA-Z0-9]', '', 'g')), ''),
        'EMPLOYEE' || e.employee_no::text
      )
    ) AS duplicate_count
  FROM application_users u
  JOIN employees e ON e.id = u.employee_id
  WHERE u.username ~* '^user@[0-9]+$'
), resolved AS (
  SELECT
    c.id,
    CASE
      WHEN c.duplicate_count > 1
        OR EXISTS (
          SELECT 1 FROM application_users other
          WHERE other.id <> c.id AND LOWER(other.username) = LOWER(c.base_username)
        )
      THEN c.base_username || c.employee_no::text
      ELSE c.base_username
    END AS next_username
  FROM candidates c
)
UPDATE application_users u
SET username = r.next_username,
    updated_at = NOW()
FROM resolved r
WHERE u.id = r.id;
