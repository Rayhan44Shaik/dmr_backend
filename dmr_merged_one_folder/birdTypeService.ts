/**
 * Bird Types master — PostgreSQL ONLY via shared Axios helpers.
 * Static/mock arrays and localStorage are not used as a data source.
 */

import {
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  handleApiError,
} from "../../../../api";
import type { BirdType } from "../types/birdType";

const BIRD_TYPES_PATH = "/masters/bird-types";

/** Legacy browser keys that previously held mock bird type lists. */
const LEGACY_STORAGE_KEYS = [
  "dmr-bird-types",
  "dmr-birdTypes",
  "dmr_poultries_bird_types_master_data",
] as const;

/** Cache filled exclusively by GET /api/masters/bird-types. */
let birdTypesCache: BirdType[] = [];

export type BirdTypeInput = Omit<BirdType, "id" | "birdTypeNo"> & {
  birdTypeNo?: number;
};

function clearLegacyBirdTypeStorage(): void {
  try {
    for (const key of LEGACY_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore storage access errors */
  }
}

function normalizeStatus(status: unknown): BirdType["status"] {
  return status === "Active" ? "Active" : "Inactive";
}

function mapBirdType(raw: Record<string, unknown>): BirdType {
  return {
    id: Number(raw.id),
    birdTypeNo: Number(raw.birdTypeNo ?? raw.bird_type_no ?? 0),
    birdType: String(raw.birdType ?? raw.bird_type ?? raw.name ?? ""),
    averageWeight: Number(raw.averageWeight ?? raw.average_weight ?? 0),
    description: String(raw.description ?? ""),
    status: normalizeStatus(raw.status),
  };
}

function toPayload(input: BirdTypeInput | Partial<BirdType>): Record<string, unknown> {
  return {
    birdTypeNo: input.birdTypeNo,
    birdType: input.birdType?.trim(),
    averageWeight: Number(input.averageWeight ?? 0),
    description: input.description?.trim() ?? "",
    status: input.status ?? "Active",
  };
}

function setCacheFromApi(rows: Record<string, unknown>[] | null | undefined): BirdType[] {
  birdTypesCache = Array.isArray(rows) ? rows.map(mapBirdType) : [];
  return birdTypesCache;
}

/** Sync snapshot for other modules — reflects last successful API load only. */
export function getBirdTypes(): BirdType[] {
  return birdTypesCache;
}

/**
 * @deprecated Do not use for Bird Types UI. Mutations must go through API helpers.
 */
export function saveBirdTypes(_birdTypes: BirdType[]): void {
  // Intentionally no-op. Cache is API-owned.
}

/** GET /api/masters/bird-types — sole source of truth for the Bird Types table. */
export async function loadBirdTypes(): Promise<BirdType[]> {
  clearLegacyBirdTypeStorage();
  const { data } = await apiGet<Record<string, unknown>[]>(BIRD_TYPES_PATH);
  return setCacheFromApi(data);
}

/** POST /api/masters/bird-types */
export async function createBirdType(input: BirdTypeInput): Promise<BirdType> {
  clearLegacyBirdTypeStorage();
  const { data } = await apiPost<Record<string, unknown>>(
    BIRD_TYPES_PATH,
    toPayload(input)
  );
  return mapBirdType(data);
}

/** POST /api/masters/bird-types/bulk — Upload multiple bird types from Excel */
export async function bulkCreateBirdTypes(inputs: BirdTypeInput[]): Promise<BirdType[]> {
  clearLegacyBirdTypeStorage();
  const payload = inputs.map(toPayload);
  const { data } = await apiPost<Record<string, unknown>[]>(
    `${BIRD_TYPES_PATH}/bulk`,
    payload
  );
  return Array.isArray(data) ? data.map(mapBirdType) : [];
}

/** PUT /api/masters/bird-types/:id */
export async function updateBirdType(
  id: number,
  input: BirdTypeInput | Partial<BirdType>
): Promise<BirdType> {
  clearLegacyBirdTypeStorage();
  const { data } = await apiPut<Record<string, unknown>>(
    `${BIRD_TYPES_PATH}/${id}`,
    toPayload({ ...(input as BirdTypeInput), birdTypeNo: input.birdTypeNo })
  );
  return mapBirdType(data);
}

/** DELETE /api/masters/bird-types/:id */
export async function deleteBirdType(id: number): Promise<void> {
  clearLegacyBirdTypeStorage();
  await apiDelete(`${BIRD_TYPES_PATH}/${id}`);
}

/** Always re-fetch from PostgreSQL. */
export async function refreshBirdTypes(): Promise<BirdType[]> {
  return loadBirdTypes();
}

export { handleApiError };
