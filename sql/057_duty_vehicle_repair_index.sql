-- 057_duty_vehicle_repair_index.sql
-- P2: close the Repair vehicle-index gap.
--
-- 027 created uq_duty_vehicle_date for Delivery/Driver only, while the service
-- check (dutyPlannerService.validateAssignment) already covers
-- Delivery/Driver/Repair. A concurrent Repair double-claim on the same
-- vehicle/date relied on the pre-insert SELECT, not a unique key.
-- This migration rebuilds the partial unique index with the same predicate the
-- service enforces, so concurrent Repair claims arbitrate on the key (409).

DROP INDEX IF EXISTS uq_duty_vehicle_date;
CREATE UNIQUE INDEX IF NOT EXISTS uq_duty_vehicle_date
  ON duty_assignments (vehicle_id, duty_date)
  WHERE vehicle_id IS NOT NULL AND duty_type IN ('Delivery', 'Driver', 'Repair');
