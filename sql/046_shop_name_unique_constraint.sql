-- =============================================================================
-- 046 Shop Master — Add Unique Constraint on shop_name
--
-- Ensures shop names are unique (case-insensitive) at the database level.
-- Checks for existing duplicates before creating the constraint.
-- =============================================================================

-- First, check for existing duplicate shop names (case-insensitive)
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT LOWER(shop_name) as name_lower, COUNT(*) as cnt
    FROM shops
    GROUP BY LOWER(shop_name)
    HAVING COUNT(*) > 1
  ) dups;
  
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Cannot create unique constraint: % duplicate shop name(s) found. Please resolve duplicates first.', dup_count;
  END IF;
END $$;

-- Create unique index on shop_name (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_shop_name_unique ON shops(LOWER(shop_name));

-- Add check constraint for association_type (must be one of the 4 allowed values)
ALTER TABLE shops
  ADD CONSTRAINT chk_shops_association_type
  CHECK (association_type IN ('Vencob Vij', 'Vencob Gun', 'Ass Vij', 'Ass Gun'));