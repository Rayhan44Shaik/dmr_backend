/**
 * Shop Sales — PostgreSQL via shared Axios helpers. PostgreSQL (not
 * localStorage) is the single source of truth: a trip/delivery is only
 * ever "in Shop Sales" here because the backend's eligibility query
 * (rate_entry.locked = TRUE) says so.
 *
 * GET    /operations/shop-sales        -> eligible sales (Rate Entry locked, not soft-deleted)
 *                                         supports fromDate / toDate / search / sortBy /
 *                                         shopId / page / limit (paginated result shape)
 * PUT    /operations/shop-sales/:id    -> edit birds/weight/mortality/remarks/birdType only
 *                                          (rate/amount/shopId/shopName/tripId are backend-immutable
 *                                          once locked — see updateShopSale's diffing contract)
 * DELETE /operations/shop-sales/:id    -> soft-delete (kept for completeness; the existing Shop
 *                                          Sales table has no delete button today, so this is not
 *                                          currently invoked by any UI element)
 *
 * This is a NEW file — the existing (localStorage-backed) frontend
 * `services/shopSalesService.ts` is deliberately left untouched, because
 * it is also imported by the Reports module's Shop Ledger page
 * (`modules/reports/pages/ShopLedgerPage.tsx`), which is out of scope for
 * this phase. Only `useShopSales.ts` (the actual Shop Sales page hook)
 * is repointed at this file.
 */
import { apiDelete, apiGet, apiPut } from "../../../../api";
import type { ShopSale } from "../types/shopSale";
import {
  mapApiSaleToShopSale,
  type ApiShopSale,
} from "../utils/shopSaleMapping";

const SHOP_SALES_PATH = "/operations/shop-sales";

/** Paginated shape the backend returns when page/limit are supplied. */
export interface ShopSalesPageResult {
  data: ApiShopSale[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

/** GET /operations/shop-sales — only trips whose Rate Entry is locked are
 * ever returned (backend-enforced eligibility; never re-derived here).
 * fromDate/toDate/search are sent to the backend (real filtering);
 * shop-name text filter and sort order stay client-side in the hook
 * (the full eligible list is loaded, so pagination remains client-side). */
export async function listShopSales(filters: {
  fromDate?: string;
  toDate?: string;
  search?: string;
  sortBy?: string;
} = {}): Promise<ShopSale[]> {
  const params: Record<string, string> = {};
  if (filters.fromDate) params.fromDate = filters.fromDate;
  if (filters.toDate) params.toDate = filters.toDate;
  if (filters.search && filters.search.trim() !== "") params.search = filters.search.trim();
  if (filters.sortBy) params.sortBy = filters.sortBy;

  const { data } = await apiGet<ApiShopSale[] | ShopSalesPageResult>(
    SHOP_SALES_PATH,
    { params }
  );

  // Backend returns a plain array when no page/limit is supplied (the
  // current client behaviour) and { data, meta } when pagination params are
  // present — accept both so a future server-side pagination switch cannot
  // silently break the page.
  const rows = Array.isArray(data) ? data : data.data ?? [];
  return rows.map(mapApiSaleToShopSale);
}

export interface ShopSalePatch {
  birds?: number;
  weight?: number;
  mortality?: number;
  remarks?: string;
  birdTypeId?: number | null;
  birdType?: string;
  /** Only ever included when the caller genuinely intends to attempt a
   * change to a locked field — the backend will reject it with 409. Never
   * sent just because the row happens to still carry its old value. */
  rate?: number;
  shopId?: number;
  shopName?: string;
  tripId?: number;
}

/** PUT /operations/shop-sales/:id */
export async function updateShopSale(id: number, patch: ShopSalePatch): Promise<ShopSale> {
  const { data } = await apiPut<ApiShopSale>(`${SHOP_SALES_PATH}/${id}`, patch);
  return mapApiSaleToShopSale(data);
}

/** DELETE /operations/shop-sales/:id — soft-delete. Not currently wired to
 * any UI control (the existing table has no delete button), provided for
 * completeness/future use. */
export async function deleteShopSale(id: number): Promise<void> {
  await apiDelete(`${SHOP_SALES_PATH}/${id}`);
}