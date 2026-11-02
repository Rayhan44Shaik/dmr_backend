ALTER TABLE manual_expenses
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- Historical records pre-date the approval workflow and remain final.
UPDATE manual_expenses
SET status = 'Approved', approved_at = COALESCE(approved_at, created_at), approved_by = COALESCE(approved_by, created_by)
WHERE status = 'Pending' AND created_at < NOW() - INTERVAL '1 minute';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'manual_expenses_status_check') THEN
    ALTER TABLE manual_expenses ADD CONSTRAINT manual_expenses_status_check CHECK (status IN ('Pending', 'Approved'));
  END IF;
END $$;
