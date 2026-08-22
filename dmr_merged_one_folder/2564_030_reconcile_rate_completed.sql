-- =============================================================================
-- Reconcile trips.rate_completed with rate_entry.locked
--
-- Two independent "is this trip's rate finished" signals existed:
--   - rate_entry.locked   (authoritative — Rate Entry/Shop Sales gate on this)
--   - trips.rate_completed (legacy column, previously writable independently
--     by collectionsService.ts and the generic trip save endpoint, with no
--     relation to Rate Entry at all)
--
-- As of this migration, trips.rate_completed is a read-only cache written
-- ONLY by rateEntryService.lock() (application code), in the same
-- transaction as rate_entry.locked = TRUE. collectionsService.ts and
-- tripsService.save() no longer write it. dashboardService.ts and
-- collectionsService.ts now also read rate_entry.locked directly (via JOIN)
-- rather than trusting this cache column, so there is no reliance on it
-- staying in sync — but it is corrected here regardless for any other
-- consumer, and to remove any stale TRUE values that were set by the old,
-- now-removed Collections bypass without a trip ever actually being
-- through Rate Entry.
-- =============================================================================

UPDATE trips t
   SET rate_completed = TRUE
  FROM rate_entry re
 WHERE re.trip_id = t.id
   AND re.locked = TRUE
   AND t.rate_completed = FALSE;

UPDATE trips t
   SET rate_completed = FALSE
 WHERE t.rate_completed = TRUE
   AND NOT EXISTS (
     SELECT 1 FROM rate_entry re WHERE re.trip_id = t.id AND re.locked = TRUE
   );
