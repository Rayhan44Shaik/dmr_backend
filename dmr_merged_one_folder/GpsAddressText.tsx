import { useReverseGeocodedAddress } from "../hooks/useReverseGeocodedAddress";

/** Resolves coordinates to a human-readable address (Nominatim). Shows
 * "Locating..." while resolving and falls back to a neutral label if the
 * lookup fails — coordinates are never fabricated. */
export function GpsAddressText({
  lat,
  lon,
  fallback = "Location captured",
  className,
}: {
  lat?: number | string | null;
  lon?: number | string | null;
  fallback?: string;
  className?: string;
}) {
  const { status, address } = useReverseGeocodedAddress(lat, lon);
  if (status === "resolving") {
    return <span className={className}>Locating...</span>;
  }
  if (status === "failed") {
    return <span className={className}>{fallback}</span>;
  }
  return <span className={className}>{address || fallback}</span>;
}