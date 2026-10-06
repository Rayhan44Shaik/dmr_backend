-- 060: server-side idle timeout + audit + idempotency hardening.
-- Idle sessions expire after 10 minutes without genuine activity, enforced
-- with server time. last_activity_at advances ONLY via login and the explicit
-- POST /auth/activity endpoint (genuine user interaction). Ordinary reads
-- (/auth/me, polling, health checks) update last_seen_at for observability
-- but NEVER extend the session.

ALTER TABLE application_sessions
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill: existing rows keep their previous liveness signal.
UPDATE application_sessions
  SET last_activity_at = COALESCE(last_seen_at, created_at, NOW())
  WHERE last_activity_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_application_sessions_idle
  ON application_sessions (user_id, last_activity_at)
  WHERE revoked_at IS NULL;

-- Auth audit trail (login / logout / password change / idle expiry).
CREATE TABLE IF NOT EXISTS auth_audit_logs (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT REFERENCES application_users(id) ON DELETE SET NULL,
  username      VARCHAR(100),
  event         VARCHAR(40) NOT NULL
                CHECK (event IN ('login','logout','password_change','idle_expired','revoked')),
  ip            VARCHAR(64),
  request_id    VARCHAR(64),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_user_time
  ON auth_audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_event_time
  ON auth_audit_logs (event, created_at DESC);

-- Generic idempotency keys for mutations. Requests carrying an
-- Idempotency-Key header replay the stored response instead of re-executing.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key         UUID PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES application_users(id) ON DELETE CASCADE,
  route       VARCHAR(200) NOT NULL,
  status      INTEGER NOT NULL,
  body        JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_user_route
  ON idempotency_keys (user_id, route, created_at DESC);
