-- =============================================================================
-- Operations indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_trips_supervisor_name ON trips(supervisor_name);
CREATE INDEX IF NOT EXISTS idx_trips_trip_no ON trips(trip_no);
CREATE INDEX IF NOT EXISTS idx_trips_approved ON trips(status) WHERE status = 'Approved';
CREATE INDEX IF NOT EXISTS idx_trips_farm_bird_type ON trips(farm_bird_type_id);

CREATE INDEX IF NOT EXISTS idx_shop_rates_shop ON shop_rates(shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_rates_effective ON shop_rates(effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_shop_rates_status ON shop_rates(status);
CREATE INDEX IF NOT EXISTS idx_shop_rates_active ON shop_rates(deleted) WHERE deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_shop_sales_date ON shop_sales(sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_shop_sales_shop ON shop_sales(shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_sales_status ON shop_sales(status);
CREATE INDEX IF NOT EXISTS idx_shop_sales_trip ON shop_sales(trip_id);
CREATE INDEX IF NOT EXISTS idx_shop_sales_active ON shop_sales(deleted) WHERE deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_collections_date ON collections(collection_date DESC);
CREATE INDEX IF NOT EXISTS idx_collections_shop ON collections(shop_id);
CREATE INDEX IF NOT EXISTS idx_collections_status ON collections(status);
CREATE INDEX IF NOT EXISTS idx_collections_sale ON collections(sale_id);
CREATE INDEX IF NOT EXISTS idx_collections_active ON collections(deleted) WHERE deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_fuel_expenses_ops_status ON fuel_expenses(ops_status);
CREATE INDEX IF NOT EXISTS idx_fuel_expenses_deleted ON fuel_expenses(deleted) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_fuel_expenses_bill_no ON fuel_expenses(bill_no);
CREATE INDEX IF NOT EXISTS idx_fuel_expenses_driver ON fuel_expenses(driver_id);
CREATE INDEX IF NOT EXISTS idx_fuel_expenses_supervisor ON fuel_expenses(supervisor_id);
