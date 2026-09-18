import type { OperationsDashboard } from "../types/operations.js";
export type DashboardSummaryParams = {
    asOf?: string;
    fromDate?: string;
    toDate?: string;
};
/**
 * Dashboard KPIs from existing tables only:
 * trips, trip_deliveries, fuel_expenses, trip_diesel_entries
 * (vehicles/farms/shops available via FKs on those rows)
 *
 * fromDate/toDate (optional, inclusive) scope totals derived from completed
 * trips. todays/weekly/monthly stay relative to asOf (else toDate, else today).
 */
export declare const dashboardService: {
    getSummary(params?: DashboardSummaryParams | string): Promise<OperationsDashboard>;
};
