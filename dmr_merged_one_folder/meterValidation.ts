export function meterMustBeGreaterThan(min: number): string {
  return `Meter reading must be greater than ${min}.`;
}

export function isMeterInvalid(value: unknown, previous: number): boolean {
  if (value === "" || value == null) return false;
  const n = Number(value);
  if (!Number.isFinite(n) || previous <= 0) return false;
  return n <= previous;
}
