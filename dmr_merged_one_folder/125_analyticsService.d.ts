import type { AnalyticsQuery } from "../validation/analytics.js";
import type { FleetAnalyticsResponse } from "../types/analytics.js";
export declare const analyticsService: {
    /** Aggregate fleet analytics for a date range (and optional vehicle). Read-only. */
    get(analyticQuery: AnalyticsQuery): Promise<FleetAnalyticsResponse>;
};
