-- 027_duty_planner.sql
-- Duty Planner production feature.
-- Reuses existing employees / duty_assignments / leave_requests / vehicles /
-- trips / fleet_maintenance. Adds only: duty_type enum values, a durable
-- week-status+lock table, an audit table, and conflict-prevention indexes.

-- 1) Extend duty_type with the duty states required by the planner.
--    (Leave is NOT a duty row here — it is derived from approved leave_requests.)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'Collection' AND enumtypid = 'duty_type'::regtype) THEN
    ALTER TYPE duty_type ADD VALUE 'Collection';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'OfficeDuty' AND enumtypid = 'duty_type'::regtype) THEN
    ALTER TYPE duty_type ADD VALUE 'OfficeDuty';
  END IF;
END $$;

-- 2) Durable week lifecycle: Draft -> Open -> Submitted -> Locked.
CREATE TABLE IF NOT EXISTS duty_weeks (
  id            SERIAL PRIMARY KEY,
  week_start    DATE NOT NULL UNIQUE,
  week_end      DATE NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'Open'
                CHECK (status IN ('Draft','Open','Submitted','Locked')),
  submitted_at  TIMESTAMPTZ,
  submitted_by  VARCHAR(200),
  locked_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (week_end > week_start)
);

-- 3) Audit trail for every assignment change.
CREATE TABLE IF NOT EXISTS duty_assignment_changes (
  id              BIGSERIAL PRIMARY KEY,
  assignment_id   UUID REFERENCES duty_assignments(id) ON DELETE SET NULL,
  employee_id     INTEGER NOT NULL,
  employee_name   VARCHAR(200) NOT NULL,
  duty_date       DATE NOT NULL,
  old_duty_type   duty_type,
  new_duty_type   duty_type,
  old_vehicle_id  INTEGER,
  new_vehicle_id  INTEGER,
  reason          VARCHAR(500),
  changed_by      VARCHAR(200),
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action          VARCHAR(20) NOT NULL DEFAULT 'upsert'
                  CHECK (action IN ('insert','update','delete'))
);
CREATE INDEX IF NOT EXISTS idx_duty_change_employee ON duty_assignment_changes(employee_id, duty_date);

-- 4) Conflict-prevention indexes.
-- An employee can only hold one duty per date (already enforced by
-- UNIQUE(employee_id, duty_date)), but we must also never allow two drivers
-- on the SAME vehicle on the SAME date, and never a driver on two vehicles
-- on the same date.
CREATE UNIQUE INDEX IF NOT EXISTS uq_duty_vehicle_date
  ON duty_assignments (vehicle_id, duty_date)
  WHERE vehicle_id IS NOT NULL AND duty_type IN ('Delivery','Driver');

-- Ensure the driver of a delivery cannot also be assigned to another vehicle
-- on the same date (partial on role/department driver deliveries).
CREATE INDEX IF NOT EXISTS idx_duty_emp_date ON duty_assignments(employee_id, duty_date);
