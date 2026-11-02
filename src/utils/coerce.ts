export function num(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function str(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

/** Parse a stored "lat,lon" pair (trip diesel bunk_gps / fuel bunk_address). */
export function parseCoordPair(value: unknown): { lat: number; lon: number } | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const match = text.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat === 0 && lon === 0) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function dateOnly(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // node-postgres parses `date` columns as JS Dates at LOCAL midnight, so
    // use local date components (not toISOString) to avoid a UTC off-by-one.
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
  }
  return s.slice(0, 10);
}

/**
 * Convert a Date / ISO / epoch value to an ISO-8601 timestamptz string.
 * Always use this (never Date.toString() / String(date)) when writing to
 * PostgreSQL — locale forms like "GMT+0530" make PG throw 22023 and surface
 * as an opaque 500.
 */
export function isoOrNull(value: unknown): string | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
