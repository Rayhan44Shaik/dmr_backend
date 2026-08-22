-- =============================================================================
-- Rate Entry lock state (Trip -> Rate Entry [Save] -> Rate Entry [Lock] -> Shop Sales)
--
-- Today, the mere existence of a rate_entry row is treated as "final": the
-- Rate Entry list already excludes any trip with a row, and Shop Sales
-- already requires one to exist. That conflates "rate saved" with "rate
-- locked" into a single step. This migration adds an explicit lock state so
-- rates can be saved (still visible/editable in Rate Entry) and later
-- locked (explicit action, immutable afterwards, unlocks Shop Sales).
--
-- Backward compatibility: every rate_entry row that already exists was
-- created under the old create-once semantics, where existence already
-- meant "final" (excluded from Rate Entry, already usable by Shop Sales).
-- To avoid silently reopening old trips for editing or breaking Shop Sales
-- for them, existing rows are backfilled to locked = TRUE. New rows
-- inserted by the application going forward explicitly start unlocked
-- (locked = FALSE) until the new, separate lock action is called.
-- =============================================================================

ALTER TABLE rate_entry
  ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS locked_by VARCHAR(200),
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

UPDATE rate_entry
   SET locked = TRUE,
       locked_by = COALESCE(NULLIF(created_by, ''), 'system-migration'),
       locked_at = COALESCE(updated_at, created_at)
 WHERE locked = FALSE;

CREATE INDEX IF NOT EXISTS idx_rate_entry_locked ON rate_entry (locked);
