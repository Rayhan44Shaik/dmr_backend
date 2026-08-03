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

export function dateOnly(value: unknown): string | null {
  if (!value) return null;
  const s = String(value);
  return s.slice(0, 10);
}

export function isoOrNull(value: unknown): string | null {
  if (!value) return null;
  return new Date(String(value)).toISOString();
}
