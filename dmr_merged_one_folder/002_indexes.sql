-- =============================================================================
-- Indexes for trip entry + staff queries
-- =============================================================================

CREATE INDEX idx_employees_department ON employees(department);
CREATE INDEX idx_employees_status ON employees(status);
CREATE INDEX idx_employees_name ON employees(employee_name);

CREATE INDEX idx_vehicles_number ON vehicles(vehicle_number);
CREATE INDEX idx_vehicles_status ON vehicles(status);

CREATE INDEX idx_farms_status ON farms(status);
CREATE INDEX idx_shops_status ON shops(status);
CREATE INDEX idx_bird_types_status ON bird_types(status);

CREATE INDEX idx_trips_date ON trips(trip_date DESC);
CREATE INDEX idx_trips_status ON trips(status);
CREATE INDEX idx_trips_vehicle ON trips(vehicle_id);
CREATE INDEX idx_trips_driver ON trips(driver_id);
CREATE INDEX idx_trips_supervisor ON trips(supervisor_id);
CREATE INDEX idx_trips_farm ON trips(source_farm_id);
CREATE INDEX idx_trips_deleted ON trips(deleted) WHERE deleted = FALSE;

CREATE INDEX idx_trip_crew_trip ON trip_crew(trip_id);
CREATE INDEX idx_trip_boxes_trip ON trip_boxes(trip_id);
CREATE INDEX idx_trip_deliveries_trip ON trip_deliveries(trip_id);
CREATE INDEX idx_trip_deliveries_shop ON trip_deliveries(shop_id);
CREATE INDEX idx_trip_diesel_trip ON trip_diesel_entries(trip_id);
CREATE INDEX idx_trip_media_trip ON trip_media(trip_id);

CREATE INDEX idx_fuel_expenses_date ON fuel_expenses(expense_date DESC);
CREATE INDEX idx_fuel_expenses_trip ON fuel_expenses(trip_id);
CREATE INDEX idx_fuel_expenses_vehicle ON fuel_expenses(vehicle_id);

CREATE INDEX idx_duty_date ON duty_assignments(duty_date);
CREATE INDEX idx_duty_employee ON duty_assignments(employee_id);
CREATE INDEX idx_leave_employee ON leave_requests(employee_id);
CREATE INDEX idx_leave_status ON leave_requests(status);
CREATE INDEX idx_salary_month ON salary_records(month);
CREATE INDEX idx_salary_employee ON salary_records(employee_id);
CREATE INDEX idx_advance_employee ON advance_loans(employee_id);
CREATE INDEX idx_attendance_month ON attendance_records(month);
