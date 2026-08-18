import { z } from "zod";
import { AppError } from "../middleware/errorHandler.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True when the value is a real calendar date (rejects 2026-02-30 etc.). */
function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

export const analyticsQuerySchema = z.object({
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  vehicleId: z.coerce.number().int().positive().optional(),
});

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
/**
 * Analytics-level safe maximum for a report window. Prevents an uncontrolled
 * weekly series (and unbounded aggregation) from a pathological range.
 * 50 years ≈ 2600 Sunday buckets — well within the memory/CPU budget while
 * covering every realistic fleet report. Exceeding it is rejected with a clear
 * 400 (global validation is left untouched).
 */
export const MAX_ANALYTICS_RANGE_DAYS = 50 * 366;

export function parseAnalyticsQuery(query: Record<string, unknown>): AnalyticsQuery {
  const parsed = analyticsQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError(400, "Invalid analytics query parameters", parsed.error.flatten());
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const defaultFrom = `${year}-${pad(month + 1)}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const defaultTo = `${year}-${pad(month + 1)}-${pad(lastDay)}`;

  const fromDate = parsed.data.fromDate ?? defaultFrom;
  const toDate = parsed.data.toDate ?? defaultTo;
  const vehicleId = parsed.data.vehicleId ?? null;

  if (!isValidDate(fromDate)) {
    throw new AppError(400, `Invalid fromDate "${fromDate}". Expected a YYYY-MM-DD date.`);
  }
  if (!isValidDate(toDate)) {
    throw new AppError(400, `Invalid toDate "${toDate}". Expected a YYYY-MM-DD date.`);
  }
  if (fromDate > toDate) {
    throw new AppError(400, "fromDate cannot be after toDate.");
  }

  const rangeDays =
    Math.round(
      (new Date(`${toDate}T00:00:00Z`).getTime() -
        new Date(`${fromDate}T00:00:00Z`).getTime()) /
        86_400_000
    ) + 1;
  if (rangeDays > MAX_ANALYTICS_RANGE_DAYS) {
    throw new AppError(
      400,
      `Analytics date range is too large (${rangeDays} days). Maximum is ${MAX_ANALYTICS_RANGE_DAYS} days (~50 years).`
    );
  }

  return { fromDate, toDate, vehicleId };
}
