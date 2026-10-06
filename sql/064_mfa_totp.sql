-- 064: TOTP two-factor authentication.
--
-- MFA factors hold AES-256-GCM encrypted secrets (never plaintext, never
-- returned after provisioning). Tickets are short-lived single-use login
-- challenges; recovery codes are hashed and single-use. Login tickets are
-- NOT sessions: they authorize exactly one /auth/mfa/verify call.
CREATE TABLE IF NOT EXISTS mfa_factors (
  user_id       BIGINT PRIMARY KEY REFERENCES application_users(id) ON DELETE CASCADE,
  secret_enc    TEXT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT FALSE,
  label         VARCHAR(120),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id            UUID PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES application_users(id) ON DELETE CASCADE,
  code_hash     CHAR(64) NOT NULL UNIQUE,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_user
  ON mfa_recovery_codes (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS mfa_tickets (
  ticket_hash   CHAR(64) PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES application_users(id) ON DELETE CASCADE,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mfa_tickets_user
  ON mfa_tickets (user_id, created_at DESC);

-- Widen the audit event vocabulary: 062's CHECK predates reset/MFA rows, and
-- the service writes fire-and-forget, so unknown events were silently lost.
-- (Found by inspection: password_reset_* rows never persisted under 062.)
ALTER TABLE auth_audit_logs DROP CONSTRAINT IF EXISTS auth_audit_logs_event_check;
ALTER TABLE auth_audit_logs
  ADD CONSTRAINT auth_audit_logs_event_check CHECK (event IN (
    'login','logout','password_change','password_reset_request','password_reset',
    'idle_expired','revoked',
    'mfa_enrolled','mfa_verified','mfa_disabled','mfa_reset'
  ));
