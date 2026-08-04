-- =============================================================================
-- Operations schema (Phase 2)
-- Shop rates/sales, collections, fuel enhancements, trip farm/expense fields
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Trips — farm loading + named expenses + approval audit
-- ---------------------------------------------------------------------------
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS farm_bird_type_id INTEGER REFERENCES bird_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS farm_bird_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS farm_bird_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS farm_load_weight NUMERIC(12, 3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS farm_rate NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS farm_amount NUMERIC(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS driver_bata NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS helper_bata NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_trip_expense NUMERIC(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by VARCHAR(200);

-- ---------------------------------------------------------------------------
-- Shop Rates (historical rate master)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shop_rates (
  id                SERIAL PRIMARY KEY,
  shop_id           INTEGER REFERENCES shops(id) ON DELETE SET NULL,
  shop_name         VARCHAR(200) NOT NULL DEFAULT '',
  bird_type_id      INTEGER REFERENCES bird_types(id) ON DELETE SET NULL,
  bird_type         VARCHAR(100) NOT NULL DEFAULT '',
  rate              NUMERIC(12, 2) NOT NULL DEFAULT 0,
  effective_from    DATE NOT NULL,
  effective_to      DATE,
  remarks           TEXT NOT NULL DEFAULT '',
  status            ops_record_status NOT NULL DEFAULT 'Draft',
  deleted           BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_reason    TEXT,
  approved_by       VARCHAR(200),
  approved_at       TIMESTAMPTZ,
  rejected_by       VARCHAR(200),
  rejected_at       TIMESTAMPTZ,
  rejected_reason   TEXT,
  created_by        VARCHAR(200) NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Shop Sales entries (multiple sales supported)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shop_sales (
  id                SERIAL PRIMARY KEY,
  sale_no           VARCHAR(40) NOT NULL UNIQUE,
  sale_date         DATE NOT NULL,
  shop_id           INTEGER REFERENCES shops(id) ON DELETE SET NULL,
  shop_name         VARCHAR(200) NOT NULL DEFAULT '',
  bird_type_id      INTEGER REFERENCES bird_types(id) ON DELETE SET NULL,
  bird_type         VARCHAR(100) NOT NULL DEFAULT '',
  trip_id           INTEGER REFERENCES trips(id) ON DELETE SET NULL,
  birds             INTEGER NOT NULL DEFAULT 0,
  weight            NUMERIC(12, 3) NOT NULL DEFAULT 0,
  rate              NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount            NUMERIC(14, 2) NOT NULL DEFAULT 0,
  mortality         INTEGER NOT NULL DEFAULT 0,
  remarks           TEXT NOT NULL DEFAULT '',
  status            ops_record_status NOT NULL DEFAULT 'Draft',
  deleted           BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_reason    TEXT,
  approved_by       VARCHAR(200),
  approved_at       TIMESTAMPTZ,
  rejected_by       VARCHAR(200),
  rejected_at       TIMESTAMPTZ,
  rejected_reason   TEXT,
  created_by        VARCHAR(200) NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Collections
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS collections (
  id                SERIAL PRIMARY KEY,
  collection_no     VARCHAR(40) NOT NULL UNIQUE,
  collection_date   DATE NOT NULL,
  shop_id           INTEGER REFERENCES shops(id) ON DELETE SET NULL,
  shop_name         VARCHAR(200) NOT NULL DEFAULT '',
  sale_id           INTEGER REFERENCES shop_sales(id) ON DELETE SET NULL,
  trip_id           INTEGER REFERENCES trips(id) ON DELETE SET NULL,
  amount_due        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  amount_collected  NUMERIC(14, 2) NOT NULL DEFAULT 0,
  payment_mode      VARCHAR(50) NOT NULL DEFAULT 'Cash',
  reference_no      VARCHAR(100) NOT NULL DEFAULT '',
  remarks           TEXT NOT NULL DEFAULT '',
  status            ops_record_status NOT NULL DEFAULT 'Draft',
  deleted           BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_reason    TEXT,
  approved_by       VARCHAR(200),
  approved_at       TIMESTAMPTZ,
  rejected_by       VARCHAR(200),
  rejected_at       TIMESTAMPTZ,
  rejected_reason   TEXT,
  created_by        VARCHAR(200) NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Fuel expenses — soft delete + ops status + pump alias
-- ---------------------------------------------------------------------------
ALTER TABLE fuel_expenses
  ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejected_by VARCHAR(200),
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT,
  ADD COLUMN IF NOT EXISTS pump_name VARCHAR(200) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ops_status ops_record_status NOT NULL DEFAULT 'Draft';

-- Backfill ops_status from legacy approval_status
UPDATE fuel_expenses
SET ops_status = CASE
  WHEN status::text = 'Approved' THEN 'Approved'::ops_record_status
  ELSE 'Pending Approval'::ops_record_status
END
WHERE ops_status = 'Draft'::ops_record_status
  AND status IS NOT NULL;

-- Prefer petrol_bunk into pump_name when empty
UPDATE fuel_expenses
SET pump_name = petrol_bunk
WHERE (pump_name IS NULL OR pump_name = '')
  AND petrol_bunk IS NOT NULL
  AND petrol_bunk <> '';

-- updated_at triggers for new tables
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['shop_rates', 'shop_sales', 'collections']
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I',
      t, t
    );
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t, t
    );
  END LOOP;
END $$;
