-- Leave lifecycle and integrity hardening.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'Cancelled' AND enumtypid = 'leave_status'::regtype
  ) THEN
    ALTER TYPE leave_status ADD VALUE 'Cancelled';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_days_positive') THEN
    ALTER TABLE leave_requests ADD CONSTRAINT leave_days_positive CHECK (days > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leave_employee_dates_status
  ON leave_requests (employee_id, from_date, to_date, status);
