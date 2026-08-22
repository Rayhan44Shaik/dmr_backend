/**
 * Shop Ledger — frontend fetcher for the authoritative backend ledger
 * (GET /operations/shop-ledger). The complete historical ledger for a shop
 * (or all shops) over a custom date range comes straight from PostgreSQL —
 * no localStorage authority, no client-side reconstruction, no 10-row limit.
 */
import { apiGet } from "../../../api";

export type ShopLedgerEntryType = "sale" | "collection" | "correction";

export interface ShopLedgerRow {
  id: number;
  shopId: number | null;
  shopName: string;
  date: string;
  type: ShopLedgerEntryType;
  referenceType: string;
  referenceId: number;
  /** Trip no / sale no / collection no when the reference resolves. */
  referenceNo: string;
  description: string;
  debit: number;
  credit: number;
  /** Backend-authoritative running balance as-of this row. */
  balance: number;
  birds: number;
  weight: number;
  rate: number;
  paymentMode: string | null;
  status: string | null;
  createdAt: string | null;
}

export interface ShopLedgerMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ShopLedgerResponse {
  shopId: number | null;
  shopName: string;
  /** Backend-computed balance at the START of the requested range. */
  openingBalance: number;
  data: ShopLedgerRow[];
  meta?: ShopLedgerMeta;
}

/**
 * Fetch the complete ledger for one shop (or all shops when shopId is omitted).
 * `fromDate` / `toDate` are sent as-is (backend DATE semantics, inclusive of
 * the last day). The backend returns every matching transaction — no limit is
 * applied here (optional page/limit defer to backend pagination).
 */
export async function fetchShopLedger(filters: {
  shopId?: number;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
} = {}): Promise<ShopLedgerResponse> {
  const params: Record<string, string> = {};
  if (filters.shopId != null) params.shopId = String(filters.shopId);
  if (filters.fromDate) params.fromDate = filters.fromDate;
  if (filters.toDate) params.toDate = filters.toDate;
  if (filters.page != null) params.page = String(filters.page);
  if (filters.limit != null) params.limit = String(filters.limit);
  const { data } = await apiGet<ShopLedgerResponse>("/operations/shop-ledger", {
    params,
  });
  return {
    shopId: data.shopId ?? null,
    shopName: data.shopName ?? "",
    openingBalance: Number(data.openingBalance ?? 0),
    data: (data.data ?? []).map((row) => ({
      id: Number(row.id),
      shopId: row.shopId == null ? null : Number(row.shopId),
      shopName: String(row.shopName ?? ""),
      date: String(row.date ?? ""),
      type: (row.type ?? "correction") as ShopLedgerEntryType,
      referenceType: String(row.referenceType ?? ""),
      referenceId: Number(row.referenceId ?? 0),
      referenceNo: String(row.referenceNo ?? ""),
      description: String(row.description ?? ""),
      debit: Number(row.debit ?? 0),
      credit: Number(row.credit ?? 0),
      balance: Number(row.balance ?? 0),
      birds: Number(row.birds ?? 0),
      weight: Number(row.weight ?? 0),
      rate: Number(row.rate ?? 0),
      paymentMode: row.paymentMode == null ? null : String(row.paymentMode),
      status: row.status == null ? null : String(row.status),
      createdAt: row.createdAt == null ? null : String(row.createdAt),
    })),
    meta: data.meta,
  };
}