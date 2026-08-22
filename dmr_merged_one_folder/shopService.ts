/**
 * Shops master — PostgreSQL ONLY via shared Axios helpers.
 * Static/mock arrays and localStorage are not used as a data source.
 */

import {
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  handleApiError,
} from "../../../../api";
import type { Shop } from "../types/shop";

const SHOPS_PATH = "/masters/shops";

/** Legacy browser keys that previously held mock shop lists. */
const LEGACY_STORAGE_KEYS = [
  "masters_shops",
  "dmr-shops",
  "dmr_poultries_shops_master_data",
] as const;

/** Cache filled exclusively by GET /api/masters/shops. */
let shopsCache: Shop[] = [];

export type ShopInput = Omit<Shop, "id" | "shopNo"> & {
  shopNo?: number;
};

function clearLegacyShopStorage(): void {
  try {
    for (const key of LEGACY_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore storage access errors */
  }
}

function normalizeStatus(status: unknown): Shop["status"] {
  return status === "Active" ? "Active" : "Inactive";
}

function mapShop(raw: Record<string, unknown>): Shop {
  return {
    id: Number(raw.id),
    shopNo: Number(raw.shopNo ?? raw.shop_no ?? 0),
    shopName: String(raw.shopName ?? raw.shop_name ?? ""),
    ownerName: String(raw.ownerName ?? raw.owner_name ?? ""),
    phoneNumber: String(raw.phoneNumber ?? raw.phone_number ?? ""),
    whatsappNumber: String(raw.whatsappNumber ?? raw.whatsapp_number ?? ""),
    email: String(raw.email ?? "").trim(),
    village: String(raw.village ?? ""),
    address: String(raw.address ?? ""),
    status: normalizeStatus(raw.status),
    openingBalance: Number(raw.openingBalance ?? raw.opening_balance ?? 0),
    currentBalance:
      raw.currentBalance != null
        ? Number(raw.currentBalance)
        : raw.current_balance != null
        ? Number(raw.current_balance)
        : 0,
  };
}

function toPayload(input: ShopInput | Partial<Shop>): Record<string, unknown> {
  return {
    shopNo: input.shopNo,
    shopName: input.shopName?.trim(),
    ownerName: input.ownerName?.trim() ?? "",
    phoneNumber: input.phoneNumber?.trim() ?? "",
    whatsappNumber: input.whatsappNumber?.trim() ?? "",
    email: input.email?.trim() ?? "",
    village: input.village?.trim() ?? "",
    address: input.address?.trim() ?? "",
    status: input.status ?? "Active",
    openingBalance: Number(input.openingBalance ?? 0),
  };
}

function setCacheFromApi(rows: Record<string, unknown>[] | null | undefined): Shop[] {
  shopsCache = Array.isArray(rows) ? rows.map(mapShop) : [];
  return shopsCache;
}

/** Sync snapshot for other modules — reflects last successful API load only. */
export function getShops(): Shop[] {
  return shopsCache;
}

/** Alias used by consumers that still call shopService.getAll(). */
export function getAll(): Shop[] {
  return getShops();
}

/**
 * @deprecated Do not use for Shops UI. Mutations must go through API helpers.
 */
export function saveAll(_shops: Shop[]): void {
  // Intentionally no-op. Cache is API-owned.
}

/** GET /api/masters/shops — sole source of truth for the Shops table. */
export async function loadShops(): Promise<Shop[]> {
  clearLegacyShopStorage();
  const { data } = await apiGet<Record<string, unknown>[]>(SHOPS_PATH);
  return setCacheFromApi(data);
}

/** POST /api/masters/shops */
export async function createShop(input: ShopInput): Promise<Shop> {
  clearLegacyShopStorage();
  const { data } = await apiPost<Record<string, unknown>>(
    SHOPS_PATH,
    toPayload(input)
  );
  return mapShop(data);
}

/** POST /api/masters/shops/bulk */
export async function createShopsBulk(inputs: ShopInput[]): Promise<Shop[]> {
  clearLegacyShopStorage();
  const { data } = await apiPost<Record<string, unknown>[]>(
    `${SHOPS_PATH}/bulk`,
    inputs.map(toPayload)
  );
  return Array.isArray(data) ? data.map(mapShop) : [];
}

/** PUT /api/masters/shops/:id */
export async function updateShop(
  id: number,
  input: ShopInput | Partial<Shop>
): Promise<Shop> {
  clearLegacyShopStorage();
  const { data } = await apiPut<Record<string, unknown>>(
    `${SHOPS_PATH}/${id}`,
    toPayload({ ...(input as ShopInput), shopNo: input.shopNo })
  );
  return mapShop(data);
}

/** DELETE /api/masters/shops/:id */
export async function deleteShop(id: number): Promise<void> {
  clearLegacyShopStorage();
  await apiDelete(`${SHOPS_PATH}/${id}`);
}

/** Always re-fetch from PostgreSQL. */
export async function refreshShops(): Promise<Shop[]> {
  return loadShops();
}

/** Compatibility object for modules that import `shopService.getAll()`. */
export const shopService = {
  getAll,
  saveAll,
};

export { handleApiError };