/**
 * Validation for the Mortality & Weight Loss Analysis read API.
 *
 * The list endpoint is the ONLY place users can influence a SQL query here, so
 * every parameter is validated and coerced through zod before it reaches the
 * service. Anything unexpected is rejected with a 400 (via AppError) rather than
 * silently ignored — a typo'd filter must never look like "no results".
 */

import { z } from "zod";
import { AppError } from "../middleware/errorHandler.js";

/** `YYYY-MM-DD`, and a real calendar date (rejects 2026-02-31). */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .refine((value) => {
    const [y, m, d] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(y, m - 1, d));
    return (
      parsed.getUTCFullYear() === y &&
      parsed.getUTCMonth() === m - 1 &&
      parsed.getUTCDate() === d
    );
  }, "Date is not a valid calendar date");

/**
 * Sortable columns. Keys are the API-facing names; values are the SQL
 * expressions. Mapping through this whitelist is what makes `ORDER BY` safe —
 * user input is never interpolated into SQL.
 */
export const MORTALITY_SORT_COLUMNS = {
  tripDate: "trip_date",
  tripNo: "trip_no",
  sourceFarm: "source_farm",
  supervisorName: "supervisor_name",
  farmBirds: "total_birds",
  farmWeight: "farm_weight",
  deliveryShops: "total_shops",
  deliveredBirds: "total_birds_delivered",
  deliveredWeight: "total_delivered_weight",
  mortalityCount: "total_mortality_count",
  mortalityWeight: "total_mortality_weight",
  mortalityPercentage: "mortality_percentage",
  weightLoss: "weight_loss",
  weightLossPercentage: "weight_loss_percentage",
} as const;

export type MortalitySortKey = keyof typeof MORTALITY_SORT_COLUMNS;

const sortDir = z.enum(["asc", "desc"]).default("desc");

export const mortalityAnalysisQuerySchema = z.object({
  fromDate: isoDate.optional(),
  toDate: isoDate.optional(),
  /** Exact match on the farm name (the UI dropdown is name-based). */
  farm: z.string().trim().min(1).max(200).optional(),
  /** Exact match on the supervisor name. */
  supervisor: z.string().trim().min(1).max(200).optional(),
  /** Free text across trip no / vehicle / driver / supervisor / farm. */
  search: z.string().trim().min(1).max(200).optional(),
  sortBy: z
    .enum(Object.keys(MORTALITY_SORT_COLUMNS) as [MortalitySortKey, ...MortalitySortKey[]])
    .default("tripDate"),
  sortDir: sortDir,
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type MortalityAnalysisQuery = z.infer<typeof mortalityAnalysisQuerySchema>;

/**
 * Parse + validate the query string. Throws AppError(400) with zod's flattened
 * errors, matching the error envelope used across the rest of the API.
 */
export function parseMortalityAnalysisQuery(
  query: Record<string, unknown>
): MortalityAnalysisQuery {
  const parsed = mortalityAnalysisQuerySchema.safeParse(query);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    throw new AppError(400, "Invalid mortality analysis query", {
      formErrors: flat.formErrors,
      fieldErrors: flat.fieldErrors,
    });
  }
  const { fromDate, toDate } = parsed.data;
  // A reversed range is a user error, not an empty result set.
  if (fromDate && toDate && fromDate > toDate) {
    throw new AppError(400, "Invalid mortality analysis query", {
      formErrors: ["fromDate must be on or before toDate"],
      fieldErrors: {},
    });
  }
  return parsed.data;
}
