import type { OperationsDashboard } from "../types/operations.js";
/**
 * Dashboard KPIs from existing tables only:
 * trips, trip_deliveries, fuel_expenses, trip_diesel_entries
 * (vehicles/farms/shops available via FKs on those rows)
 */
export declare const dashboardService: {
    getSummary(asOf?: string): Promise<OperationsDashboard>;
};
