-- =============================================================================
-- 040 Shop Master — email field
--
-- Application rule: Email ID is REQUIRED on Shop create, update, and bulk import.
--
-- Column remains nullable because existing shop rows have no email and this
-- migration must not invent/fake addresses or delete/overwrite those shops.
-- SET NOT NULL is blocked until every existing shop has a real email entered
-- through Shop Edit (or a later data-cleanup that uses real addresses).
-- =============================================================================

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS email VARCHAR(200);
