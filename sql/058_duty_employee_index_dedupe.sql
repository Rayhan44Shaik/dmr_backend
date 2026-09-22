-- 058_duty_employee_index_dedupe.sql
-- P3: drop the redundant single-column duty employee index.
--
-- idx_duty_employee (employee_id) is a strict prefix of idx_duty_emp_date
-- (employee_id, duty_date), and PostgreSQL uses the composite btree for
-- employee-only predicates too. Query-plan evidence (staffQueryPlans test)
-- shows Index Scans via idx_duty_emp_date before this drop. Keeping one index
-- halves write amplification on the duty hot path.

DROP INDEX IF EXISTS idx_duty_employee;
