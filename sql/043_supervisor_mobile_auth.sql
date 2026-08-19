-- Supervisor Mobile auth: individual accounts linked to employees, opaque
-- sessions, idempotent operation acknowledgements, and trip optimistic version.

ALTER TABLE trips ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS mobile_supervisor_accounts (
  id              SERIAL PRIMARY KEY,
  employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  username        VARCHAR(80) NOT NULL,
  password_hash   TEXT NOT NULL,
  status          employee_status NOT NULL DEFAULT 'Active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_mobile_supervisor_accounts_username UNIQUE (username),
  CONSTRAINT uq_mobile_supervisor_accounts_employee UNIQUE (employee_id)
);

CREATE INDEX IF NOT EXISTS idx_mobile_supervisor_accounts_username_lower
  ON mobile_supervisor_accounts (LOWER(username));

CREATE TABLE IF NOT EXISTS mobile_supervisor_sessions (
  id              UUID PRIMARY KEY,
  account_id      INTEGER NOT NULL REFERENCES mobile_supervisor_accounts(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mobile_supervisor_sessions_account
  ON mobile_supervisor_sessions (account_id);

CREATE TABLE IF NOT EXISTS mobile_operations (
  operation_id    VARCHAR(80) PRIMARY KEY,
  account_id      INTEGER NOT NULL REFERENCES mobile_supervisor_accounts(id) ON DELETE CASCADE,
  trip_id         INTEGER REFERENCES trips(id) ON DELETE SET NULL,
  response        JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
