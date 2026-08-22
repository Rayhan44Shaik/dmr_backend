/**
 * Vehicle bulk-import configuration — uses the transactional bulk create API
 * (addVehiclesBulk -> POST /masters/vehicles/bulk) for the whole batch,
 * using only fields supported by the current Vehicle contract.
 */
import type { BulkImportConfig } from "../components/bulk-import/bulkImportTypes";
import type { Vehicle } from "./types/vehicle";
import type { VehicleInput } from "./services/vehicleService";

export type VehicleBulkRow = {
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
  purchaseDate: string;
  purchaseAmount?: number;
  emiStartDate: string;
  rcDate: string;
  status: "Active" | "Inactive";
};

function toOptionalNumber(value: unknown): number | undefined {
  if (value === "" || value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
}

function toVehiclePayload(row: VehicleBulkRow): VehicleInput {
  return {
    vehicleNumber: row.vehicleNumber.trim(),
    vehicleType: row.vehicleType.trim(),
    noOfBoxes: row.noOfBoxes || 0,
    birdCapacity: row.birdCapacity || 0,
    capacityKg: row.capacityKg || 0,
    trackingId: row.trackingId.trim(),
    fastagBank: row.fastagBank.trim(),
    engineNumber: row.engineNumber.trim(),
    chassisNumber: row.chassisNumber.trim(),
    insuranceExpiry: row.insuranceExpiry.trim(),
    permitExpiry: row.permitExpiry.trim(),
    fitnessExpiry: row.fitnessExpiry.trim(),
    purchaseDate: row.purchaseDate.trim(),
    purchaseAmount: row.purchaseAmount,
    emiStartDate: row.emiStartDate.trim(),
    rcDate: row.rcDate.trim(),
    status: row.status,
  };
}

function validateVehicleRow(row: VehicleBulkRow, existing: Vehicle[]): string[] {
  const errors: string[] = [];

  const vehicleNumber = row.vehicleNumber.trim();
  const vehicleType = row.vehicleType.trim();
  const engineNumber = row.engineNumber.trim();
  const chassisNumber = row.chassisNumber.trim();
  const noOfBoxes = Number(row.noOfBoxes);
  const birdCapacity = Number(row.birdCapacity);
  const capacityKg = Number(row.capacityKg);

  if (!vehicleNumber) errors.push("Vehicle Number is required.");
  if (!vehicleType) errors.push("Vehicle Type is required.");
  if (Number.isNaN(noOfBoxes) || noOfBoxes <= 0) errors.push("No. of Boxes must be a positive number.");
  if (Number.isNaN(birdCapacity) || birdCapacity <= 0) errors.push("Bird Capacity must be a positive number.");
  if (Number.isNaN(capacityKg) || capacityKg <= 0) errors.push("Capacity (Kg) must be a positive number.");
  if (!engineNumber) errors.push("Engine Number is required.");
  if (!chassisNumber) errors.push("Chassis Number is required.");

  const duplicate = existing.some(
    (v) => v.vehicleNumber.trim().toLowerCase() === vehicleNumber.toLowerCase()
  );
  if (duplicate) errors.push("Vehicle Number already exists.");

  return errors;
}

type VehicleBulkDeps = {
  /** Wraps the transactional POST /masters/vehicles/bulk endpoint. */
  addVehiclesBulk: (inputs: VehicleInput[]) => Promise<unknown>;
  /** Re-fetch the vehicles list (hook's reload). */
  reload: () => Promise<unknown>;
};

/** Build the full Vehicle BulkImportConfig wired to the vehicles hook. */
export function buildVehicleBulkImportConfig({
  addVehiclesBulk,
  reload,
}: VehicleBulkDeps): BulkImportConfig<VehicleBulkRow, Vehicle> {
  return {
    title: "Bulk Import Vehicles",
    subtitle: "Upload vehicles in one batch",
    noun: "Vehicle",
    nounPlural: "Vehicles",
    filenamePrefix: "Vehicles",
    columns: [
      { key: "Vehicle Number", required: true, sample: "AP-01-AB-1234" },
      { key: "Vehicle Type", required: true, sample: "Truck" },
      { key: "Tracking ID", sample: "GPS-0001" },
      { key: "No of Boxes", required: true, sample: 12 },
      { key: "Bird Capacity", required: true, sample: 2000 },
      { key: "Capacity (Kg)", required: true, sample: 5000 },
      { key: "Fastag Bank", sample: "HDFC" },
      { key: "Engine Number", required: true, sample: "EN-8GZ12345" },
      { key: "Chassis Number", required: true, sample: "MA3HZYD1S00123456" },
      { key: "Insurance Expiry", sample: "2026-12-31" },
      { key: "Permit Expiry", sample: "2026-12-31" },
      { key: "Fitness Expiry", sample: "2026-12-31" },
      { key: "Purchase Date", sample: "2025-06-01" },
      { key: "Purchase Amount", sample: 1850000 },
      { key: "EMI Start Date", sample: "2025-07-01" },
      { key: "RC Date", sample: "2025-07-10" },
      { key: "Status", sample: "Active" },
    ],
    parseRow: (record) => {
      const status = String(record["Status"] ?? "Active").trim();
      return {
        vehicleNumber: String(record["Vehicle Number"] ?? "").trim(),
        vehicleType: String(record["Vehicle Type"] ?? "").trim(),
        noOfBoxes: Number(record["No of Boxes"] ?? 0),
        birdCapacity: Number(record["Bird Capacity"] ?? 0),
        capacityKg: Number(record["Capacity (Kg)"] ?? 0),
        trackingId: String(record["Tracking ID"] ?? "").trim(),
        fastagBank: String(record["Fastag Bank"] ?? "").trim(),
        engineNumber: String(record["Engine Number"] ?? "").trim(),
        chassisNumber: String(record["Chassis Number"] ?? "").trim(),
        insuranceExpiry: String(record["Insurance Expiry"] ?? "").trim(),
        permitExpiry: String(record["Permit Expiry"] ?? "").trim(),
        fitnessExpiry: String(record["Fitness Expiry"] ?? "").trim(),
        purchaseDate: String(record["Purchase Date"] ?? "").trim(),
        purchaseAmount: toOptionalNumber(record["Purchase Amount"]),
        emiStartDate: String(record["EMI Start Date"] ?? "").trim(),
        rcDate: String(record["RC Date"] ?? "").trim(),
        status: status === "Inactive" ? "Inactive" : "Active",
      };
    },
    validateRow: validateVehicleRow,
    duplicateKey: (row) => row.vehicleNumber,
    toPayload: toVehiclePayload,
    createMany: async (rows, onProgress) => {
      const total = rows.length;
      const payloads = rows.map((r) => toVehiclePayload(r.data));
      onProgress(0, total);
      try {
        await addVehiclesBulk(payloads);
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
            message: err instanceof Error ? err.message : "Vehicle import failed.",
          }],
        };
      }
    },
    refresh: reload,
    errorToString: (err) =>
      err instanceof Error ? err.message : "Import failed. Please try again.",
  };
}