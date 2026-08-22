/**
 * Staff → Driver / Supervisor Performance query validation.
 *
 * Both endpoints share one filter schema: a date range (defaults supplied by
 * the service when absent), a debounced free-text search over the crew member
 * name, an exact crew-member id filter, and an optional vehicle id filter.
 * Every filter is optional; at least the date range bounds the aggregation.
 */
import { z } from "zod";
import { parseBody } from "./operations.js";

const trimmed = (v: unknown) => (typeof v === "string" ? v.trim() : v);

const isDateString = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());

const dateString = z.preprocess(
  trimmed,
  z
    .string()
    .min(1, "A date is required")
    .refine(isDateString, "Date must be a valid YYYY-MM-DD value")
);

const optionalId = (label: string) =>
  z.preprocess(
    (v) => {
      if (v === undefined || v === null || v === "") return undefined;
      if (typeof v === "number") return v;
      const n = Number(v);
      return Number.isFinite(n) ? n : v;
    },
    z
      .number({ invalid_type_error: `${label} must be a number` })
      .int(`${label} must be an integer`)
      .positive(`${label} must be a positive integer`)
      .optional()
  );

export interface PerformanceQuery {
  fromDate?: string;
  toDate?: string;
  search?: string;
  vehicleId?: number;
}

export interface DriverPerformanceQuery extends PerformanceQuery {
  driverId?: number;
}

export interface SupervisorPerformanceQuery extends PerformanceQuery {
  supervisorId?: number;
}

const baseQuerySchema = z.object({
  fromDate: dateString.optional(),
  toDate: dateString.optional(),
  search: z.preprocess(
    trimmed,
    z.string().max(100, "search must be at most 100 characters").optional()
  ),
  vehicleId: optionalId("vehicleId"),
});

export const driverPerformanceQuerySchema = baseQuerySchema.extend({
  driverId: optionalId("driverId"),
});

export const supervisorPerformanceQuerySchema = baseQuerySchema.extend({
  supervisorId: optionalId("supervisorId"),
});

export { parseBody };