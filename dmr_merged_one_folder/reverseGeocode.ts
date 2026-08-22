const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";

export interface ReverseGeocodeResult {
  address: string | null;
  error: boolean;
}

/** Reverse-geocodes coordinates to a human-readable address using Nominatim.
 * Never throws: on failure it returns `{ address: null, error: true }` so the
 * UI can fall back to "Location captured". */
export async function reverseGeocode(
  lat: number,
  lon: number,
  timeoutMs = 8000
): Promise<ReverseGeocodeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `${NOMINATIM_URL}?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&addressdetails=1`,
      {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      }
    );
    if (!res.ok) return { address: null, error: true };
    const data = await res.json();
    const name: unknown = data?.display_name ?? data?.name;
    if (typeof name === "string" && name.trim()) {
      return { address: name.trim(), error: false };
    }
    return { address: null, error: false };
  } catch {
    return { address: null, error: true };
  } finally {
    clearTimeout(timeout);
  }
}
