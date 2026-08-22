// D:\Development\DMR-Poultries-ERP\frontend\dmr-poultries-web\src\modules\masters\storage\birdTypeStorage.ts

import { logAuditEvent } from "../../../utils/securityUtils";
import { StorageWrapper } from "../../../storage/storageWrapper";

const BIRD_TYPE_STORAGE_KEY = "dmr_poultries_bird_types_master_data";

export type BirdType = {
  id: number;
  birdTypeNo: number;
  birdType: string;
  averageWeight: number;
  description: string;
  status: "Active" | "Inactive";
};

/**
 * Retrieves all stored bird type records from offline browser storage using StorageWrapper.
 */
export function getStoredBirdTypes(): BirdType[] {
  try {
    const data = StorageWrapper.get<BirdType[]>(BIRD_TYPE_STORAGE_KEY);
    if (!data || data.length === 0) {
      // Default initial seed data if nothing is in offline storage yet
      const initialBirdTypes: BirdType[] = [
        {
          id: 1,
          birdTypeNo: 1,
          birdType: "BV-380 Layer",
          averageWeight: 1.8,
          description: "High-yielding commercial egg layer breed",
          status: "Active",
        },
        {
          id: 2,
          birdTypeNo: 2,
          birdType: "Cobb 400 Broiler",
          averageWeight: 2.4,
          description: "Fast-growing broiler chicken breed",
          status: "Active",
        },
      ];
      persistBirdTypes(initialBirdTypes);
      return initialBirdTypes;
    }
    return data;
  } catch (error) {
    console.error("Failed to parse bird types from storage:", error);
    return [];
  }
}

/**
 * Persists the entire list of bird type records into offline browser storage securely using StorageWrapper.
 */
export function persistBirdTypes(birdTypes: BirdType[]): void {
  try {
    StorageWrapper.set(BIRD_TYPE_STORAGE_KEY, birdTypes);
  } catch (error) {
    console.error("Failed to save bird types to storage:", error);
  }
}

/**
 * Saves a single bird type (creates a new entry or updates an existing record).
 */
export function saveBirdTypeRecord(
  birdTypeData: Omit<BirdType, "id" | "birdTypeNo">,
  existingId?: number
): BirdType[] {
  const currentBirdTypes = getStoredBirdTypes();
  let updatedBirdTypes: BirdType[];

  if (existingId) {
    updatedBirdTypes = currentBirdTypes.map((bt) =>
      bt.id === existingId ? { ...bt, ...birdTypeData } : bt
    );
    logAuditEvent("UPDATE_BIRD_TYPE_OFFLINE", "BirdTypes", existingId);
  } else {
    const newBirdType: BirdType = {
      id: Date.now(),
      birdTypeNo: currentBirdTypes.length + 1,
      ...birdTypeData,
    };
    updatedBirdTypes = [...currentBirdTypes, newBirdType];
    logAuditEvent("CREATE_BIRD_TYPE_OFFLINE", "BirdTypes", newBirdType.id);
  }

  persistBirdTypes(updatedBirdTypes);
  return updatedBirdTypes;
}

/**
 * Deletes a bird type record by its unique identifier and re-sequences serial numbers.
 */
export function deleteBirdTypeRecord(id: number): BirdType[] {
  const currentBirdTypes = getStoredBirdTypes();
  const filtered = currentBirdTypes.filter((bt) => bt.id !== id);

  // Re-index birdTypeNo sequentially
  const resequenced = filtered.map((bt, index) => ({
    ...bt,
    birdTypeNo: index + 1,
  }));

  persistBirdTypes(resequenced);
  logAuditEvent("DELETE_BIRD_TYPE_OFFLINE", "BirdTypes", id);
  return resequenced;
}