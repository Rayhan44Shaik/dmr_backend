-- =============================================================================
-- DMR Poultries — Local PostgreSQL Schema
-- Phase 1: Masters + Trip Entry (Steps 1–5) + Staff
-- Designed for local storage now; same schema will migrate to cloud later.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE active_status AS ENUM ('Active', 'Inactive');
CREATE TYPE employee_status AS ENUM ('Active', 'Inactive', 'Suspended');
CREATE TYPE trip_status AS ENUM ('Draft', 'Pending', 'Completed', 'Deleted');
CREATE TYPE delivery_mode AS ENUM ('box', 'weight');
CREATE TYPE duty_type AS ENUM ('Driver', 'Delivery', 'Rest', 'Repair', 'Office', 'WeeklyOff');
CREATE TYPE leave_type AS ENUM ('Casual', 'Sick', 'Emergency', 'Annual');
CREATE TYPE leave_status AS ENUM ('Pending', 'Approved', 'Rejected');
CREATE TYPE salary_status AS ENUM ('Pending', 'Paid');
CREATE TYPE advance_loan_type AS ENUM ('Advance', 'Loan');
CREATE TYPE advance_loan_status AS ENUM ('Active', 'Completed');
CREATE TYPE approval_status AS ENUM ('Pending', 'Approved');
CREATE TYPE crew_role AS ENUM ('helper', 'loader');

-- =============================================================================
-- MASTERS
-- =============================================================================

CREATE TABLE employees (
  id              SERIAL PRIMARY KEY,
  employee_no     INTEGER NOT NULL UNIQUE,
  employee_name   VARCHAR(200) NOT NULL,
  department      VARCHAR(100) NOT NULL,
  role            VARCHAR(100) NOT NULL DEFAULT '',
  phone_number    VARCHAR(30) NOT NULL DEFAULT '',
  email           VARCHAR(200) NOT NULL DEFAULT '',
  address         TEXT NOT NULL DEFAULT '',
  joining_date    DATE,
  aadhar_number   VARCHAR(20),
  license_number  VARCHAR(50),
  salary          NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status          employee_status NOT NULL DEFAULT 'Active',
  avatar          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE vehicles (
  id                 SERIAL PRIMARY KEY,
  vehicle_no         INTEGER NOT NULL UNIQUE,
  vehicle_number     VARCHAR(50) NOT NULL,
  vehicle_type       VARCHAR(100) NOT NULL DEFAULT '',
  no_of_boxes        INTEGER NOT NULL DEFAULT 85,
  bird_capacity      INTEGER NOT NULL DEFAULT 0,
  capacity_kg        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tracking_id        VARCHAR(100) NOT NULL DEFAULT '',
  fastag_bank        VARCHAR(100) NOT NULL DEFAULT '',
  engine_number      VARCHAR(100) NOT NULL DEFAULT '',
  chassis_number     VARCHAR(100) NOT NULL DEFAULT '',
  insurance_expiry   DATE,
  permit_expiry      DATE,
  fitness_expiry     DATE,
  purchase_date      DATE,
  purchase_amount    NUMERIC(14, 2),
  emi_start_date     DATE,
  rc_date            DATE,
  status             active_status NOT NULL DEFAULT 'Active',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE farms (
  id               SERIAL PRIMARY KEY,
  farm_no          INTEGER NOT NULL UNIQUE,
  farm_name        VARCHAR(200) NOT NULL,
  owner_name       VARCHAR(200) NOT NULL DEFAULT '',
  supervisor_name  VARCHAR(200) NOT NULL DEFAULT '',
  phone_number     VARCHAR(30) NOT NULL DEFAULT '',
  village          VARCHAR(200) NOT NULL DEFAULT '',
  address          TEXT NOT NULL DEFAULT '',
  capacity         INTEGER NOT NULL DEFAULT 0,
  status           active_status NOT NULL DEFAULT 'Active',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE shops (
  id            SERIAL PRIMARY KEY,
  shop_no       INTEGER NOT NULL UNIQUE,
  shop_name     VARCHAR(200) NOT NULL,
  owner_name    VARCHAR(200) NOT NULL DEFAULT '',
  phone_number  VARCHAR(30) NOT NULL DEFAULT '',
  village       VARCHAR(200) NOT NULL DEFAULT '',
  address       TEXT,
  status        active_status NOT NULL DEFAULT 'Active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE banks (
  id              SERIAL PRIMARY KEY,
  bank_no         INTEGER NOT NULL UNIQUE,
  bank_name       VARCHAR(200) NOT NULL,
  branch          VARCHAR(200) NOT NULL DEFAULT '',
  account_number  VARCHAR(50) NOT NULL DEFAULT '',
  ifsc_code       VARCHAR(20) NOT NULL DEFAULT '',
  upi_id          VARCHAR(100) NOT NULL DEFAULT '',
  status          active_status NOT NULL DEFAULT 'Active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bird_types (
  id              SERIAL PRIMARY KEY,
  bird_type_no    INTEGER NOT NULL UNIQUE,
  bird_type       VARCHAR(100) NOT NULL,
  average_weight  NUMERIC(10, 3) NOT NULL DEFAULT 0,
  description     TEXT NOT NULL DEFAULT '',
  status          active_status NOT NULL DEFAULT 'Active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- TRIPS — Step 1 (Start) through Step 5 (End / Expenses)
-- =============================================================================

CREATE TABLE trips (
  id                    SERIAL PRIMARY KEY,
  trip_no               VARCHAR(40) NOT NULL UNIQUE,
  trip_date             DATE NOT NULL,
  status                trip_status NOT NULL DEFAULT 'Draft',

  -- Step 1: Start (at office)
  start_time            TIMESTAMPTZ,
  vehicle_id            INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  vehicle_no            VARCHAR(50),
  driver_id             INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  driver_name           VARCHAR(200),
  supervisor_id         INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  supervisor_name       VARCHAR(200),
  opening_meter         NUMERIC(12, 2),
  advance_amount        NUMERIC(12, 2) DEFAULT 0,
  start_step_submitted  BOOLEAN NOT NULL DEFAULT FALSE,

  -- Step 2: Farm
  source_farm_id        INTEGER REFERENCES farms(id) ON DELETE SET NULL,
  source_farm           VARCHAR(200),
  reached_time          TIMESTAMPTZ,
  dest_meter            NUMERIC(12, 2),
  pickup_tolls          NUMERIC(12, 2) DEFAULT 0,
  farm_address          TEXT,
  avg_bird_weight       NUMERIC(10, 3),
  farm_remarks          TEXT,
  farm_step_submitted   BOOLEAN NOT NULL DEFAULT FALSE,

  -- Step 3: Pickup
  dc_weight             NUMERIC(12, 3) DEFAULT 0,
  total_birds           INTEGER DEFAULT 0,
  boxes                 INTEGER DEFAULT 0,
  avg_weight            NUMERIC(10, 3) DEFAULT 0,
  pickup_load_time      TIMESTAMPTZ,
  dc_photo_key          TEXT,
  pickup_step_submitted BOOLEAN NOT NULL DEFAULT FALSE,

  -- Step 4: Deliveries (flag only; rows in trip_deliveries)
  delivery_step_submitted BOOLEAN NOT NULL DEFAULT FALSE,

  -- Step 5: End / Expenses sheet
  closing_meter         NUMERIC(12, 2),
  end_meter             NUMERIC(12, 2),
  end_time              TIMESTAMPTZ,
  delivery_tolls        NUMERIC(12, 2) DEFAULT 0,
  destination_tolls     NUMERIC(12, 2) DEFAULT 0,
  meals                 NUMERIC(12, 2) DEFAULT 0,
  loading               NUMERIC(12, 2) DEFAULT 0,
  meals_tiffin          NUMERIC(12, 2) DEFAULT 0,
  vehicle_maintenance   NUMERIC(12, 2) DEFAULT 0,
  others_rc             NUMERIC(12, 2) DEFAULT 0,
  others1_amt           NUMERIC(12, 2) DEFAULT 0,
  others2_amt           NUMERIC(12, 2) DEFAULT 0,
  others3_amt           NUMERIC(12, 2) DEFAULT 0,
  others4_amt           NUMERIC(12, 2) DEFAULT 0,
  others5_amt           NUMERIC(12, 2) DEFAULT 0,
  fuel                  NUMERIC(12, 2) DEFAULT 0,
  expense               NUMERIC(12, 2) DEFAULT 0,
  remarks               TEXT DEFAULT '',
  submitted_at          TIMESTAMPTZ,
  end_step_submitted    BOOLEAN NOT NULL DEFAULT FALSE,
  expenses_step_submitted BOOLEAN NOT NULL DEFAULT FALSE,

  -- Computed KPIs
  total_km              NUMERIC(12, 2) DEFAULT 0,
  total_shops           INTEGER DEFAULT 0,
  total_weight          NUMERIC(12, 3) DEFAULT 0,
  total_delivered_weight NUMERIC(12, 3) DEFAULT 0,
  total_birds_delivered INTEGER DEFAULT 0,
  total_mortality       NUMERIC(12, 3) DEFAULT 0,
  total_mortality_count INTEGER DEFAULT 0,
  total_mortality_weight NUMERIC(12, 3) DEFAULT 0,
  weight_loss           NUMERIC(12, 3) DEFAULT 0,
  survival_rate         NUMERIC(8, 4) DEFAULT 0,
  last_shop             VARCHAR(200),
  rate_completed        BOOLEAN NOT NULL DEFAULT FALSE,

  -- Soft delete / audit
  deleted               BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_reason        TEXT,
  approved_by           VARCHAR(200),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 1 crew: helpers & loaders
CREATE TABLE trip_crew (
  id            SERIAL PRIMARY KEY,
  trip_id       INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  employee_id   INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  employee_name VARCHAR(200) NOT NULL,
  role          crew_role NOT NULL,
  UNIQUE (trip_id, employee_name, role)
);

-- Step 3: box details
CREATE TABLE trip_boxes (
  id        SERIAL PRIMARY KEY,
  trip_id   INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  box_no    INTEGER NOT NULL,
  birds     INTEGER NOT NULL DEFAULT 0,
  weight    NUMERIC(12, 3) NOT NULL DEFAULT 0,
  UNIQUE (trip_id, box_no)
);

-- Step 4: shop deliveries
CREATE TABLE trip_deliveries (
  id                SERIAL PRIMARY KEY,
  trip_id           INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  serial_no         INTEGER,
  box_no            INTEGER,
  shop_id           INTEGER REFERENCES shops(id) ON DELETE SET NULL,
  shop_name         VARCHAR(200) NOT NULL DEFAULT '',
  bird_type_id      INTEGER REFERENCES bird_types(id) ON DELETE SET NULL,
  bird_type         VARCHAR(100) NOT NULL DEFAULT '',
  birds             INTEGER NOT NULL DEFAULT 0,
  weight            NUMERIC(12, 3) NOT NULL DEFAULT 0,
  mortality         INTEGER NOT NULL DEFAULT 0,
  mort_kg           NUMERIC(12, 3) DEFAULT 0,
  rate              NUMERIC(12, 2),
  amount            NUMERIC(14, 2) NOT NULL DEFAULT 0,
  remarks           TEXT NOT NULL DEFAULT '',
  delivery_mode     delivery_mode NOT NULL DEFAULT 'box',
  farm_birds        INTEGER,
  farm_weight       NUMERIC(12, 3),
  auto_capture_time TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Selected pickup boxes assigned to a delivery
CREATE TABLE trip_delivery_boxes (
  id           SERIAL PRIMARY KEY,
  delivery_id  INTEGER NOT NULL REFERENCES trip_deliveries(id) ON DELETE CASCADE,
  box_no       INTEGER NOT NULL,
  UNIQUE (delivery_id, box_no)
);

-- Weight-mode per-box breakdown
CREATE TABLE trip_delivery_per_box (
  id           SERIAL PRIMARY KEY,
  delivery_id  INTEGER NOT NULL REFERENCES trip_deliveries(id) ON DELETE CASCADE,
  box_no       INTEGER NOT NULL,
  birds        INTEGER NOT NULL DEFAULT 0,
  weight       NUMERIC(12, 3) NOT NULL DEFAULT 0,
  UNIQUE (delivery_id, box_no)
);

-- Step 5: diesel fill rows (up to N per trip)
CREATE TABLE trip_diesel_entries (
  id            SERIAL PRIMARY KEY,
  trip_id       INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  row_index     INTEGER NOT NULL,
  litres        NUMERIC(12, 3),
  rate          NUMERIC(12, 2),
  meter         NUMERIC(12, 2),
  bunk_name     VARCHAR(200),
  bunk_gps      TEXT,
  image_data    TEXT,
  image_name    VARCHAR(255),
  UNIQUE (trip_id, row_index)
);

-- Media blobs (DC photo, etc.) kept out of main trip row
CREATE TABLE trip_media (
  id           SERIAL PRIMARY KEY,
  trip_id      INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  media_key    VARCHAR(100) NOT NULL,
  media_type   VARCHAR(50) NOT NULL DEFAULT 'image',
  mime_type    VARCHAR(100),
  file_name    VARCHAR(255),
  data_base64  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_id, media_key)
);

-- Fuel expense bills (auto-created from Step 5 diesel rows)
CREATE TABLE fuel_expenses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_no          VARCHAR(40) NOT NULL UNIQUE,
  expense_date     DATE NOT NULL,
  vehicle_id       INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  vehicle_no       VARCHAR(50),
  driver_id        INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  driver_name      VARCHAR(200),
  supervisor_id    INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  supervisor_name  VARCHAR(200),
  trip_id          INTEGER REFERENCES trips(id) ON DELETE SET NULL,
  meter_reading    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount           NUMERIC(12, 2) NOT NULL DEFAULT 0,
  rate             NUMERIC(12, 2) NOT NULL DEFAULT 0,
  litres           NUMERIC(12, 3) NOT NULL DEFAULT 0,
  petrol_bunk      VARCHAR(200) NOT NULL DEFAULT '',
  remarks          TEXT,
  status           approval_status NOT NULL DEFAULT 'Pending',
  image_data       TEXT,
  synced           BOOLEAN NOT NULL DEFAULT FALSE,
  created_by       VARCHAR(200) NOT NULL DEFAULT '',
  approved_by      VARCHAR(200),
  approved_date    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- STAFF MODULE
-- =============================================================================

CREATE TABLE duty_assignments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  employee_name  VARCHAR(200) NOT NULL,
  department     VARCHAR(100) NOT NULL DEFAULT '',
  role           VARCHAR(100) NOT NULL DEFAULT '',
  duty_type      duty_type NOT NULL,
  duty_date      DATE NOT NULL,
  vehicle_id     INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  vehicle_no     VARCHAR(50),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, duty_date)
);

CREATE TABLE leave_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  employee_name     VARCHAR(200) NOT NULL,
  leave_type        leave_type NOT NULL,
  from_date         DATE NOT NULL,
  to_date           DATE NOT NULL,
  days              NUMERIC(6, 1) NOT NULL,
  status            leave_status NOT NULL DEFAULT 'Pending',
  reason            TEXT,
  rejection_reason  TEXT,
  approved_by       VARCHAR(200),
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (to_date >= from_date)
);

CREATE TABLE salary_records (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id        INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  employee_name      VARCHAR(200) NOT NULL,
  department         VARCHAR(100) NOT NULL DEFAULT '',
  month              CHAR(7) NOT NULL, -- YYYY-MM
  basic_salary       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  overtime           NUMERIC(12, 2) NOT NULL DEFAULT 0,
  incentives         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  fuel_allowance     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  night_allowance    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_gross        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  leave_deduction    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  advance_recovery   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  loan_emi           NUMERIC(12, 2) NOT NULL DEFAULT 0,
  late_penalty       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  other_deductions   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_deductions   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  net_salary         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status             salary_status NOT NULL DEFAULT 'Pending',
  payment_date       DATE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, month)
);

CREATE TABLE advance_loans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  employee_name       VARCHAR(200) NOT NULL,
  loan_type           advance_loan_type NOT NULL,
  principal           NUMERIC(12, 2) NOT NULL,
  issued_date         DATE NOT NULL,
  total_repaid        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  monthly_deduction   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  remaining_balance   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status              advance_loan_status NOT NULL DEFAULT 'Active',
  interest_rate       NUMERIC(6, 3),
  tenure_months       INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE attendance_records (
  id              SERIAL PRIMARY KEY,
  employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  employee_name   VARCHAR(200) NOT NULL,
  department      VARCHAR(100) NOT NULL DEFAULT '',
  month           CHAR(7) NOT NULL, -- YYYY-MM
  day_marks       JSONB NOT NULL DEFAULT '{}'::jsonb, -- {"1":"P","2":"A",...}
  present_count   INTEGER NOT NULL DEFAULT 0,
  absent_count    INTEGER NOT NULL DEFAULT 0,
  leave_count     INTEGER NOT NULL DEFAULT 0,
  half_day_count  INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, month)
);

-- =============================================================================
-- UPDATED_AT TRIGGER
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'employees', 'vehicles', 'farms', 'shops', 'banks', 'bird_types',
    'trips', 'trip_deliveries', 'fuel_expenses',
    'duty_assignments', 'leave_requests', 'salary_records',
    'advance_loans', 'attendance_records'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t, t
    );
  END LOOP;
END $$;
