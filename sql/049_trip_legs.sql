-- =============================================================================
-- 049_trip_legs.sql
-- Same Draft trip: one Step 1 + one Step 5, repeated Farm→Pickup→Deliveries
-- cycles (up to 3) stored as trip_legs on the same trips row.
-- =============================================================================

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS leg_count SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE trips
  DROP CONSTRAINT IF EXISTS trips_leg_count_check;
ALTER TABLE trips
  ADD CONSTRAINT trips_leg_count_check CHECK (leg_count >= 1 AND leg_count <= 3);

CREATE TABLE IF NOT EXISTS trip_legs (
  id                         SERIAL PRIMARY KEY,
  trip_id                    INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  leg_index                  SMALLINT NOT NULL,
  -- Step 2: Farm
  source_farm_id             INTEGER REFERENCES farms(id) ON DELETE SET NULL,
  source_farm                VARCHAR(200),
  reached_time               TIMESTAMPTZ,
  dest_meter                 NUMERIC(12, 2),
  pickup_tolls               NUMERIC(12, 2) DEFAULT 0,
  farm_address               TEXT,
  avg_bird_weight            NUMERIC(10, 3),
  farm_remarks               TEXT,
  farm_bird_type_id          INTEGER REFERENCES bird_types(id) ON DELETE SET NULL,
  farm_bird_type             VARCHAR(100),
  farm_bird_count            INTEGER,
  farm_load_weight           NUMERIC(12, 3),
  farm_rate                  NUMERIC(12, 2),
  farm_amount                NUMERIC(14, 2),
  farm_gps_lat               NUMERIC(10, 7),
  farm_gps_lon               NUMERIC(10, 7),
  farm_gps_accuracy          NUMERIC(10, 2),
  farm_gps_time              TIMESTAMPTZ,
  farm_step_submitted        BOOLEAN NOT NULL DEFAULT FALSE,
  farm_step_submitted_at     TIMESTAMPTZ,
  -- Step 3: Pickup
  dc_weight                  NUMERIC(12, 3) DEFAULT 0,
  total_birds                INTEGER DEFAULT 0,
  boxes                      INTEGER DEFAULT 0,
  avg_weight                 NUMERIC(10, 3) DEFAULT 0,
  pickup_load_time           TIMESTAMPTZ,
  dc_photo_key               TEXT,
  pickup_step_submitted      BOOLEAN NOT NULL DEFAULT FALSE,
  pickup_step_submitted_at   TIMESTAMPTZ,
  -- Step 4: Deliveries flag
  delivery_step_submitted    BOOLEAN NOT NULL DEFAULT FALSE,
  deliveries_step_submitted_at TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT trip_legs_index_check CHECK (leg_index >= 1 AND leg_index <= 3),
  UNIQUE (trip_id, leg_index)
);

CREATE INDEX IF NOT EXISTS idx_trip_legs_trip ON trip_legs (trip_id);

-- Scope boxes / deliveries / DC media to a load cycle
ALTER TABLE trip_boxes
  ADD COLUMN IF NOT EXISTS leg_id INTEGER REFERENCES trip_legs(id) ON DELETE CASCADE;

ALTER TABLE trip_deliveries
  ADD COLUMN IF NOT EXISTS leg_id INTEGER REFERENCES trip_legs(id) ON DELETE CASCADE;

ALTER TABLE trip_media
  ADD COLUMN IF NOT EXISTS leg_id INTEGER REFERENCES trip_legs(id) ON DELETE CASCADE;

-- Backfill: one leg per existing trip, copying Step 2–4 columns from trips
INSERT INTO trip_legs (
  trip_id, leg_index,
  source_farm_id, source_farm, reached_time, dest_meter, pickup_tolls,
  farm_address, avg_bird_weight, farm_remarks,
  farm_bird_type_id, farm_bird_type, farm_bird_count, farm_load_weight,
  farm_rate, farm_amount,
  farm_gps_lat, farm_gps_lon, farm_gps_accuracy, farm_gps_time,
  farm_step_submitted, farm_step_submitted_at,
  dc_weight, total_birds, boxes, avg_weight, pickup_load_time, dc_photo_key,
  pickup_step_submitted, pickup_step_submitted_at,
  delivery_step_submitted, deliveries_step_submitted_at
)
SELECT
  t.id, 1,
  t.source_farm_id, t.source_farm, t.reached_time, t.dest_meter, t.pickup_tolls,
  t.farm_address, t.avg_bird_weight, t.farm_remarks,
  t.farm_bird_type_id, t.farm_bird_type, t.farm_bird_count, t.farm_load_weight,
  t.farm_rate, t.farm_amount,
  t.farm_gps_lat, t.farm_gps_lon, t.farm_gps_accuracy, t.farm_gps_time,
  COALESCE(t.farm_step_submitted, FALSE), t.farm_step_submitted_at,
  COALESCE(t.dc_weight, 0), COALESCE(t.total_birds, 0), COALESCE(t.boxes, 0),
  COALESCE(t.avg_weight, 0), t.pickup_load_time, t.dc_photo_key,
  COALESCE(t.pickup_step_submitted, FALSE), t.pickup_step_submitted_at,
  COALESCE(t.delivery_step_submitted, FALSE), t.deliveries_step_submitted_at
FROM trips t
WHERE NOT EXISTS (
  SELECT 1 FROM trip_legs l WHERE l.trip_id = t.id AND l.leg_index = 1
);

UPDATE trips SET leg_count = 1 WHERE leg_count IS NULL OR leg_count < 1;

-- Attach orphan children to leg 1
UPDATE trip_boxes b
   SET leg_id = l.id
  FROM trip_legs l
 WHERE l.trip_id = b.trip_id AND l.leg_index = 1 AND b.leg_id IS NULL;

UPDATE trip_deliveries d
   SET leg_id = l.id
  FROM trip_legs l
 WHERE l.trip_id = d.trip_id AND l.leg_index = 1 AND d.leg_id IS NULL;

UPDATE trip_media m
   SET leg_id = l.id
  FROM trip_legs l
 WHERE l.trip_id = m.trip_id AND l.leg_index = 1 AND m.leg_id IS NULL
   AND m.media_key ILIKE 'dc%';

-- Unique box numbers per leg (allow same box_no on different loads)
ALTER TABLE trip_boxes DROP CONSTRAINT IF EXISTS trip_boxes_trip_id_box_no_key;
DROP INDEX IF EXISTS trip_boxes_trip_id_box_no_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_boxes_leg_box
  ON trip_boxes (leg_id, box_no)
  WHERE leg_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_boxes_trip_box_legacy
  ON trip_boxes (trip_id, box_no)
  WHERE leg_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_trip_boxes_leg ON trip_boxes (leg_id);
CREATE INDEX IF NOT EXISTS idx_trip_deliveries_leg ON trip_deliveries (leg_id);
CREATE INDEX IF NOT EXISTS idx_trip_media_leg ON trip_media (leg_id);

-- Same shop/birds/weight may repeat across loads; uniqueness is per load.
DROP INDEX IF EXISTS idx_trip_deliveries_no_dup_sale;
CREATE UNIQUE INDEX idx_trip_deliveries_no_dup_sale
  ON trip_deliveries (trip_id, COALESCE(leg_id, 0), shop_id, birds, weight)
  WHERE deleted = FALSE
    AND shop_id IS NOT NULL
    AND remarks NOT LIKE '[ORDER]%';
