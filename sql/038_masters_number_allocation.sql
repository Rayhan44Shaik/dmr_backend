-- Reserve business numbers atomically, including concurrent single/bulk creates.
-- Existing numbers and historical foreign keys are not changed.
CREATE TABLE IF NOT EXISTS master_number_counters (
  entity TEXT PRIMARY KEY,
  last_number INTEGER NOT NULL CHECK (last_number > 0)
);

CREATE OR REPLACE FUNCTION next_master_number(entity_name TEXT, requested INTEGER DEFAULT NULL)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE number_column TEXT; existing_max INTEGER; allocated INTEGER;
BEGIN
  number_column := CASE entity_name
    WHEN 'employees' THEN 'employee_no' WHEN 'vehicles' THEN 'vehicle_no'
    WHEN 'farms' THEN 'farm_no' WHEN 'shops' THEN 'shop_no'
    WHEN 'banks' THEN 'bank_no' WHEN 'bird_types' THEN 'bird_type_no'
    WHEN 'routes' THEN 'route_no' ELSE NULL END;
  IF number_column IS NULL THEN RAISE EXCEPTION 'Unknown master entity'; END IF;
  EXECUTE format('SELECT COALESCE(MAX(%I),0) FROM %I', number_column, entity_name) INTO existing_max;
  INSERT INTO master_number_counters AS counters(entity, last_number)
  VALUES (entity_name, GREATEST(existing_max + 1, COALESCE(requested, 0)))
  ON CONFLICT (entity) DO UPDATE SET last_number =
    GREATEST(counters.last_number + 1, existing_max + 1, COALESCE(requested, 0))
  RETURNING last_number INTO allocated;
  RETURN COALESCE(requested, allocated);
END;
$$;
