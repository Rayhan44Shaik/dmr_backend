-- =============================================================================
-- Operations enums (Phase 2)
-- Extend trip statuses and introduce shared ops record status.
-- =============================================================================

-- Trip workflow statuses (keep legacy Pending / Completed for compatibility)
ALTER TYPE trip_status ADD VALUE IF NOT EXISTS 'Pending Approval';
ALTER TYPE trip_status ADD VALUE IF NOT EXISTS 'Approved';
ALTER TYPE trip_status ADD VALUE IF NOT EXISTS 'Cancelled';
ALTER TYPE trip_status ADD VALUE IF NOT EXISTS 'Rejected';

-- Shared approval workflow for Operations modules
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ops_record_status') THEN
    CREATE TYPE ops_record_status AS ENUM (
      'Draft',
      'Pending Approval',
      'Approved',
      'Rejected',
      'Deleted'
    );
  END IF;
END $$;
