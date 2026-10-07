-- Complete access/security audit vocabulary and employee status history.
ALTER TABLE auth_audit_logs DROP CONSTRAINT IF EXISTS auth_audit_logs_event_check;
ALTER TABLE auth_audit_logs
  ADD COLUMN IF NOT EXISTS result VARCHAR(20),
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS session_id UUID,
  ADD CONSTRAINT auth_audit_logs_event_check CHECK (event IN (
    'login','login_failure','logout','password_change','password_reset_request','password_reset',
    'idle_expired','revoked','session_invalidated',
    'mfa_enrolled','mfa_verified','mfa_disabled','mfa_reset'
  ));

ALTER TABLE access_security_events
  ADD COLUMN IF NOT EXISTS request_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS ip VARCHAR(64);

CREATE OR REPLACE FUNCTION audit_employee_status_change() RETURNS trigger AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO access_security_events(user_id,actor_user_id,event,details)
    SELECT u.id,NULL,
      CASE WHEN NEW.status='Active' THEN 'EMPLOYEE_ACTIVATED' ELSE 'EMPLOYEE_DEACTIVATED' END,
      jsonb_build_object('previousState',OLD.status,'newState',NEW.status,'employeeId',NEW.id)
    FROM application_users u WHERE u.employee_id=NEW.id;
    IF NEW.status <> 'Active' THEN
      UPDATE application_sessions s SET revoked_at=COALESCE(s.revoked_at,NOW())
      FROM application_users u WHERE u.employee_id=NEW.id AND s.user_id=u.id AND s.revoked_at IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_audit_employee_status ON employees;
CREATE TRIGGER trg_audit_employee_status AFTER UPDATE OF status ON employees
FOR EACH ROW EXECUTE FUNCTION audit_employee_status_change();

