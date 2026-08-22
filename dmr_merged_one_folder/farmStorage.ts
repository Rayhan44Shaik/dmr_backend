// D:\Development\DMR-Poultries-ERP\frontend\dmr-poultries-web\src\modules\masters\storage\farmStorage.ts

import { logAuditEvent } from "../../../utils/securityUtils";
import { StorageWrapper } from "../../../storage/storageWrapper";

const FARM_STORAGE_KEY = "dmr_poultries_farms_master_data";

export type Farm = {
  id: number;
  farmNo: number;
  farmName: string;
  ownerName: string;
  supervisorName: string;
  phoneNumber: string;
  village: string;
  address: string;
  capacity: number;
  status: "Active" | "Inactive";
};

/**
 * Retrieves all stored farm records from offline browser storage using StorageWrapper.
 */
export function getStoredFarms(): Farm[] {
  try {
    const data = StorageWrapper.get<Farm[]>(FARM_STORAGE_KEY);
    if (!data || data.length === 0) {
      // Default initial seed data if nothing is in offline storage yet
      const initialFarms: Farm[] = [
        {
          id: 1,
          farmNo: 1,
          farmName: "Sri Lakshmi Poultry Farm",
          ownerName: "Ramesh Babu",
          supervisorName: "Suresh Kumar",
          phoneNumber: "9848012345",
          village: "Velpur",
          address: "Main Road, Velpur",
          capacity: 5000,
          status: "Active",
        },
        {
          id: 2,
          farmNo: 2,
          farmName: "Venkatadri Egg Layer Farm",
          ownerName: "Venkateswara Rao",
          supervisorName: "Mahesh",
          phoneNumber: "9700123456",
          village: "Tanuku",
          address: "Near Water Tank, Tanuku",
          capacity: 8000,
          status: "Active",
        },
      ];
      persistFarms(initialFarms);
      return initialFarms;
    }
    return data;
  } catch (error) {
    console.error("Failed to parse farms from storage:", error);
    return [];
  }
}

/**
 * Persists the entire list of farm records into offline browser storage securely using StorageWrapper.
 */
export function persistFarms(farms: Farm[]): void {
  try {
    StorageWrapper.set(FARM_STORAGE_KEY, farms);
  } catch (error) {
    console.error("Failed to save farms to storage:", error);
  }
}

/**
 * Saves a single farm (creates a new entry or updates an existing record).
 */
export function saveFarmRecord(
  farmData: Omit<Farm, "id" | "farmNo">,
  existingId?: number
): Farm[] {
  const currentFarms = getStoredFarms();
  let updatedFarms: Farm[];

  if (existingId) {
    updatedFarms = currentFarms.map((farm) =>
      farm.id === existingId ? { ...farm, ...farmData } : farm
    );
    logAuditEvent("UPDATE_FARM_OFFLINE", "Farms", existingId);
  } else {
    const newFarm: Farm = {
      id: Date.now(),
      farmNo: currentFarms.length + 1,
      ...farmData,
    };
    updatedFarms = [...currentFarms, newFarm];
    logAuditEvent("CREATE_FARM_OFFLINE", "Farms", newFarm.id);
  }

  persistFarms(updatedFarms);
  return updatedFarms;
}

/**
 * Deletes a farm record by its unique identifier and re-sequences farm serial numbers.
 */
export function deleteFarmRecord(id: number): Farm[] {
  const currentFarms = getStoredFarms();
  const filtered = currentFarms.filter((farm) => farm.id !== id);

  // Re-index farmNo sequentially
  const resequenced = filtered.map((farm, index) => ({
    ...farm,
    farmNo: index + 1,
  }));

  persistFarms(resequenced);
  logAuditEvent("DELETE_FARM_OFFLINE", "Farms", id);
  return resequenced;
}