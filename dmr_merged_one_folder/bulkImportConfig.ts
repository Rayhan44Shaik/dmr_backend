/**
 * Bird Type bulk-import configuration — uses the transactional bulk create API
 * (addBirdTypesBulk -> POST /masters/bird-types/bulk) for the whole batch.
 */
import type { BulkImportConfig } from "../components/bulk-import/bulkImportTypes";
import type { BirdType } from "./types/birdType";
import type { BirdTypeInput } from "./services/birdTypeService";

export type BirdTypeBulkRow = {
  birdType: string;
  averageWeight: number;
  description: string;
  status: "Active" | "Inactive";
};

function toBirdTypePayload(row: BirdTypeBulkRow): BirdTypeInput {
  return {
    birdType: row.birdType.trim(),
    averageWeight: row.averageWeight || 0,
    description: row.description.trim(),
    status: row.status,
  };
}

function validateBirdTypeRow(row: BirdTypeBulkRow, existing: BirdType[]): string[] {
  const errors: string[] = [];
  const name = row.birdType.trim();
  const averageWeight = Number(row.averageWeight);

  if (!name) errors.push("Bird Type is required.");
  if (Number.isNaN(averageWeight) || averageWeight <= 0) {
    errors.push("Average Weight must be a positive number.");
  }

  const duplicate = existing.some(
    (bt) => bt.birdType.trim().toLowerCase() === name.toLowerCase()
  );
  if (duplicate) errors.push("Bird Type already exists.");

  return errors;
}

type BirdTypeBulkDeps = {
  /** Wraps the transactional POST /masters/bird-types/bulk endpoint. */
  addBirdTypesBulk: (inputs: BirdTypeInput[]) => Promise<unknown>;
  /** Re-fetch the bird types list (hook's reload). */
  reload: () => Promise<unknown>;
};

/** Build the full Bird Type BulkImportConfig wired to the bird-types hook. */
export function buildBirdTypeBulkImportConfig({
  addBirdTypesBulk,
  reload,
}: BirdTypeBulkDeps): BulkImportConfig<BirdTypeBulkRow, BirdType> {
  return {
    title: "Bulk Import Bird Types",
    subtitle: "Upload bird types in one batch",
    noun: "Bird Type",
    nounPlural: "Bird Types",
    filenamePrefix: "BirdTypes",
    columns: [
      { key: "Bird Type", required: true, sample: "Broiler" },
      { key: "Average Weight (Kg)", required: true, sample: 1.5 },
      { key: "Description", sample: "Fast-growing commercial broiler" },
      { key: "Status", sample: "Active" },
    ],
    parseRow: (record) => {
      const status = String(record["Status"] ?? "Active").trim();
      return {
        birdType: String(record["Bird Type"] ?? "").trim(),
        averageWeight: Number(record["Average Weight (Kg)"] ?? 0),
        description: String(record["Description"] ?? "").trim(),
        status: status === "Inactive" ? "Inactive" : "Active",
      };
    },
    validateRow: validateBirdTypeRow,
    duplicateKey: (row) => row.birdType,
    toPayload: toBirdTypePayload,
    createMany: async (rows, onProgress) => {
      const total = rows.length;
      const payloads = rows.map((r) => toBirdTypePayload(r.data));
      onProgress(0, total);
      try {
        await addBirdTypesBulk(payloads);
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
            message: err instanceof Error ? err.message : "Bird Type import failed.",
          }],
        };
      }
    },
    refresh: reload,
    errorToString: (err) =>
      err instanceof Error ? err.message : "Import failed. Please try again.",
  };
}