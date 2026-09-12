-- Application identity is separate from operational employees.
CREATE TABLE IF NOT EXISTS application_users (
  id              BIGSERIAL PRIMARY KEY,
  username        VARCHAR(100) NOT NULL,
  display_name    VARCHAR(200) NOT NULL,
  password_hash   TEXT NOT NULL,
  role            VARCHAR(30) NOT NULL CHECK (role IN ('OWNER','SENIOR_ACCOUNT','SUPERVISOR')),
  employee_id     INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at   TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_application_users_username_lower
  ON application_users (LOWER(username));
CREATE UNIQUE INDEX IF NOT EXISTS uq_application_users_employee
  ON application_users (employee_id) WHERE employee_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS application_sessions (
  id              UUID PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES application_users(id) ON DELETE CASCADE,
  token_hash      CHAR(64) NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_application_sessions_active
  ON application_sessions (token_hash, expires_at) WHERE revoked_at IS NULL;

ALTER TABLE trips ADD COLUMN IF NOT EXISTS created_by_user_id BIGINT REFERENCES application_users(id) ON DELETE SET NULL;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS updated_by_user_id BIGINT REFERENCES application_users(id) ON DELETE SET NULL;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS submitted_by_user_id BIGINT REFERENCES application_users(id) ON DELETE SET NULL;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS approved_by_user_id BIGINT REFERENCES application_users(id) ON DELETE SET NULL;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS deleted_by_user_id BIGINT REFERENCES application_users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_trips_supervisor_active ON trips (supervisor_id, id) WHERE deleted = FALSE;

