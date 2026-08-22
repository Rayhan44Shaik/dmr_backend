// src/modules/masters/farms/services/farmService.ts
/**
 * Farms master — PostgreSQL ONLY via shared Axios helpers.
 * Static/mock arrays and localStorage are not used as a data source.
 */

import {
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  handleApiError,
} from "../../../../api";
import type { Farm } from "../types/farm";

const FARMS_PATH = "/masters/farms";

/** Legacy browser keys that previously held mock farm lists. */
const LEGACY_STORAGE_KEYS = [
  "dmr-farms",
  "dmr_poultries_farms_master_data",
] as const;

/** Cache filled exclusively by GET /api/masters/farms. */
let farmsCache: Farm[] = [];

export type FarmInput = Omit<Farm, "id" | "farmNo"> & {
  farmNo?: number;
};

function clearLegacyFarmStorage(): void {
  try {
    for (const key of LEGACY_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore storage access errors */
  }
}

function normalizeStatus(status: unknown): Farm["status"] {
  return status === "Active" ? "Active" : "Inactive";
}

function mapFarm(raw: Record<string, unknown>): Farm {
  return {
    id: Number(raw.id),
    farmNo: Number(raw.farmNo ?? raw.farm_no ?? 0),
    farmName: String(raw.farmName ?? raw.farm_name ?? ""),
    ownerName: String(raw.ownerName ?? raw.owner_name ?? ""),
    supervisorName: String(raw.supervisorName ?? raw.supervisor_name ?? ""),
    phoneNumber: String(raw.phoneNumber ?? raw.phone_number ?? ""),
    village: String(raw.village ?? ""),
    address: String(raw.address ?? ""),
    capacity: Number(raw.capacity ?? 0),
    status: normalizeStatus(raw.status),
  };
}

function toPayload(input: FarmInput | Partial<Farm>): Record<string, unknown> {
  return {
    farmNo: input.farmNo,
    farmName: input.farmName?.trim(),
    ownerName: input.ownerName?.trim() ?? "",
    supervisorName: input.supervisorName?.trim() ?? "",
    phoneNumber: input.phoneNumber?.trim() ?? "",
    village: input.village?.trim() ?? "",
    address: input.address?.trim() ?? "",
    capacity: Number(input.capacity ?? 0),
    status: input.status ?? "Active",
  };
}

function setCacheFromApi(rows: Record<string, unknown>[] | null | undefined): Farm[] {
  farmsCache = Array.isArray(rows) ? rows.map(mapFarm) : [];
  return farmsCache;
}

/** Sync snapshot for other modules — reflects last successful API load only. */
export function getFarms(): Farm[] {
  return farmsCache;
}

/**
 * @deprecated Do not use for Farms UI. Mutations must go through API helpers.
 */
export function saveFarms(_farms: Farm[]): void {
  // Intentionally no-op. Cache is API-owned.
}

/** GET /api/masters/farms — sole source of truth for the Farms table. */
export async function loadFarms(): Promise<Farm[]> {
  clearLegacyFarmStorage();
  const { data } = await apiGet<Record<string, unknown>[]>(FARMS_PATH);
  return setCacheFromApi(data);
}

/** POST /api/masters/farms */
export async function createFarm(input: FarmInput): Promise<Farm> {
  clearLegacyFarmStorage();
  const { data } = await apiPost<Record<string, unknown>>(
    FARMS_PATH,
    toPayload(input)
  );
  return mapFarm(data);
}

/** POST /api/masters/farms/bulk — Upload multiple farms from Excel */
export async function bulkCreateFarms(inputs: FarmInput[]): Promise<Farm[]> {
  clearLegacyFarmStorage();
  const payload = inputs.map(toPayload);
  const { data } = await apiPost<Record<string, unknown>[]>(
    `${FARMS_PATH}/bulk`,
    payload
  );
  return Array.isArray(data) ? data.map(mapFarm) : [];
}

/** PUT /api/masters/farms/:id */
export async function updateFarm(
  id: number,
  input: FarmInput | Partial<Farm>
): Promise<Farm> {
  clearLegacyFarmStorage();
  const { data } = await apiPut<Record<string, unknown>>(
    `${FARMS_PATH}/${id}`,
    toPayload({ ...(input as FarmInput), farmNo: input.farmNo })
  );
  return mapFarm(data);
}

/** DELETE /api/masters/farms/:id */
export async function deleteFarm(id: number): Promise<void> {
  clearLegacyFarmStorage();
  await apiDelete(`${FARMS_PATH}/${id}`);
}

/** Always re-fetch from PostgreSQL. */
export async function refreshFarms(): Promise<Farm[]> {
  return loadFarms();
}

export { handleApiError };
