import { useCallback, useEffect, useState } from 'react';
import { fuelExpenseService } from '../../operations/fuel-expenses/services/fuelExpenseService';

/**
 * KM / pending-fuel checks for Maintenance Entry.
 * Does not fetch until a vehicle is selected, and never loads the full
 * Operations Fuel Expenses page dataset on Fleet first paint.
 */
export function useFleetFuelKmGuard(vehicleNumber: string) {
  const [latestApprovedKM, setLatestApprovedKM] = useState<number | null>(null);
  const [hasPendingFuel, setHasPendingFuel] = useState(false);

  useEffect(() => {
    const vehicle = vehicleNumber.trim();
    if (!vehicle) {
      setLatestApprovedKM(null);
      setHasPendingFuel(false);
      return;
    }

    let cancelled = false;
    void fuelExpenseService
      .list({ vehicleNo: vehicle, page: 1, limit: 50 })
      .then((result) => {
        if (cancelled) return;
        const rows = result.data || [];
        const approved = rows.filter((row) => row.status === 'Approved');
        const maxKm = approved.reduce(
          (max, row) => (row.meterReading > max ? row.meterReading : max),
          0
        );
        setLatestApprovedKM(approved.length ? maxKm : null);
        setHasPendingFuel(rows.some((row) => row.status === 'Pending'));
      })
      .catch(() => {
        if (cancelled) return;
        setLatestApprovedKM(null);
        setHasPendingFuel(false);
      });

    return () => {
      cancelled = true;
    };
  }, [vehicleNumber]);

  const validateKM = useCallback(
    (km: number): { valid: boolean; message?: string } => {
      if (latestApprovedKM === null) return { valid: true };
      if (km < latestApprovedKM) {
        return {
          valid: false,
          message: `KM cannot be less than the last approved fuel bill reading (${latestApprovedKM.toLocaleString()} km).`,
        };
      }
      return { valid: true };
    },
    [latestApprovedKM]
  );

  const pendingWarning =
    hasPendingFuel && vehicleNumber.trim()
      ? `There is a pending fuel bill for ${vehicleNumber}. Please approve it before recording a new trip or maintenance.`
      : null;

  return { latestApprovedKM, hasPendingFuel, validateKM, pendingWarning };
}
