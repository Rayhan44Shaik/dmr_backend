// modules/fleet-operations/hooks/useFuelKMValidator.ts
import { useMemo } from 'react';
import { useFuelExpenses } from './useFuelExpenses';
import type { FuelExpense } from '../types/fuelExpense';

interface FuelKMValidator {
  /** The latest approved KM (meter reading) or null if none exists */
  latestApprovedKM: number | null;
  /** True if there is at least one pending fuel bill for the vehicle */
  hasPendingFuel: boolean;
  /**
   * Validates if a given KM is >= the latest approved KM.
   * Returns { valid: boolean; message?: string }
   */
  validateKM: (km: number) => { valid: boolean; message?: string };
  /** Returns a warning message if there is a pending fuel bill, else null */
  getPendingWarning: () => string | null;
}

/**
 * Hook to validate KM inputs against the latest approved fuel expense
 * and to warn about pending fuel bills for a specific vehicle.
 * @param vehicleNumber - The vehicle number (e.g., "AP-02-CD-5678")
 */
export function useFuelKMValidator(vehicleNumber: string): FuelKMValidator {
  // Dummy notification function – the hook doesn't need to show notifications itself
  const dummyNotify = () => {};
  const { filteredData: fuelExpenses } = useFuelExpenses(dummyNotify);

  // Filter expenses for this vehicle
  const vehicleExpenses = useMemo(
    () => (fuelExpenses || []).filter((e: FuelExpense) => e.vehicleNo === vehicleNumber),
    [fuelExpenses, vehicleNumber]
  );

  // Find the latest approved KM
  const latestApprovedKM = useMemo(() => {
    const approved = vehicleExpenses.filter((e: FuelExpense) => e.status === 'Approved');
    if (approved.length === 0) return null;
    // Get the one with the highest meterReading (or latest date)
    return approved.reduce((max: number, e: FuelExpense) =>
      e.meterReading > max ? e.meterReading : max, 0
    );
  }, [vehicleExpenses]);

  // Check for pending bills
  const hasPendingFuel = useMemo(() => {
    return vehicleExpenses.some((e: FuelExpense) => e.status === 'Pending');
  }, [vehicleExpenses]);

  // Validation function
  const validateKM = (km: number): { valid: boolean; message?: string } => {
    if (latestApprovedKM === null) {
      return { valid: true }; // No reference KM – any value is acceptable
    }
    if (km < latestApprovedKM) {
      return {
        valid: false,
        message: `KM cannot be less than the last approved fuel bill reading (${latestApprovedKM.toLocaleString()} km).`,
      };
    }
    return { valid: true };
  };

  // Warning message for pending fuel
  const getPendingWarning = (): string | null => {
    if (hasPendingFuel) {
      return `There is a pending fuel bill for ${vehicleNumber}. Please approve it before recording a new trip or maintenance.`;
    }
    return null;
  };

  return {
    latestApprovedKM,
    hasPendingFuel,
    validateKM,
    getPendingWarning,
  };
}