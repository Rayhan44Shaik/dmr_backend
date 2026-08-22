-- =============================================================================
-- Market Rate master — one record per business date
--   business_date  UNIQUE  -> one calendar date = one market rate record
--   vij / gun / rp         -> Additional Metrics
--   sneha / vencob_rate / vencob_vii / vencob_gun / association_vii
--                           -> Company Rates
--   c17 / c15 / c13 / c12 / c10 -> Size Categories
-- =============================================================================

CREATE TABLE IF NOT EXISTS market_rates (
  id              SERIAL PRIMARY KEY,
  business_date   DATE NOT NULL UNIQUE,
  vij             NUMERIC(12,2) NOT NULL DEFAULT 0,
  gun             NUMERIC(12,2) NOT NULL DEFAULT 0,
  rp              NUMERIC(12,2) NOT NULL DEFAULT 0,
  sneha           NUMERIC(12,2) NOT NULL DEFAULT 0,
  vencob_rate     NUMERIC(12,2) NOT NULL DEFAULT 0,
  vencob_vii      NUMERIC(12,2) NOT NULL DEFAULT 0,
  vencob_gun      NUMERIC(12,2) NOT NULL DEFAULT 0,
  association_vii NUMERIC(12,2) NOT NULL DEFAULT 0,
  c17             NUMERIC(12,2) NOT NULL DEFAULT 0,
  c15             NUMERIC(12,2) NOT NULL DEFAULT 0,
  c13             NUMERIC(12,2) NOT NULL DEFAULT 0,
  c12             NUMERIC(12,2) NOT NULL DEFAULT 0,
  c10             NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by      VARCHAR(100),
  updated_by      VARCHAR(100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_market_rates_business_date_unique
  ON market_rates (business_date);
CREATE INDEX IF NOT EXISTS idx_market_rates_business_date_range
  ON market_rates (business_date DESC);

DROP TRIGGER IF EXISTS trg_market_rates_updated_at ON market_rates;
CREATE TRIGGER trg_market_rates_updated_at
  BEFORE UPDATE ON market_rates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
