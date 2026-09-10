-- Stable retry identity for maintenance creates. The API serializes requests
-- by this UUID and returns the original row when a client retries.
ALTER TABLE fleet_maintenance
  ADD COLUMN IF NOT EXISTS request_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fleet_maintenance_request_id
  ON fleet_maintenance (request_id)
  WHERE request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS vehicle_emi_payment_requests (
  request_id UUID PRIMARY KEY,
  vehicle_emi_id INTEGER NOT NULL REFERENCES vehicle_emis(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_emi_payment_requests_emi
  ON vehicle_emi_payment_requests (vehicle_emi_id);

ALTER TABLE vehicle_emis
  DROP CONSTRAINT IF EXISTS chk_vehicle_emis_date_range;
ALTER TABLE vehicle_emis
  ADD CONSTRAINT chk_vehicle_emis_date_range CHECK (end_date >= start_date);

ALTER TABLE vehicle_permit_documents
  DROP CONSTRAINT IF EXISTS chk_vehicle_permit_documents_date_range;
ALTER TABLE vehicle_permit_documents
  ADD CONSTRAINT chk_vehicle_permit_documents_date_range
  CHECK (valid_from IS NULL OR valid_from <= expiry_date);
