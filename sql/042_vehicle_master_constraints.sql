-- Vehicle Master production constraints. Existing NOT VALID checks are
-- validated here so they protect both historical and future rows.
ALTER TABLE vehicles VALIDATE CONSTRAINT chk_vehicles_positive_capacity;
ALTER TABLE vehicles VALIDATE CONSTRAINT chk_vehicles_emi_day;
ALTER TABLE vehicles VALIDATE CONSTRAINT chk_vehicles_total_emis;

ALTER TABLE vehicles ADD CONSTRAINT chk_vehicles_purchase_amount
  CHECK (purchase_amount IS NULL OR purchase_amount >= 0) NOT VALID;
ALTER TABLE vehicles VALIDATE CONSTRAINT chk_vehicles_purchase_amount;
