const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function parseUtcDate(tripDate: string | null | undefined): Date | null {
  if (tripDate == null) return null;
  const raw = String(tripDate).trim();
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!iso) return null;
  const year = Number(iso[1]);
  const month = Number(iso[2]);
  const day = Number(iso[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }
  return utc;
}

/**
 * Display weekday for Trip List from the stored PostgreSQL trip_date
 * (YYYY-MM-DD calendar date). Uses UTC calendar parts so the weekday is
 * not shifted by the browser timezone.
 */
export function formatTripListDay(tripDate: string | null | undefined): string {
  const utc = parseUtcDate(tripDate);
  if (!utc) return "—";
  return WEEKDAYS_SHORT[utc.getUTCDay()];
}

/** Recent Trips: weekday only (e.g. `Wednesday`) from the stored trip date. */
export function formatTripRecentDateWithDay(tripDate: string | null | undefined): string {
  const utc = parseUtcDate(tripDate);
  if (!utc) return "—";
  return WEEKDAYS[utc.getUTCDay()];
}
