/**
 * Vehicles master — PostgreSQL ONLY via shared Axios helpers.
 * Static/mock arrays and localStorage are not used as a data source.
 */

import {
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  handleApiError,
} from "../../../../api";
import type { Vehicle } from "../types/vehicle";

const VEHICLES_PATH = "/masters/vehicles";

/** Legacy browser keys that previously held mock vehicle lists. */
const LEGACY_STORAGE_KEYS = [
  "dmr-vehicles",
  "dmr_poultries_vehicles_master_data",
] as const;

/** Cache filled exclusively by GET /api/masters/vehicles. */
let vehiclesCache: Vehicle[] = [];

export type VehicleInput = Omit<Vehicle, "id" | "vehicleNo"> & {
  vehicleNo?: number;
  emiDay?: number;
  totalEMIs?: number;
};

function clearLegacyVehicleStorage(): void {
  try {
    for (const key of LEGACY_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore storage access errors */
  }
}

function normalizeStatus(status: unknown): Vehicle["status"] {
  return status === "Active" ? "Active" : "Inactive";
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
}

function toOptionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const s = String(value);
  return s === "" ? undefined : s;
}

function mapVehicle(raw: Record<string, unknown>): Vehicle {
  const mapped: Vehicle & { emiDay?: number; totalEMIs?: number } = {
    id: Number(raw.id),
    vehicleNo: Number(raw.vehicleNo ?? raw.vehicle_no ?? 0),
    vehicleNumber: String(raw.vehicleNumber ?? raw.vehicle_number ?? ""),
    vehicleType: String(raw.vehicleType ?? raw.vehicle_type ?? ""),
    noOfBoxes: Number(raw.noOfBoxes ?? raw.no_of_boxes ?? 0),
    birdCapacity: Number(raw.birdCapacity ?? raw.bird_capacity ?? 0),
    capacityKg: Number(raw.capacityKg ?? raw.capacity_kg ?? 0),
    trackingId: String(raw.trackingId ?? raw.tracking_id ?? ""),
    fastagBank: String(raw.fastagBank ?? raw.fastag_bank ?? ""),
    engineNumber: String(raw.engineNumber ?? raw.engine_number ?? ""),
    chassisNumber: String(raw.chassisNumber ?? raw.chassis_number ?? ""),
    insuranceExpiry: String(raw.insuranceExpiry ?? raw.insurance_expiry ?? ""),
    permitExpiry: String(raw.permitExpiry ?? raw.permit_expiry ?? ""),
    fitnessExpiry: String(raw.fitnessExpiry ?? raw.fitness_expiry ?? ""),
    purchaseDate: toOptionalString(raw.purchaseDate ?? raw.purchase_date),
    purchaseAmount: toOptionalNumber(raw.purchaseAmount ?? raw.purchase_amount),
    emiStartDate: toOptionalString(raw.emiStartDate ?? raw.emi_start_date),
    rcDate: toOptionalString(raw.rcDate ?? raw.rc_date),
    status: normalizeStatus(raw.status),
  };

  const emiDay = toOptionalNumber(raw.emiDay ?? raw.emi_day);
  const totalEMIs = toOptionalNumber(raw.totalEMIs ?? raw.total_emis);
  if (emiDay !== undefined) mapped.emiDay = emiDay;
  if (totalEMIs !== undefined) mapped.totalEMIs = totalEMIs;

  return mapped;
}

function toPayload(input: VehicleInput | Partial<Vehicle> & { emiDay?: number; totalEMIs?: number }): Record<string, unknown> {
  return {
    vehicleNo: input.vehicleNo,
    vehicleNumber: input.vehicleNumber?.trim(),
    vehicleType: input.vehicleType?.trim() ?? "",
    noOfBoxes: Number(input.noOfBoxes ?? 0),
    birdCapacity: Number(input.birdCapacity ?? 0),
    capacityKg: Number(input.capacityKg ?? 0),
    trackingId: input.trackingId?.trim() ?? "",
    fastagBank: input.fastagBank?.trim() ?? "",
    engineNumber: input.engineNumber?.trim() ?? "",
    chassisNumber: input.chassisNumber?.trim() ?? "",
    insuranceExpiry: input.insuranceExpiry ?? "",
    permitExpiry: input.permitExpiry ?? "",
    fitnessExpiry: input.fitnessExpiry ?? "",
    purchaseDate: input.purchaseDate ?? "",
    purchaseAmount: input.purchaseAmount,
    emiStartDate: input.emiStartDate ?? "",
    emiDay: (input as { emiDay?: number }).emiDay,
    totalEMIs: (input as { totalEMIs?: number }).totalEMIs,
    rcDate: input.rcDate ?? "",
    status: input.status ?? "Active",
  };
}

function setCacheFromApi(rows: Record<string, unknown>[] | null | undefined): Vehicle[] {
  vehiclesCache = Array.isArray(rows) ? rows.map(mapVehicle) : [];
  return vehiclesCache;
}

/** Sync snapshot for other modules — reflects last successful API load only. */
export function getVehicles(): Vehicle[] {
  return vehiclesCache;
}

/**
 * @deprecated Do not use for Vehicles UI. Mutations must go through API helpers.
 */
export function saveVehicles(_vehicles: Vehicle[]): void {
  // Intentionally no-op. Cache is API-owned.
  void _vehicles;
}

/** GET /api/masters/vehicles — sole source of truth for the Vehicles table. */
export async function loadVehicles(): Promise<Vehicle[]> {
  clearLegacyVehicleStorage();
  const { data } = await apiGet<Record<string, unknown>[]>(VEHICLES_PATH);
  return setCacheFromApi(data);
}

/** POST /api/masters/vehicles */
export async function createVehicle(input: VehicleInput): Promise<Vehicle> {
  clearLegacyVehicleStorage();
  const { data } = await apiPost<Record<string, unknown>>(
    VEHICLES_PATH,
    toPayload(input)
  );
  return mapVehicle(data);
}

/** POST /api/masters/vehicles/bulk — Upload multiple vehicles from Excel */
export async function bulkCreateVehicles(inputs: VehicleInput[]): Promise<Vehicle[]> {
  clearLegacyVehicleStorage();
  const payload = inputs.map(toPayload);
  const { data } = await apiPost<Record<string, unknown>[]>(
    `${VEHICLES_PATH}/bulk`,
    payload
  );
  return Array.isArray(data) ? data.map(mapVehicle) : [];
}

/** PUT /api/masters/vehicles/:id */
export async function updateVehicle(
  id: number,
  input: VehicleInput | Partial<Vehicle>
): Promise<Vehicle> {
  clearLegacyVehicleStorage();
  const { data } = await apiPut<Record<string, unknown>>(
    `${VEHICLES_PATH}/${id}`,
    toPayload({ ...(input as VehicleInput), vehicleNo: input.vehicleNo })
  );
  return mapVehicle(data);
}

/** DELETE /api/masters/vehicles/:id */
export async function deleteVehicle(id: number): Promise<void> {
  clearLegacyVehicleStorage();
  await apiDelete(`${VEHICLES_PATH}/${id}`);
}

/** Always re-fetch from PostgreSQL. */
export async function refreshVehicles(): Promise<Vehicle[]> {
  return loadVehicles();
}

export { handleApiError };
