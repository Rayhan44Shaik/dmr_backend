-- Production RBAC and employee login lifecycle.  OWNER is the protected sixth
-- role; it cannot be assigned through the ordinary access-management API.
DO $$
DECLARE constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'application_users'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%role%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE application_users DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

-- Preserve existing senior-account access while converging on the exact six
-- production roles requested by the business.
UPDATE application_users SET role='FULL_ACCESS' WHERE role='SENIOR_ACCOUNT';

ALTER TABLE application_users
  ADD CONSTRAINT application_users_role_check
    CHECK (role IN ('OWNER','FULL_ACCESS','AUDIT','OFFICE','COLLECTION','SUPERVISOR')),
  ADD COLUMN IF NOT EXISTS access_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (access_status IN ('NOT_GRANTED','ACTIVE','PAUSED','REVOKED')),
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_password_reset_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS access_granted_by BIGINT REFERENCES application_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS access_granted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_access_change_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS access_security_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES application_users(id) ON DELETE SET NULL,
  actor_user_id BIGINT REFERENCES application_users(id) ON DELETE SET NULL,
  event VARCHAR(60) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_access_security_events_user_time
  ON access_security_events(user_id, created_at DESC);

-- Existing accounts remain usable during migration; new accounts are created
-- only by the controlled owner workflow.
UPDATE application_users SET access_status='ACTIVE' WHERE active=TRUE;
UPDATE application_users SET access_status='REVOKED' WHERE active=FALSE;
