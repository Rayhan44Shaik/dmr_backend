-- =============================================================================
-- Fleet module — Vehicle EMIs (Fleet → EMI)
--
-- Replaces the localStorage-backed "EMI" tab ("dmr-vehicle-emi") with real
-- PostgreSQL storage while keeping the EXACT contract the existing EMI page
-- drives:
--
--   EMI record per vehicle   -> id, vehicleId, financeCompany, loanAmount,
--                               emiAmount, startDate, endDate, nextEMIDate,
--                               status (active|paid|overdue), paidEMIs,
--                               totalEMIs, pendingEMIs
--
-- The EMI page is a PER-VEHICLE summary table. It joins the Vehicle Master
-- (vehicles.id) for the registration number — no duplicate vehicle master is
-- ever created. The vehicle fixture only carries finance metadata; the actual
-- vehicle number shown in the EMI table is resolved from `vehicles` on every
-- read.
--
-- 1. vehicle_emis — ONE active EMI record per vehicle (unique vehicle_id).
--    End-date / emi-amount / schedule are DERIVED from loan_amount, total_emis
--    and start_date using the SAME flat-principal formula the existing page
--    already displays (emiAmount = round(loanAmount / totalEMIs)), so the
--    backend never silently changes existing numbers.
--
-- 2. vehicle_emi_installments — the persisted schedule. One row per monthly
--    installment (due on emi_day of each month, matching the page's
--    "next occurrence of emiDay" behaviour). The row set is the single source
--    of truth for paidEMIs / pendingEMIs / nextEMIDate / status:
--      paid_emis      = COUNT(installments WHERE status = 'paid')
--      next_emi_date  = MIN(due_date WHERE status = 'pending')   (NULL when done)
--      status         = 'paid' when nothing pending, else 'overdue' when the
--                       next pending due date is in the past, else 'active'.
--    These aggregates are recomputed transactionally after every create /
--    update / payment so the API response can never disagree with the schedule.
--
-- 3. Money is stored as NUMERIC (never float). Dates that are date-only are
--    stored as DATE. Audit timestamps use TIMESTAMPTZ.
--
-- ON DELETE CASCADE keeps installments physically tied to their EMI record,
-- and the EMI record tied to the Vehicle Master.
-- =============================================================================

CREATE TABLE IF NOT EXISTS vehicle_emis (
  id              SERIAL PRIMARY KEY,
  vehicle_id      INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  finance_company VARCHAR(200) NOT NULL DEFAULT '',
  loan_amount     NUMERIC(16, 2) NOT NULL,
  emi_amount      NUMERIC(16, 2) NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  total_emis      INTEGER NOT NULL,
  paid_emis       INTEGER NOT NULL DEFAULT 0,
  next_emi_date   DATE,
  status          VARCHAR(10) NOT NULL DEFAULT 'active',
  created_by      VARCHAR(200) NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_vehicle_emis_vehicle UNIQUE (vehicle_id),
  CONSTRAINT chk_vehicle_emis_total CHECK (total_emis > 0),
  CONSTRAINT chk_vehicle_emis_paid CHECK (paid_emis >= 0 AND paid_emis <= total_emis),
  CONSTRAINT chk_vehicle_emis_amounts CHECK (loan_amount >= 0 AND emi_amount >= 0),
  CONSTRAINT chk_vehicle_emis_status CHECK (status IN ('active', 'paid', 'overdue'))
);

CREATE TABLE IF NOT EXISTS vehicle_emi_installments (
  id              SERIAL PRIMARY KEY,
  vehicle_emi_id  INTEGER NOT NULL REFERENCES vehicle_emis(id) ON DELETE CASCADE,
  installment_no  INTEGER NOT NULL,
  due_date        DATE NOT NULL,
  amount          NUMERIC(16, 2) NOT NULL,
  status          VARCHAR(10) NOT NULL DEFAULT 'pending',
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_vehicle_emi_installment_no UNIQUE (vehicle_emi_id, installment_no),
  CONSTRAINT chk_vehicle_emi_installment_status CHECK (status IN ('pending', 'paid')),
  CONSTRAINT chk_vehicle_emi_installment_amount CHECK (amount >= 0)
);

-- EMI record lookups by vehicle / upcoming-due / status (drives the EMI table
-- and the upcoming-EMI list sorted by next due date).
CREATE INDEX IF NOT EXISTS idx_vehicle_emis_next_emi_date ON vehicle_emis (next_emi_date);
CREATE INDEX IF NOT EXISTS idx_vehicle_emis_status ON vehicle_emis (status);

-- Schedule lookups by EMI record and by due date.
CREATE INDEX IF NOT EXISTS idx_vehicle_emi_installments_emi
  ON vehicle_emi_installments (vehicle_emi_id, installment_no);
CREATE INDEX IF NOT EXISTS idx_vehicle_emi_installments_due_date
  ON vehicle_emi_installments (due_date);

-- Recompute aggregates whenever a schedule row (or its record) changes.
CREATE OR REPLACE FUNCTION recompute_vehicle_emi(emi_id INTEGER)
RETURNS void AS $$
DECLARE
  total_count INTEGER;
  paid_count  INTEGER;
  next_due    DATE;
BEGIN
  SELECT total_emis INTO total_count FROM vehicle_emis WHERE id = emi_id;

  SELECT COUNT(*) FILTER (WHERE status = 'paid'),
         MIN(due_date) FILTER (WHERE status = 'pending')
    INTO paid_count, next_due
  FROM vehicle_emi_installments
  WHERE vehicle_emi_id = emi_id;

  UPDATE vehicle_emis
     SET paid_emis      = paid_count,
         next_emi_date  = next_due,
         status         = CASE
                            WHEN paid_count >= total_count THEN 'paid'
                            WHEN next_due IS NOT NULL AND next_due < CURRENT_DATE THEN 'overdue'
                            ELSE 'active'
                          END
   WHERE id = emi_id;
END;
$$ LANGUAGE plpgsql;

-- updated_at triggers (set_updated_at is defined in 001_init_schema.sql)
DROP TRIGGER IF EXISTS trg_vehicle_emis_updated_at ON vehicle_emis;
CREATE TRIGGER trg_vehicle_emis_updated_at
  BEFORE UPDATE ON vehicle_emis
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_vehicle_emi_installments_updated_at ON vehicle_emi_installments;
CREATE TRIGGER trg_vehicle_emi_installments_updated_at
  BEFORE UPDATE ON vehicle_emi_installments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();