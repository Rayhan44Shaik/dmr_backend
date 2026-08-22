-- =============================================================================
-- Fleet module — Maintenance bill / spare-part documents
--
-- Every Fleet Maintenance Entry must have at least one bill/spare-part document
-- attached (PNG / JPG / PDF). The binary contents are stored in PostgreSQL as
-- BYTEA — NOT inside the existing fleet_maintenance.parts JSONB column.
--
-- ON DELETE CASCADE: documents physically follow the maintenance row. In
-- practice the module uses soft delete for fleet_maintenance, so documents
-- stay associated with the historical record until the maintenance row is
-- hard-deleted.
-- =============================================================================

CREATE TABLE IF NOT EXISTS fleet_maintenance_documents (
  id             SERIAL PRIMARY KEY,
  maintenance_id INTEGER NOT NULL REFERENCES fleet_maintenance(id) ON DELETE CASCADE,
  file_name      VARCHAR(255) NOT NULL,
  mime_type      VARCHAR(100) NOT NULL,
  file_size      INTEGER NOT NULL DEFAULT 0,
  file_data      BYTEA NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fleet_maintenance_documents_maintenance
  ON fleet_maintenance_documents (maintenance_id);
