// D:\Development\DMR-Poultries-ERP\frontend\dmr-poultries-web\src\modules\masters\storage\bankStorage.ts

import { logAuditEvent } from "../../../utils/securityUtils";
import { StorageWrapper } from "../../../storage/storageWrapper";

const BANK_STORAGE_KEY = "dmr_poultries_banks_master_data";

export type Bank = {
  id: number;
  bankNo: number;
  bankName: string;
  branch: string;
  accountNumber: string;
  ifscCode: string;
  upiId: string;
  status: "Active" | "Inactive";
};

/**
 * Retrieves all stored bank records from offline browser storage using StorageWrapper.
 */
export function getStoredBanks(): Bank[] {
  try {
    const data = StorageWrapper.get<Bank[]>(BANK_STORAGE_KEY);
    if (!data || data.length === 0) {
      // Default initial seed data if nothing is in offline storage yet
      const initialBanks: Bank[] = [
        {
          id: 1,
          bankNo: 1,
          bankName: "State Bank of India",
          branch: "Tanuku",
          accountNumber: "38123456789",
          ifscCode: "SBIN0001234",
          upiId: "sbi.tanuku@ybl",
          status: "Active",
        },
        {
          id: 2,
          bankNo: 2,
          bankName: "HDFC Bank",
          branch: "Velpur",
          accountNumber: "50100234567890",
          ifscCode: "HDFC0005678",
          upiId: "hdfc.velpur@paytm",
          status: "Active",
        },
      ];
      persistBanks(initialBanks);
      return initialBanks;
    }
    return data;
  } catch (error) {
    console.error("Failed to parse banks from storage:", error);
    return [];
  }
}

/**
 * Persists the entire list of bank records into offline browser storage securely using StorageWrapper.
 */
export function persistBanks(banks: Bank[]): void {
  try {
    StorageWrapper.set(BANK_STORAGE_KEY, banks);
  } catch (error) {
    console.error("Failed to save banks to storage:", error);
  }
}

/**
 * Saves a single bank (creates a new entry or updates an existing record).
 */
export function saveBankRecord(
  bankData: Omit<Bank, "id" | "bankNo">,
  existingId?: number
): Bank[] {
  const currentBanks = getStoredBanks();
  let updatedBanks: Bank[];

  if (existingId) {
    updatedBanks = currentBanks.map((bank) =>
      bank.id === existingId ? { ...bank, ...bankData } : bank
    );
    logAuditEvent("UPDATE_BANK_OFFLINE", "Banks", existingId);
  } else {
    const newBank: Bank = {
      id: Date.now(),
      bankNo: currentBanks.length + 1,
      ...bankData,
    };
    updatedBanks = [...currentBanks, newBank];
    logAuditEvent("CREATE_BANK_OFFLINE", "Banks", newBank.id);
  }

  persistBanks(updatedBanks);
  return updatedBanks;
}

/**
 * Deletes a bank record by its unique identifier and re-sequences bank serial numbers.
 */
export function deleteBankRecord(id: number): Bank[] {
  const currentBanks = getStoredBanks();
  const filtered = currentBanks.filter((bank) => bank.id !== id);

  // Re-index bankNo sequentially
  const resequenced = filtered.map((bank, index) => ({
    ...bank,
    bankNo: index + 1,
  }));

  persistBanks(resequenced);
  logAuditEvent("DELETE_BANK_OFFLINE", "Banks", id);
  return resequenced;
}