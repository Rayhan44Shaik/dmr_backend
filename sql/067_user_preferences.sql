-- 067: Per-user application preferences.
--
-- Language and theme used to live only in browser localStorage, so a user who
-- switched device (or cleared storage) silently lost their choices, and the
-- Settings page had nothing server-side to reconcile against. One row per
-- application user holds them; absence of a row means "never chosen", which
-- lets the client adopt its locally stored value on first load instead of
-- being reset to the defaults.
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id    BIGINT PRIMARY KEY REFERENCES application_users(id) ON DELETE CASCADE,
  language   VARCHAR(8) NOT NULL DEFAULT 'en'
    CHECK (language IN ('en','te')),
  theme      VARCHAR(8) NOT NULL DEFAULT 'light'
    CHECK (theme IN ('light','dark')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
