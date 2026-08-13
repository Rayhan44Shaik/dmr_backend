-- =============================================================================
-- Fleet module — Vehicle Maintenance Entries (Fleet → Entry / History)
--
-- Backs the Fleet "Entry" + "History" tabs with real PostgreSQL storage.
-- Reuses the existing Vehicle Master (vehicles.id) and Employee/Staff master
-- (employees.id) via foreign keys — no duplicate masters are created.
--
-- Independent from Operations → Vehicle Trips: a maintenance entry is not a
-- trip. No trip reference is stored here, preserving the current Fleet module
-- architecture. Operations → Trips is untouched.
--
-- The status column reuses the existing ops_record_status enum shared by the
-- Operations module (Draft / Pending Approval / Approved / Rejected / Deleted).
-- =============================================================================

CREATE TABLE IF NOT EXISTS fleet_maintenance (
  id               SERIAL PRIMARY KEY,
  bill_no          VARCHAR(40) NOT NULL UNIQUE,
  maintenance_date DATE NOT NULL,
  vehicle_id       INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  vehicle_no       VARCHAR(50) NOT NULL DEFAULT '',
  driver_id        INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  driver_name      VARCHAR(200) NOT NULL DEFAULT '',
  current_km       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  next_service_km  NUMERIC(12, 2),
  maintenance_type TEXT NOT NULL DEFAULT '',
  service_type     VARCHAR(200) NOT NULL DEFAULT '',
  garage           VARCHAR(200) NOT NULL DEFAULT '',
  mechanic         VARCHAR(200) NOT NULL DEFAULT '',
  total_cost       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  parts            JSONB NOT NULL DEFAULT '[]'::jsonb,
  remarks          TEXT,
  status           ops_record_status NOT NULL DEFAULT 'Pending Approval',
  deleted          BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_reason   TEXT,
  approved_by      VARCHAR(200),
  approved_at      TIMESTAMPTZ,
  rejected_by      VARCHAR(200),
  rejected_at      TIMESTAMPTZ,
  rejected_reason  TEXT,
  created_by       VARCHAR(200) NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fleet_maintenance_date ON fleet_maintenance (maintenance_date DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_maintenance_vehicle ON fleet_maintenance (vehicle_id, maintenance_date DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_maintenance_driver ON fleet_maintenance (driver_id);
CREATE INDEX IF NOT EXISTS idx_fleet_maintenance_status ON fleet_maintenance (status);
CREATE INDEX IF NOT EXISTS idx_fleet_maintenance_deleted ON fleet_maintenance (deleted);

-- updated_at trigger (set_updated_at is defined in 001_init_schema.sql)
DROP TRIGGER IF EXISTS trg_fleet_maintenance_updated_at ON fleet_maintenance;
CREATE TRIGGER trg_fleet_maintenance_updated_at
  BEFORE UPDATE ON fleet_maintenance
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
