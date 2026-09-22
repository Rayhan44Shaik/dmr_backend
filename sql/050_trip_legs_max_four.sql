-- Allow up to four Farm→Pickup→Deliveries loads on one trip.
ALTER TABLE trip_legs
  DROP CONSTRAINT IF EXISTS trip_legs_index_check;

ALTER TABLE trip_legs
  ADD CONSTRAINT trip_legs_index_check
  CHECK (leg_index >= 1 AND leg_index <= 4);

ALTER TABLE trips
  DROP CONSTRAINT IF EXISTS trips_leg_count_check;

ALTER TABLE trips
  ADD CONSTRAINT trips_leg_count_check
  CHECK (leg_count >= 1 AND leg_count <= 4);
