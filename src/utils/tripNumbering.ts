import { AppError } from "../middleware/errorHandler.js";
import { isValidDateOnly } from "./dateValidation.js";

/** Business calendar used for trip dates / numbering (India ops). */
export const TRIP_BUSINESS_TIMEZONE = "Asia/Kolkata";

const TRIP_NO_RE = /^TR-\d{8}-\d{3}$/;

/** Inclusive bounds relative to business "today". */
export const TRIP_DATE_MAX_FUTURE_DAYS = 14;
export const TRIP_DATE_MAX_PAST_DAYS = 730;

/** Local calendar YYYY-MM-DD in the trip business timezone (not UTC). */
export function businessTodayDateOnly(
  timeZone: string = TRIP_BUSINESS_TIMEZONE,
  now: Date = new Date()
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Shift a YYYY-MM-DD by whole days using UTC noon to avoid DST edge cases. */
export function shiftDateOnly(dateOnly: string, days: number): string {
  const [y, m, d] = dateOnly.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(
    utc.getUTCDate()
  ).padStart(2, "0")}`;
}

export function formatTripNo(tripDate: string, sequence: number): string {
  if (!isValidDateOnly(tripDate)) {
    throw new AppError(422, "Trip date must be a valid YYYY-MM-DD date.");
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999) {
    throw new AppError(422, "Trip sequence must be between 001 and 999.");
  }
  const ymd = tripDate.replace(/-/g, "");
  return `TR-${ymd}-${String(sequence).padStart(3, "0")}`;
}

export function isCanonicalTripNo(tripNo: string): boolean {
  return TRIP_NO_RE.test(tripNo);
}

/**
 * Resolve and validate the business trip date used for numbering.
 * Required on create; falls back to business today only when omitted.
 */
export function resolveTripDateForNumbering(
  raw: unknown,
  options: { required?: boolean; today?: string } = {}
): string {
  const today = options.today ?? businessTodayDateOnly();
  const value =
    typeof raw === "string" && raw.trim()
      ? raw.trim().slice(0, 10)
      : options.required
        ? null
        : today;

  if (!value) {
    throw new AppError(422, "Trip date is required.");
  }
  if (!isValidDateOnly(value)) {
    throw new AppError(422, "Trip date must be a valid YYYY-MM-DD date.");
  }

  const min = shiftDateOnly(today, -TRIP_DATE_MAX_PAST_DAYS);
  const max = shiftDateOnly(today, TRIP_DATE_MAX_FUTURE_DAYS);
  if (value < min || value > max) {
    throw new AppError(
      422,
      `Trip date must be between ${min} and ${max} (business calendar).`
    );
  }
  return value;
}
