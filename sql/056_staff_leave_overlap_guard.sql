-- 056_staff_leave_overlap_guard.sql
-- P2: DB-level overlapping-leave guard (defense in depth behind the
-- transactional service check in staffService.createLeave).
--
-- A direct privileged DB writer bypasses application code, so the database
-- itself must reject an overlapping Pending/Approved leave range for the same
-- employee. Implemented as a trigger (not an exclusion constraint) so it runs
-- on stock PostgreSQL and PGlite with no extra extensions.
--
-- Overlap rule mirrors the service: a new/updated row with status
-- Pending/Approved overlaps when another row for the same employee with
-- status Pending/Approved satisfies from_date <= NEW.to_date AND
-- to_date >= NEW.from_date. Violations raise SQLSTATE 23P01
-- (exclusion_violation), mapped to HTTP 409 by mapPgError.

CREATE OR REPLACE FUNCTION trg_leave_no_overlap_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('Pending', 'Approved') THEN
    IF EXISTS (
      SELECT 1 FROM leave_requests lr
      WHERE lr.employee_id = NEW.employee_id
        AND lr.id <> NEW.id
        AND lr.status IN ('Pending', 'Approved')
        AND lr.from_date <= NEW.to_date
        AND lr.to_date >= NEW.from_date
    ) THEN
      RAISE EXCEPTION 'Overlapping pending or approved leave already exists for this employee (%)', NEW.employee_id
        USING ERRCODE = '23P01';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leave_no_overlap ON leave_requests;
CREATE TRIGGER trg_leave_no_overlap
  BEFORE INSERT OR UPDATE OF employee_id, from_date, to_date, status ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION trg_leave_no_overlap_fn();
