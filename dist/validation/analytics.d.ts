import { z } from "zod";
export declare const analyticsQuerySchema: z.ZodObject<{
    fromDate: z.ZodOptional<z.ZodString>;
    toDate: z.ZodOptional<z.ZodString>;
    vehicleId: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    fromDate?: string | undefined;
    toDate?: string | undefined;
    vehicleId?: number | undefined;
}, {
    fromDate?: string | undefined;
    toDate?: string | undefined;
    vehicleId?: number | undefined;
}>;
export interface AnalyticsQuery {
    fromDate: string;
    toDate: string;
    vehicleId: number | null;
}
/**
 * Validate + normalize the Analytics query. Follows the existing Fleet Zod
 * convention (see src/validation/operations.ts parseBody). Unknown query keys
 * are stripped; malformed values are rejected with a 400 and a flattened
 * Zod error, exactly like the rest of the API surface.
 *
 * Defaults mirror the Analytics page's default report range (current month),
 * so an omitted range never silently drifts to a different window than the
 * frontend uses.
 */
export declare function parseAnalyticsQuery(query: Record<string, unknown>): AnalyticsQuery;
