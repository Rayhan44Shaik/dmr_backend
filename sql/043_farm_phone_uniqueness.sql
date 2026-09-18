-- Farm Master displays and validates phone number as a unique business key.
-- Keep the database authoritative under concurrent and direct-API writes.
CREATE UNIQUE INDEX IF NOT EXISTS ux_farms_phone_number_nonblank
  ON farms (phone_number)
  WHERE BTRIM(phone_number) <> '';
