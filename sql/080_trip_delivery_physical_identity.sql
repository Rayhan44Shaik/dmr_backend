-- Delivery totals are not a row identity. A trip/load can legitimately have
-- multiple drops with the same shop, birds and weight when their sub-shop or
-- selected pickup boxes differ. Retry safety is provided by client_key (036),
-- while reconstructed clients are matched conservatively in tripsService by
-- shop + sub-shop + exact selected boxes + quantities.
DROP INDEX IF EXISTS idx_trip_deliveries_no_dup_sale;
