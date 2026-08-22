/**
 * Farm bulk-import configuration — uses the transactional bulk create API
 * (addFarmsBulk -> POST /masters/farms/bulk) for the whole batch.
 */
import type { BulkImportConfig } from "../components/bulk-import/bulkImportTypes";
import type { Farm } from "./types/farm";
import type { FarmInput } from "./services/farmService";

export type FarmBulkRow = {
  farmName: string;
  ownerName: string;
  supervisorName: string;
  phoneNumber: string;
  village: string;
  address: string;
  capacity: number;
  status: "Active" | "Inactive";
};

function toFarmPayload(row: FarmBulkRow): FarmInput {
  return {
    farmName: row.farmName.trim(),
    ownerName: row.ownerName.trim(),
    supervisorName: row.supervisorName.trim(),
    phoneNumber: row.phoneNumber.trim(),
    village: row.village.trim(),
    address: row.address.trim(),
    capacity: row.capacity || 0,
    status: row.status,
  };
}

function validateFarmRow(row: FarmBulkRow, existing: Farm[]): string[] {
  const errors: string[] = [];
  const farmName = row.farmName.trim();
  const ownerName = row.ownerName.trim();
  const supervisorName = row.supervisorName.trim();
  const phoneNumber = row.phoneNumber.trim();
  const village = row.village.trim();
  const capacity = Number(row.capacity);

  if (!farmName) errors.push("Farm Name is required.");
  if (!ownerName) errors.push("Owner Name is required.");
  else if (ownerName.length < 3) errors.push("Owner Name must contain at least 3 characters.");
  if (!supervisorName) errors.push("Supervisor Name is required.");
  if (!phoneNumber) errors.push("Mobile Number is required.");
  else if (!/^[0-9]{10}$/.test(phoneNumber)) errors.push("Mobile Number must be exactly 10 digits.");
  if (!village) errors.push("Village is required.");
  if (Number.isNaN(capacity) || capacity <= 0) errors.push("Bird Capacity must be a positive number.");

  const duplicateName = existing.some(
    (f) => f.farmName.trim().toLowerCase() === farmName.toLowerCase()
  );
  if (duplicateName) errors.push("Farm Name already exists.");

  const duplicatePhone = existing.some((f) => f.phoneNumber === phoneNumber);
  if (duplicatePhone) errors.push("Phone Number already exists.");

  return errors;
}

type FarmBulkDeps = {
  /** Wraps the transactional POST /masters/farms/bulk endpoint. */
  addFarmsBulk: (inputs: FarmInput[]) => Promise<unknown>;
  /** Re-fetch the farms list (hook's reload). */
  reload: () => Promise<unknown>;
};

/** Build the full Farm BulkImportConfig wired to the farms hook. */
export function buildFarmBulkImportConfig({
  addFarmsBulk,
  reload,
}: FarmBulkDeps): BulkImportConfig<FarmBulkRow, Farm> {
  return {
    title: "Bulk Import Farms",
    subtitle: "Upload farms in one batch",
    noun: "Farm",
    nounPlural: "Farms",
    filenamePrefix: "Farms",
    columns: [
      { key: "Farm Name", required: true, sample: "Green Valley Farm" },
      { key: "Owner Name", required: true, sample: "Srinivas Rao" },
      { key: "Supervisor Name", required: true, sample: "Mohan Kumar" },
      { key: "Phone", aliases: ["Mobile Number", "Phone Number"], required: true, sample: "9876543211" },
      { key: "Village", required: true, sample: "Palasa" },
      { key: "Bird Capacity", required: true, sample: 5000 },
      { key: "Address", sample: "Old Highway Road" },
      { key: "Status", sample: "Active" },
    ],
    parseRow: (record) => {
      const status = String(record["Status"] ?? "Active").trim();
      return {
        farmName: String(record["Farm Name"] ?? "").trim(),
        ownerName: String(record["Owner Name"] ?? "").trim(),
        supervisorName: String(record["Supervisor Name"] ?? "").trim(),
        phoneNumber: String(record["Phone"] ?? "").trim(),
        village: String(record["Village"] ?? "").trim(),
        address: String(record["Address"] ?? "").trim(),
        capacity: Number(record["Bird Capacity"] ?? 0),
        status: status === "Inactive" ? "Inactive" : "Active",
      };
    },
    validateRow: validateFarmRow,
    duplicateKey: (row) => row.farmName,
    toPayload: toFarmPayload,
    createMany: async (rows, onProgress) => {
      const total = rows.length;
      const payloads = rows.map((r) => toFarmPayload(r.data));
      onProgress(0, total);
      try {
        await addFarmsBulk(payloads);
        onProgress(total, total);
        return { total, attempted: total, imported: total, failed: 0, errors: [] };
      } catch (err) {
        onProgress(total, total);
        return {
          total,
          attempted: total,
          imported: 0,
          failed: total,
          errors: [{
            row: 0,
            message: err instanceof Error ? err.message : "Farm import failed.",
          }],
        };
      }
    },
    refresh: reload,
    errorToString: (err) =>
      err instanceof Error ? err.message : "Import failed. Please try again.",
  };
}