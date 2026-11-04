export declare function num(value: unknown, fallback?: number): number;
export declare function numOrNull(value: unknown): number | null;
export declare function str(value: unknown, fallback?: string): string;
/** Parse a stored "lat,lon" pair (trip diesel bunk_gps / fuel bunk_address). */
export declare function parseCoordPair(value: unknown): {
    lat: number;
    lon: number;
} | null;
export declare function dateOnly(value: unknown): string | null;
/**
 * Convert a Date / ISO / epoch value to an ISO-8601 timestamptz string.
 * Always use this (never Date.toString() / String(date)) when writing to
 * PostgreSQL — locale forms like "GMT+0530" make PG throw 22023 and surface
 * as an opaque 500.
 */
export declare function isoOrNull(value: unknown): string | null;
