-- =============================================================================
-- Routes master (delivery routes)
-- =============================================================================

CREATE TABLE IF NOT EXISTS routes (
  id           SERIAL PRIMARY KEY,
  route_no     INTEGER NOT NULL UNIQUE,
  route_name   VARCHAR(150) NOT NULL,
  route_code   VARCHAR(50) NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  status       active_status NOT NULL DEFAULT 'Active',
  created_by   VARCHAR(100),
  updated_by   VARCHAR(100),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_routes_name_unique ON routes (LOWER(route_name));
CREATE INDEX IF NOT EXISTS idx_routes_status ON routes(status);

DROP TRIGGER IF EXISTS trg_routes_updated_at ON routes;
CREATE TRIGGER trg_routes_updated_at
  BEFORE UPDATE ON routes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();