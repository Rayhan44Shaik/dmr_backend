-- 070: Stored copy of the login password for owner reveal.
--
-- The password hash is one-way, so a revealed password can only be shown if
-- the application itself generated it (grant / owner reset). When the user
-- sets their own password the stored copy is cleared — the owner must reset.
-- Owner re-authentication is still required for every reveal, and every
-- reveal is audit-logged.
ALTER TABLE application_users
  ADD COLUMN IF NOT EXISTS reveal_password TEXT;
