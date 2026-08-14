-- =============================================================================
-- Fleet module — Vehicle Permit / Document expiry (Fleet → Permits)
--
-- Replaces the localStorage-backed "Permits" tab with real PostgreSQL storage.
-- Tracks the five document types shown in the Permits matrix — insurance,
-- fitness, permit, puc and rc — with one CURRENT record per (vehicle, doc_type).
--
-- 1. ONE active row per (vehicle_id, doc_type): a vehicle has a single current
--    insurance / fitness / permit / PUC / RC record. Editing an existing expiry
--    date updates the same row (upsert); the UI never needs history here.
--
-- 2. Optional document scan: the binary (PNG / JPG / PDF) is stored as BYTEA.
--    If no scan is attached, file_* columns stay NULL — dates/numbers are the
--    mandatory part, uploads are optional.
--
-- 3. ON DELETE CASCADE keeps the record physically tied to the vehicle master.
-- =============================================================================

CREATE TABLE IF NOT EXISTS vehicle_permit_documents (
  id              SERIAL PRIMARY KEY,
  vehicle_id      INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  doc_type        VARCHAR(20) NOT NULL,
  document_number VARCHAR(100) NOT NULL DEFAULT '',
  valid_from      DATE,
  expiry_date     DATE NOT NULL,
  file_name       VARCHAR(255),
  mime_type       VARCHAR(100),
  file_size       INTEGER,
  file_data       BYTEA,
  remarks         TEXT,
  created_by      VARCHAR(200) NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_vehicle_permit_doc_type
    CHECK (doc_type IN ('insurance', 'fitness', 'permit', 'puc', 'rc')),
  CONSTRAINT uq_vehicle_permit_doc_type UNIQUE (vehicle_id, doc_type)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_permit_documents_expiry
  ON vehicle_permit_documents (expiry_date);
CREATE INDEX IF NOT EXISTS idx_vehicle_permit_documents_type
  ON vehicle_permit_documents (doc_type);

-- updated_at trigger (set_updated_at is defined in 001_init_schema.sql)
DROP TRIGGER IF EXISTS trg_vehicle_permit_documents_updated_at ON vehicle_permit_documents;
CREATE TRIGGER trg_vehicle_permit_documents_updated_at
  BEFORE UPDATE ON vehicle_permit_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
