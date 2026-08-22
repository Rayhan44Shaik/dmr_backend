import { useEffect, useState } from "react";
import { reverseGeocode } from "../utils/reverseGeocode";

export type AddressStatus = "idle" | "resolving" | "resolved" | "failed";

export interface ReverseGeocodedAddress {
  status: AddressStatus;
  address: string | null;
}

/** Resolves a single (lat, lon) pair to an address once. Re-resolves whenever
 * the coordinates change. */
export function useReverseGeocodedAddress(
  lat?: number | string | null,
  lon?: number | string | null
): ReverseGeocodedAddress {
  const latNum = lat === undefined || lat === null || lat === "" ? null : Number(lat);
  const lonNum = lon === undefined || lon === null || lon === "" ? null : Number(lon);
  const [state, setState] = useState<ReverseGeocodedAddress>({
    status: latNum === null || lonNum === null || !Number.isFinite(latNum) || !Number.isFinite(lonNum) ? "idle" : "resolving",
    address: null,
  });

  useEffect(() => {
    let cancelled = false;
    if (latNum === null || lonNum === null || !Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
      setState({ status: "idle", address: null });
      return;
    }
    setState({ status: "resolving", address: null });
    reverseGeocode(latNum, lonNum).then(({ address, error }) => {
      if (cancelled) return;
      setState({ status: error ? "failed" : "resolved", address });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latNum, lonNum]);

  return state;
}
