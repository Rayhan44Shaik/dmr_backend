import { useEffect, useState } from 'react';
import { loadVehicles } from '../../masters/vehicles/services/vehicleService';
import type { Vehicle } from '../../masters/vehicles/types/vehicle';
import { handleApiError } from '../../../api/errors';
import { fleetSharedGet } from '../services/fleetSessionCache';

/**
 * Fleet-scoped shared vehicle list.
 *
 * Every Fleet page needs the Vehicle Master list (filters, labels, status).
 * The Masters `useVehicles` hook fires one GET per mounted instance, so
 * opening several Fleet tabs would issue duplicate vehicle requests. This
 * hook deduplicates concurrent loads and caches the list in the Fleet
 * session cache (60s TTL), keeping the Fleet module network-light while the
 * Vehicle Master remains the source of truth.
 */
export function useFleetVehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fleetSharedGet('vehicles:list', () => loadVehicles())
      .then((rows) => {
        if (cancelled) return;
        setVehicles(rows);
        setError(null);
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(handleApiError(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { vehicles, loading, error };
}