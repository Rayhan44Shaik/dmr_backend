// D:\Development\DMR-Poultries-ERP\frontend\dmr-poultries-web\src\modules\masters\storage\vehicleStorage.ts

import { logAuditEvent } from "../../../utils/securityUtils";
import { StorageWrapper } from "../../../storage/storageWrapper";

const VEHICLE_STORAGE_KEY = "dmr_poultries_vehicles_master_data";

export type Vehicle = {
  id: number;
  vehicleNo: number;
  vehicleNumber: string;
  vehicleType: string;
  noOfBoxes: number;
  birdCapacity: number;
  capacityKg: number;
  trackingId: string;
  fastagBank: string;
  engineNumber: string;
  chassisNumber: string;
  insuranceExpiry: string;
  permitExpiry: string;
  fitnessExpiry: string;
  status: "Active" | "Inactive";
};

/**
 * Retrieves all stored vehicle records from offline browser storage using StorageWrapper.
 */
export function getStoredVehicles(): Vehicle[] {
  try {
    const data = StorageWrapper.get<Vehicle[]>(VEHICLE_STORAGE_KEY);
    if (!data || data.length === 0) {
      // Default initial seed data if nothing is in offline storage yet
      const initialVehicles: Vehicle[] = [
        {
          id: 1,
          vehicleNo: 1,
          vehicleNumber: "AP09TE1234",
          vehicleType: "Tata Ace",
          noOfBoxes: 40,
          birdCapacity: 500,
          capacityKg: 750,
          trackingId: "TRK-981234",
          fastagBank: "ICICI Bank",
          engineNumber: "ENG987654321",
          chassisNumber: "CHS123456789",
          insuranceExpiry: "2027-05-15",
          permitExpiry: "2028-01-10",
          fitnessExpiry: "2027-11-20",
          status: "Active",
        },
        {
          id: 2,
          vehicleNo: 2,
          vehicleNumber: "AP37BW5678",
          vehicleType: "Mahindra Bolero Pickup",
          noOfBoxes: 60,
          birdCapacity: 800,
          capacityKg: 1200,
          trackingId: "TRK-985678",
          fastagBank: "HDFC Bank",
          engineNumber: "ENG123456789",
          chassisNumber: "CHS987654321",
          insuranceExpiry: "2026-09-12",
          permitExpiry: "2029-03-01",
          fitnessExpiry: "2026-10-05",
          status: "Active",
        },
      ];
      persistVehicles(initialVehicles);
      return initialVehicles;
    }
    return data;
  } catch (error) {
    console.error("Failed to parse vehicles from storage:", error);
    return [];
  }
}

/**
 * Persists the entire list of vehicle records into offline browser storage securely using StorageWrapper.
 */
export function persistVehicles(vehicles: Vehicle[]): void {
  try {
    StorageWrapper.set(VEHICLE_STORAGE_KEY, vehicles);
  } catch (error) {
    console.error("Failed to save vehicles to storage:", error);
  }
}

/**
 * Saves a single vehicle (creates a new entry or updates an existing record).
 */
export function saveVehicleRecord(
  vehicleData: Omit<Vehicle, "id" | "vehicleNo">,
  existingId?: number
): Vehicle[] {
  const currentVehicles = getStoredVehicles();
  let updatedVehicles: Vehicle[];

  if (existingId) {
    updatedVehicles = currentVehicles.map((v) =>
      v.id === existingId ? { ...v, ...vehicleData } : v
    );
    logAuditEvent("UPDATE_VEHICLE_OFFLINE", "Vehicles", existingId);
  } else {
    const newVehicle: Vehicle = {
      id: Date.now(),
      vehicleNo: currentVehicles.length + 1,
      ...vehicleData,
    };
    updatedVehicles = [...currentVehicles, newVehicle];
    logAuditEvent("CREATE_VEHICLE_OFFLINE", "Vehicles", newVehicle.id);
  }

  persistVehicles(updatedVehicles);
  return updatedVehicles;
}

/**
 * Deletes a vehicle record by its unique identifier and re-sequences vehicle serial numbers.
 */
export function deleteVehicleRecord(id: number): Vehicle[] {
  const currentVehicles = getStoredVehicles();
  const filtered = currentVehicles.filter((v) => v.id !== id);

  // Re-index vehicleNo sequentially
  const resequenced = filtered.map((v, index) => ({
    ...v,
    vehicleNo: index + 1,
  }));

  persistVehicles(resequenced);
  logAuditEvent("DELETE_VEHICLE_OFFLINE", "Vehicles", id);
  return resequenced;
}