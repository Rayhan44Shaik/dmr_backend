-- =============================================================================
-- 030_salary_hardening.sql
-- Salary Register (Staff) backend hardening — additive, idempotent.
--
-- The existing salary_records table (see 001_init_schema.sql + 002_indexes.sql)
-- remains the single payroll table. No duplicate table is created. This
-- migration only:
--
--   1. adds payment_ref + paid_at so a Salary → Accounts payment can be
--      recorded and audited, WITHOUT a separate payments-link table;
--   2. enforces payment_ref uniqueness at the DB level (partial index so many
--      Pending rows may legally be NULL) — the final guard against duplicate
--      salary payments;
--   3. adds CHECK constraints that make the salary lifecycle database-safe:
--      money columns are never negative, net salary is never negative, a Paid
--      record always carries a payment_ref, and a payment_ref can only exist
--      once the record is Paid;
--   4. validates month format (YYYY-MM) at the DB level.
--
-- All statements are additive / idempotent and preserve existing rows. With a
-- single employee_id+month record (UNIQUE(employee_id, month) from 001) and a
-- payment that is only ever committed inside the same transaction as the
-- Pending→Paid transition, duplicate payments are impossible.
-- =============================================================================

-- 1) Payment linkage + audit columns (NULL for Pending / never-paid records).
ALTER TABLE salary_records ADD COLUMN IF NOT EXISTS payment_ref VARCHAR(64);
ALTER TABLE salary_records ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- 2) Database-level uniqueness of the payment reference. Partial — many rows
--    may be NULL, but no two paid rows can ever share a reference.
CREATE UNIQUE INDEX IF NOT EXISTS uq_salary_payment_ref
  ON salary_records (payment_ref)
  WHERE payment_ref IS NOT NULL;

-- 3) Money invariants (NUMERIC, never negative; net can never go below zero).
DO $$
BEGIN
  ALTER TABLE salary_records
    ADD CONSTRAINT chk_salary_money_non_negative
    CHECK (
      basic_salary       >= 0 AND overtime     >= 0 AND incentives >= 0 AND
      fuel_allowance     >= 0 AND night_allowance >= 0 AND
      leave_deduction    >= 0 AND advance_recovery >= 0 AND loan_emi >= 0 AND
      late_penalty       >= 0 AND other_deductions >= 0 AND
      total_gross        >= 0 AND total_deductions >= 0 AND net_salary >= 0
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4) Lifecycle invariants: a Paid record must reference a payment; a payment
--    reference implies the record is Paid. Together these make it impossible
--    to have a Paid salary without an Accounts payment (and vice versa).
DO $$
BEGIN
  ALTER TABLE salary_records
    ADD CONSTRAINT chk_salary_paid_has_ref
    CHECK ((status <> 'Paid') OR (payment_ref IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE salary_records
    ADD CONSTRAINT chk_salary_ref_implies_paid
    CHECK ((payment_ref IS NULL) OR (status = 'Paid'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5) month format guard (YYYY-MM).
DO $$
BEGIN
  ALTER TABLE salary_records
    ADD CONSTRAINT chk_salary_month_format
    CHECK (month ~ '^\d{4}-\d{2}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;