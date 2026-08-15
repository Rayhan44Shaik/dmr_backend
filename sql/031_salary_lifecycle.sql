-- =============================================================================
-- 031_salary_lifecycle.sql
-- Salary Register (Staff) lifecycle hardening — additive, idempotent.
--
-- Extends 030_salary_hardening.sql with an explicit, database-enforced salary
-- lifecycle so the backend (not just the UI) is the authority on what may be
-- edited and when:
--
--   Draft (Pending)  -> editable
--   Submitted        -> frozen (no normal editing); can be paid or un-submitted
--   Paid             -> frozen; a 7 calendar-day correction window starts from
--                       paid_at during which Mark-Unpaid (Paid -> Pending) is
--                       the ONLY lifecycle operation available. After the
--                       window expires the record is permanently locked.
--
-- Enforcement model:
--   1. salary_status enum gains 'Submitted'.
--   2. submitted_at / submitted_by audit columns on salary_records.
--   3. A BEFORE UPDATE trigger (guard_salary_lifecycle) rejects every UPDATE
--      on a non-Pending row that is not one of the legal lifecycle
--      transitions. Plain edits, timestamp-only touches, and any attempt to
--      drift the payment linkage off a locked row are impossible at the DB
--      level, regardless of what the service or a caller does. The trigger is
--      a safety net; services still return clean 409/422 AppErrors first.
-- =============================================================================

-- 1) Draft -> Submitted -> Paid lifecycle state.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum
                 WHERE enumtypid = 'salary_status'::regtype AND enumlabel = 'Submitted') THEN
    ALTER TYPE salary_status ADD VALUE 'Submitted';
  END IF;
END $$;

-- 2) Submission audit (when the month/salary was frozen for processing).
ALTER TABLE salary_records ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE salary_records ADD COLUMN IF NOT EXISTS submitted_by VARCHAR(200);

-- 3) DB-level lifecycle guard. Only these mutations survive on a
--    non-Pending salary row:
--      * Submitted -> Pending   (un-submit correction)
--      * Submitted -> Paid      (payment op only; requires payment_ref)
--      * Pending   -> Paid      (payment op only; requires payment_ref)
--      * Paid      -> Pending   (Mark-Unpaid; only inside the 7-day correction
--                                window computed from paid_at; must clear the
--                                payment linkage)
--    Everything else on a non-Pending row raises and aborts the UPDATE.
CREATE OR REPLACE FUNCTION guard_salary_lifecycle()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status <> NEW.status THEN
    IF OLD.status = 'Pending' AND NEW.status = 'Submitted' THEN
      RETURN NEW;
    END IF;
    IF OLD.status = 'Submitted' AND NEW.status = 'Pending' THEN
      RETURN NEW;
    END IF;
    IF NEW.status = 'Paid' THEN
      IF (OLD.status IN ('Pending', 'Submitted')) AND NEW.payment_ref IS NOT NULL THEN
        RETURN NEW;
      END IF;
    END IF;
    IF OLD.status = 'Paid' AND NEW.status = 'Pending' THEN
      -- Correction window: exactly 7 calendar days from the paid timestamp.
      IF (OLD.paid_at IS NULL) OR (OLD.paid_at + INTERVAL '7 days' < NOW()) THEN
        RAISE EXCEPTION 'Salary correction window has expired; the record is permanently locked.';
      END IF;
      -- Reverting must clear the payment linkage (see 030 checks).
      IF NEW.payment_ref IS NOT NULL OR NEW.paid_at IS NOT NULL THEN
        RAISE EXCEPTION 'Mark-Unpaid must clear payment_ref and paid_at.';
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Illegal salary status transition % -> %', OLD.status, NEW.status;
  END IF;

  -- No status change: non-Pending rows are immutable (money, deductions,
  -- payment and audit fields alike).
  IF OLD.status <> 'Pending' THEN
    RAISE EXCEPTION 'Salary record is % and cannot be modified.', OLD.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_salary_lifecycle ON salary_records;
CREATE TRIGGER trg_salary_lifecycle
  BEFORE UPDATE ON salary_records
  FOR EACH ROW EXECUTE FUNCTION guard_salary_lifecycle();