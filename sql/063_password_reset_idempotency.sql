-- 063: password reset, shared login throttle, idempotency store, session version.
--
-- Password reset uses single-use, short-lived, hashed tokens. There is no
-- email/SMS delivery channel in this deployment yet: in non-production the
-- token is returned to the operator for out-of-band relay; production never
-- returns it (delivery must be configured before enabling self-service).
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id            UUID PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES application_users(id) ON DELETE CASCADE,
  token_hash    CHAR(64) NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
  ON password_reset_tokens (user_id, created_at DESC);

-- Shared (multi-instance safe) login throttle. Replaces the previous
-- in-memory-only map as the primary store; the application keeps the memory
-- map as a fallback when the database is unreachable (fail-open for
-- availability: a down database must not lock everyone out).
CREATE TABLE IF NOT EXISTS login_rate_limits (
  key           TEXT PRIMARY KEY,
  count         INTEGER NOT NULL DEFAULT 0,
  reset_at      TIMESTAMPTZ NOT NULL
);

-- Generic idempotency store for mutation replay.
-- Same key + same request hash  -> replay the stored response (no duplicate).
-- Same key + different hash      -> 409 conflict (client must use a new key).
-- (060 created the base table; these columns complete the replay contract.)
ALTER TABLE idempotency_keys
  ADD COLUMN IF NOT EXISTS request_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS headers JSONB NOT NULL DEFAULT '{}'::jsonb;
-- Backfill marker for rows predating the hash contract (never match).
UPDATE idempotency_keys SET request_hash = '' WHERE request_hash IS NULL;
ALTER TABLE idempotency_keys ALTER COLUMN request_hash SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_user_route
  ON idempotency_keys (user_id, route, created_at DESC);

-- Session version for rotation readiness (PDF 7.2). Current rotation policy:
-- version is 1 for the session lifetime; password change/reset revokes all
-- sessions instead of rotating. The column lets future rotation detect
-- stale clients without a schema change.
ALTER TABLE application_sessions
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
