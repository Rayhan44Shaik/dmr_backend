import type {
  Collection,
  CollectionApiEntry,
  CollectionEntryInput,
  CollectionLegacyStatus,
  PendingCollection,
  RecentCollection,
  CollectorSummary,
  PaymentModeSummary,
  CollectionDashboardSummary,
  CollectionWeeklySummary,
  CollectionWeekBounds,
  CollectionReportSummary,
  CollectionPendingSummaryRow,
  CollectionPendingSummaryResponse,
} from "../types/collection";
import type { ShopSale } from "../../shop-sales/types/shopSale";
import {
  apiGet,
  apiPost,
  apiPut,
  apiPatch,
  apiDelete,
  handleApiError,
} from "../../../../api";
import { calculateCollectorSummary, calculatePaymentModeSummary } from "../utils/collectionCalculation";

/** Sizes for list fetches when pagination is unavoidable. */
const PAGE_SIZE = 200;
const COLLECTION_PATH = "/operations/collection-entry";
const SHOP_SALES_PATH = "/operations/shop-sales";
const SHOPS_PATH = "/masters/shops";

/* ==================================================================
   In-memory cache â€” filled exclusively from the PostgreSQL backend.
   Synchronous getters below read this cache so non-collection modules
   (Header, dashboard, accounts, Shop Ledger) keep working unchanged.
================================================================== */
let entriesCache: CollectionApiEntry[] = [];
let collectionsCache: Collection[] = [];
let pendingCache: PendingCollection[] = [];
let shopSalesCache: ShopSale[] = [];
let shopsCache: { id: number; shopName: string; currentBalance: number }[] = [];

/* ==================================================================
   mapping
================================================================== */
function mapStatus(status: string): CollectionLegacyStatus {
  if (status === "Approved") return "Approved";
  return "Pending";
}

function mapEntryToCollection(e: CollectionApiEntry): Collection {
  return {
    id: String(e.id),
    collectionNo: e.collectionNo,
    collectionDate: e.collectionDate,
    shopName: e.shopName,
    collectorName: e.collector,
    paymentModeName: e.paymentMode,
    referenceNo: e.referenceNo,
    amount: Number(e.amount),
    remarks: e.remarks,
    status: mapStatus(e.status),
    createdDate: e.createdAt ?? e.collectionDate,
    createdBy: e.createdBy,
    approvedDate: e.approvedAt ?? undefined,
    approvedBy: e.approvedBy ?? undefined,
    numericId: e.id,
    numericShopId: e.shopId,
  };
}

function isApproved(e: CollectionApiEntry): boolean {
  return e.status === "Approved" && !e.deleted;
}

function buildPending(): PendingCollection[] {
  const approved = entriesCache.filter(isApproved);
  const salesByShop = new Map<number, number>();
  shopSalesCache.forEach((s) => {
    const id = s.numericShopId;
    if (id == null || id <= 0) return;
    salesByShop.set(id, (salesByShop.get(id) ?? 0) + Number(s.amount || 0));
  });
  const collectionsByShop = new Map<number, number>();
  const lastCollectionByShop = new Map<number, string>();
  approved.forEach((e) => {
    const id = e.shopId;
    if (id == null || id <= 0) return;
    collectionsByShop.set(id, (collectionsByShop.get(id) ?? 0) + Number(e.amount || 0));
    const prev = lastCollectionByShop.get(id);
    if (!prev || e.collectionDate > prev) lastCollectionByShop.set(id, e.collectionDate);
  });

  const pending: PendingCollection[] = [];
  shopsCache.forEach((shop) => {
    const totalSales = salesByShop.get(shop.id) ?? 0;
    const totalCollections = collectionsByShop.get(shop.id) ?? 0;
    const currentPending = Number(shop.currentBalance ?? 0);
    const lastCollectionDate = lastCollectionByShop.get(shop.id) ?? "-";
    let overdueDays = 0;
    if (lastCollectionDate && lastCollectionDate !== "-") {
      const [y, m, d] = lastCollectionDate.slice(0, 10).split("-").map(Number);
      const then = Date.UTC(y, m - 1, d);
      const now = Date.now();
      overdueDays = Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)));
    }
    pending.push({
      shopId: shop.id,
      shopName: shop.shopName,
      totalSales,
      totalCollections,
      currentPending,
      overdueDays,
      lastCollectionDate,
    });
  });

  return pending.sort((a, b) => b.currentPending - a.currentPending);
}

/* ==================================================================
   backend helpers
================================================================== */
async function fetchPage<T>(path: string, filters: Record<string, unknown> = {}): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  for (;;) {
    const { data } = await apiGet<T[] | { data: T[]; meta: { total: number; totalPages: number } }>(path, {
      params: { ...filters, page, limit: PAGE_SIZE },
    });
    if (Array.isArray(data)) {
      all.push(...data);
      if (data.length < PAGE_SIZE) break;
    } else {
      all.push(...data.data);
      if (page >= data.meta.totalPages) break;
    }
    page += 1;
  }
  return all;
}

async function fetchCollections(): Promise<CollectionApiEntry[]> {
  const rows = await fetchPage<Record<string, unknown>>(COLLECTION_PATH, {
    includeDeleted: "false",
  });
  return rows.map(mapRawEntry);
}

async function fetchShopSales(): Promise<ShopSale[]> {
  const rows = await fetchPage<Record<string, unknown>>(SHOP_SALES_PATH);
  return rows.map(mapRawSale);
}

/**
 * Recent collection/credit records for ONE shop — backend LIMIT 10, newest
 * first (ORDER BY collection_date DESC, created_at DESC, collection_no DESC).
 * Calls the dedicated GET /collection-entry/recent endpoint, which is also
 * the only endpoint that returns the backend-authoritative `canDelete` flag
 * (CURRENT_DATE <= collection_date + 7) used by Pending Collection. Powers
 * the "Recent 10 Shop Credits" section of the View Collection modal. Never
 * downloads the full register and never uses localStorage.
 */
async function fetchRecentCollectionsForShop(
  shopId: number,
  limit = 10
): Promise<CollectionApiEntry[]> {
  const { data } = await apiGet<Record<string, unknown>[]>(`${COLLECTION_PATH}/recent`, {
    params: { shopId, limit },
  });
  return (data ?? []).map((row) => mapRawEntry(row));
}

async function fetchShops(): Promise<typeof shopsCache> {
  const { data } = await apiGet<Record<string, unknown>[]>(SHOPS_PATH);
  return (data ?? []).map((r) => ({
    id: Number(r.id),
    shopName: String(r.shopName ?? r.shop_name ?? ""),
    currentBalance: Number(r.currentBalance ?? r.current_balance ?? 0),
  }));
}

function mapRawEntry(raw: Record<string, unknown>): CollectionApiEntry {
  return {
    id: Number(raw.id),
    collectionNo: String(raw.collectionNo ?? raw.collection_no ?? ""),
    collectionDate: String(raw.collectionDate ?? raw.collection_date ?? ""),
    shopId: raw.shopId == null ? null : Number(raw.shopId ?? raw.shop_id),
    shopName: String(raw.shopName ?? raw.shop_name ?? ""),
    tripId: raw.tripId == null ? null : Number(raw.tripId ?? raw.trip_id),
    amountDue: Number(raw.amountDue ?? raw.amount_due ?? 0),
    amount: Number(raw.amount ?? raw.amountCollected ?? raw.amount_collected ?? 0),
    amountCollected: Number(raw.amountCollected ?? raw.amount_collected ?? 0),
    collector: String(raw.collector ?? ""),
    paymentMode: String(raw.paymentMode ?? raw.payment_mode ?? "Cash"),
    referenceNo: String(raw.referenceNo ?? raw.reference_no ?? ""),
    remarks: String(raw.remarks ?? ""),
    status: (String(raw.status ?? "") as CollectionApiEntry["status"]) || "Pending Approval",
    deleted: Boolean(raw.deleted),
    deletedBy: raw.deletedBy != null ? String(raw.deletedBy) : (raw.deleted_by != null ? String(raw.deleted_by) : null),
    deletedAt: raw.deletedAt != null ? String(raw.deletedAt) : (raw.deleted_at != null ? String(raw.deleted_at) : null),
    isFinancial: Boolean(raw.isFinancial ?? raw.is_financial),
    openingBalance: raw.openingBalance == null ? null : Number(raw.openingBalance ?? raw.opening_balance),
    closingBalance: raw.closingBalance == null ? null : Number(raw.closingBalance ?? raw.closing_balance),
    approvedBy: raw.approvedBy != null ? String(raw.approvedBy) : (raw.approved_by != null ? String(raw.approved_by) : null),
    approvedAt: raw.approvedAt != null ? String(raw.approvedAt) : (raw.approved_at != null ? String(raw.approved_at) : null),
    createdBy: String(raw.createdBy ?? raw.created_by ?? ""),
    createdAt: raw.createdAt != null ? String(raw.createdAt) : (raw.created_at != null ? String(raw.created_at) : null),
    updatedAt: raw.updatedAt != null ? String(raw.updatedAt) : (raw.updated_at != null ? String(raw.updated_at) : null),
    canDelete: raw.canDelete == null ? undefined : Boolean(raw.canDelete),
  };
}

function mapRawSale(raw: Record<string, unknown>): ShopSale {
  return {
    id: String(raw.id),
    tripId: raw.tripId != null ? String(raw.tripId) : (raw.trip_id != null ? String(raw.trip_id) : ""),
    tripNo: String(raw.tripNo ?? raw.trip_no ?? ""),
    tripDate: String(raw.saleDate ?? raw.tripDate ?? raw.trip_date ?? ""),
    shopId: raw.shopId != null ? String(raw.shopId) : (raw.shop_id != null ? String(raw.shop_id) : ""),
    shopName: String(raw.shopName ?? raw.shop_name ?? ""),
    birdType: String(raw.birdType ?? raw.bird_type ?? ""),
    totalBirds: Number(raw.birds ?? 0),
    totalWeight: Number(raw.weight ?? 0),
    rate: raw.rate == null ? null : Number(raw.rate),
    amount: Number(raw.amount ?? 0),
    remark: String(raw.remarks ?? raw.remark ?? ""),
    status: "Completed",
    numericId: raw.id != null ? Number(raw.id) : undefined,
    numericTripId: raw.tripId != null ? Number(raw.tripId) : (raw.trip_id != null ? Number(raw.trip_id) : null),
    numericShopId: raw.shopId != null ? Number(raw.shopId) : (raw.shop_id != null ? Number(raw.shop_id) : null),
  };
}

/* ==================================================================
   cache rebuild
================================================================== */
function rebuildCache() {
  collectionsCache = entriesCache
    .filter((e) => !e.deleted)
    .map(mapEntryToCollection);
  pendingCache = buildPending();
}

/**
 * Pull everything from PostgreSQL and rebuild the cache. Call once at app
 * start (and after every mutation). Synchronous getters then serve fresh data.
 */
export async function refreshFromBackend(): Promise<void> {
  try {
    const [entries, sales, shops] = await Promise.all([
      fetchCollections(),
      fetchShopSales(),
      fetchShops(),
    ]);
    entriesCache = entries;
    shopSalesCache = sales;
    shopsCache = shops;
    rebuildCache();
  } catch (error) {
    handleApiError(error);
    throw error;
  }
}

/* ==================================================================
   synchronous getters (kept for external/non-collection consumers)
================================================================== */
function getShopSales(): ShopSale[] {
  return shopSalesCache;
}
function getCollections(): Collection[] {
  return collectionsCache;
}
function saveCollections(): void {
  // No-op â€” data is backend-owned.
}
function getNextCollectionNumber(): string {
  // Numbers are generated server-side (Col-YYYYMMDD-NNN); never fabricated here.
  return "";
}
function getPendingCollections(): PendingCollection[] {
  return pendingCache;
}
function getRecentCollections(status: "Pending" | "Approved" | "Deleted" = "Pending"): RecentCollection[] {
  let rows: Collection[];

  if (status === "Deleted") {
    // For deleted collections, read directly from entriesCache (including deleted ones)
    const deletedEntries = entriesCache.filter((e) => e.deleted);
    rows = deletedEntries.map(mapEntryToCollection);
  } else if (status === "Approved") {
    rows = collectionsCache.filter((c) => c.status === "Approved");
  } else {
    rows = collectionsCache.filter((c) => c.status === "Pending");
  }

  const byId = new Map(entriesCache.map((e) => [String(e.id), e]));
  return rows
    .slice()
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "Pending" ? -1 : 1;
      return b.collectionDate.localeCompare(a.collectionDate);
    })
    .map((row) => ({
      id: row.id,
      collectionNo: row.collectionNo,
      collectionDate: row.collectionDate,
      shopName: row.shopName,
      collectorName: row.collectorName,
      paymentModeName: row.paymentModeName,
      referenceNo: row.referenceNo,
      amount: row.amount,
      remarks: row.remarks,
      status: row.status,
      rawStatus: byId.get(row.id)?.status,
      approvedBy: row.approvedBy,
      approvedDate: row.approvedDate,
      numericId: row.numericId,
      numericShopId: row.numericShopId,
    }));
}
function getPendingApprovalCount(): number {
  return entriesCache.filter((e) => !e.deleted && e.status === "Pending Approval").length;
}
function getApprovedCount(): number {
  return entriesCache.filter(isApproved).length;
}
function getCollectorSummary(): CollectorSummary[] {
  return calculateCollectorSummary(collectionsCache.filter((c) => c.status === "Approved"));
}
function getPaymentModeSummary(): PaymentModeSummary[] {
  return calculatePaymentModeSummary(collectionsCache.filter((c) => c.status === "Approved"));
}
function getDashboardSummary(): CollectionDashboardSummary {
  const pending = pendingCache;
  return {
    totalPendingShops: pending.length,
    totalPendingAmount: pending.reduce((total, row) => total + row.currentPending, 0),
    pendingApproval: getPendingApprovalCount(),
    approvedCollections: getApprovedCount(),
  };
}
function refreshCollections() {
  return {
    pendingCollections: getPendingCollections(),
    recentCollections: getRecentCollections(),
    collectorSummary: getCollectorSummary(),
    paymentModeSummary: getPaymentModeSummary(),
    dashboardSummary: getDashboardSummary(),
  };
}
function getCollectionsForShop(shopName: string): Collection[] {
  return collectionsCache.filter((c) => c.shopName === shopName);
}
function getEntries(): CollectionApiEntry[] {
  return entriesCache.filter((e) => !e.deleted);
}
function getEntriesForShop(shopName: string): CollectionApiEntry[] {
  return getEntries().filter((e) => e.shopName === shopName);
}

/* ==================================================================
   mutations â€” backend is the authority
================================================================== */
async function saveCollection(input: CollectionEntryInput): Promise<CollectionApiEntry> {
  const { data } = await apiPost<Record<string, unknown>>(COLLECTION_PATH, input);
  await refreshFromBackend();
  return mapRawEntry(data);
}

async function saveCollectionLegacy(entry: {
  collectionDate: string;
  shopName: string;
  collectorName: string;
  paymentModeName: string;
  referenceNo: string;
  amount: number;
  remarks: string;
}): Promise<boolean> {
  try {
    const shop = shopsCache.find((s) => s.shopName === entry.shopName);
    await saveCollection({
      collectionDate: entry.collectionDate,
      shopId: shop?.id ?? 0,
      shopName: entry.shopName,
      collector: entry.collectorName,
      paymentMode: entry.paymentModeName,
      referenceNo: entry.referenceNo,
      remarks: entry.remarks,
      amount: Number(entry.amount),
    });
    return true;
  } catch (error) {
    handleApiError(error);
    return false;
  }
}

async function updateCollection(collection: Collection): Promise<boolean> {
  try {
    if (collection.numericId == null) return false;
    const { data } = await apiPut<Record<string, unknown>>(
      `${COLLECTION_PATH}/${collection.numericId}`,
      {
        collectionDate: collection.collectionDate,
        amount: Number(collection.amount),
        collector: collection.collectorName,
        paymentMode: collection.paymentModeName,
        referenceNo: collection.referenceNo,
        remarks: collection.remarks,
      }
    );
    void data;
    await refreshFromBackend();
    return true;
  } catch (error) {
    handleApiError(error);
    return false;
  }
}

async function deleteCollection(id: string): Promise<boolean> {
  try {
    await apiDelete(`${COLLECTION_PATH}/${Number(id)}`);
    await refreshFromBackend();
    return true;
  } catch (error) {
    handleApiError(error);
    return false;
  }
}

/**
 * Pending Collection's own delete — a DIFFERENT endpoint from Collection
 * Entry's deleteCollection() above. Enforces the backend's 7-day window
 * (CURRENT_DATE <= collection_date + 7); rejects with 409 outside it. The
 * Pending Collection UI must call this and must never call deleteCollection().
 */
async function deletePendingCollection(id: string): Promise<{ success: boolean; message?: string }> {
  try {
    await apiDelete(`${COLLECTION_PATH}/pending/${Number(id)}`);
    await refreshFromBackend();
    return { success: true };
  } catch (error) {
    const message = handleApiError(error);
    return { success: false, message };
  }
}

async function approveCollection(
  id: string,
  approvedBy: string = "Admin"
): Promise<{ success: boolean; balance?: number }> {
  try {
    const { data } = await apiPatch<Record<string, unknown>>(`${COLLECTION_PATH}/${Number(id)}/status`, {
      status: "Approved",
      approvedBy,
    });
    // Backend returns the authoritative updated shop balance on approval.
    const balance =
      data && data.currentBalance != null ? Number(data.currentBalance) : undefined;
    await refreshFromBackend();
    return { success: true, balance };
  } catch (error) {
    handleApiError(error);
    return { success: false };
  }
}

async function rejectCollection(id: string, rejectedBy: string = "Admin", reason?: string): Promise<boolean> {
  try {
    await apiPatch(`${COLLECTION_PATH}/${Number(id)}/status`, {
      status: "Rejected",
      rejectedBy,
      reason,
    });
    await refreshFromBackend();
    return true;
  } catch (error) {
    handleApiError(error);
    return false;
  }
}

/** Backend-ready builder for the entry form. */
function toEntryInput(entry: {
  collectionDate: string;
  shopName: string;
  collectorName: string;
  paymentModeName: string;
  referenceNo: string;
  amount: number;
  remarks: string;
}): CollectionEntryInput {
  const shop = shopsCache.find((s) => s.shopName === entry.shopName);
  return {
    collectionDate: entry.collectionDate,
    shopId: shop?.id ?? 0,
    shopName: entry.shopName,
    collector: entry.collectorName,
    paymentMode: entry.paymentModeName,
    referenceNo: entry.referenceNo,
    remarks: entry.remarks,
    amount: Number(entry.amount),
  };
}

function getShopIdForName(shopName: string): number | null {
  return shopsCache.find((s) => s.shopName === shopName)?.id ?? null;
}

function getShopBalance(shopName: string): number {
  return shopsCache.find((s) => s.shopName === shopName)?.currentBalance ?? 0;
}

async function fetchWeeklySummary(shopId: number, date: string): Promise<CollectionWeeklySummary> {
  const { data } = await apiGet<CollectionWeeklySummary>(`${COLLECTION_PATH}/weekly-summary`, {
    params: { shopId, date },
  });
  return mapWeeklySummary(data);
}

async function fetchWeekBounds(date?: string): Promise<CollectionWeekBounds> {
  const { data } = await apiGet<CollectionWeekBounds>(`${COLLECTION_PATH}/week-bounds`, {
    params: date ? { date } : {},
  });
  return {
    asOfDate: String(data.asOfDate),
    weekStart: String(data.weekStart),
    weekEnd: String(data.weekEnd),
    isCurrentWeek: Boolean(data.isCurrentWeek),
  };
}

async function fetchWeeklySummaries(date: string): Promise<CollectionWeeklySummary[]> {
  const { data } = await apiGet<CollectionWeeklySummary[]>(`${COLLECTION_PATH}/weekly-summaries`, {
    params: { date },
  });
  return (Array.isArray(data) ? data : []).map(mapWeeklySummary);
}

/**
 * Pending Collection main table — one aggregated row per active shop
 * (opening/balance/sales/approved/pending/recovery), all computed server-
 * side. This is the authoritative source for the Pending Collection table
 * and view; recoveryPercentage must be read from here, not recomputed.
 */
async function fetchPendingSummary(date: string): Promise<CollectionPendingSummaryResponse> {
  const { data } = await apiGet<Record<string, unknown> | Record<string, unknown>[]>(
    `${COLLECTION_PATH}/pending-summary`,
    { params: { date } }
  );
  const payload = Array.isArray(data) ? { shops: data, totals: null, weekStart: "", weekEnd: "" } : (data ?? {});
  const rawShops = (Array.isArray(payload.shops) ? payload.shops : []) as Record<string, unknown>[];
  const shops: CollectionPendingSummaryRow[] = rawShops.map((row) => ({
    shopId: Number(row.shopId),
    shopName: String(row.shopName ?? ""),
    weekStart: String(row.weekStart ?? ""),
    weekEnd: String(row.weekEnd ?? ""),
    balance: Number(row.balance ?? 0),
    weeklySales: Number(row.weeklySales ?? 0),
    weeklyApprovedCollections: Number(row.weeklyApprovedCollections ?? 0),
    weeklyPendingCollections: Number(row.weeklyPendingCollections ?? 0),
    recoveryPercentage: Number(row.recoveryPercentage ?? 0),
    overdueDays: row.overdueDays == null ? null : Number(row.overdueDays),
    hasPendingCollections: Boolean(row.hasPendingCollections),
    lastCollectionDate: row.lastCollectionDate == null ? null : String(row.lastCollectionDate),
  }));
  const rawTotals = (payload.totals ?? {}) as Record<string, unknown>;
  return {
    weekStart: String(payload.weekStart ?? shops[0]?.weekStart ?? ""),
    weekEnd: String(payload.weekEnd ?? shops[0]?.weekEnd ?? ""),
    shops,
    totals: {
      weeklySales: Number(rawTotals.weeklySales ?? 0),
      weeklyApprovedCollections: Number(rawTotals.weeklyApprovedCollections ?? 0),
      weeklyPendingCollections: Number(rawTotals.weeklyPendingCollections ?? 0),
      balance: Number(rawTotals.balance ?? 0),
      recoveryPercentage: Number(rawTotals.recoveryPercentage ?? 0),
    },
  };
}

/**
 * Collection Report — official financial totals (payment mode + collector
 * breakdown). Backend-authoritative; CollectionReportPage must render this
 * as-is and must not recompute totals/percentages from raw collection rows.
 */
async function fetchCollectionReport(filters: {
  fromDate: string;
  toDate: string;
  shopId?: number;
  collector?: string;
  paymentMode?: string;
}): Promise<CollectionReportSummary> {
  const { data } = await apiGet<CollectionReportSummary>(`${COLLECTION_PATH}/report`, {
    params: {
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      shopId: filters.shopId,
      collector: filters.collector,
      paymentMode: filters.paymentMode,
    },
  });
  return {
    fromDate: String(data.fromDate),
    toDate: String(data.toDate),
    totalAmount: Number(data.totalAmount ?? 0),
    totalCount: Number(data.totalCount ?? 0),
    totalCollectors: Number(data.totalCollectors ?? 0),
    paymentModeSummary: (data.paymentModeSummary ?? []).map((r) => ({
      paymentMode: String(r.paymentMode),
      count: Number(r.count ?? 0),
      amount: Number(r.amount ?? 0),
      percentage: Number(r.percentage ?? 0),
    })),
    collectorsByPaymentMode: (data.collectorsByPaymentMode ?? []).map((r) => ({
      paymentMode: String(r.paymentMode),
      collectorCount: Number(r.collectorCount ?? 0),
    })),
    collectorSummary: (data.collectorSummary ?? []).map((r) => ({
      collector: String(r.collector),
      amounts: Object.fromEntries(
        Object.entries(r.amounts ?? {}).map(([mode, amt]) => [mode, Number(amt ?? 0)])
      ),
      total: Number(r.total ?? 0),
    })),
  };
}

function mapWeeklySummary(data: CollectionWeeklySummary): CollectionWeeklySummary {
  return {
    shopId: Number(data.shopId),
    shopName: String(data.shopName ?? ""),
    weekStart: String(data.weekStart),
    weekEnd: String(data.weekEnd),
    balance: Number(data.balance ?? 0),
    weeklySales: Number(data.weeklySales ?? 0),
    approvedCollections: Number(data.approvedCollections ?? 0),
    pendingCollections: Number(data.pendingCollections ?? 0),
    isCurrentWeek: Boolean(data.isCurrentWeek),
  };
}

export const collectionService = {
getShopSales,
  getCollections,
  saveCollections,
  getNextCollectionNumber,
  getPendingCollections,
  fetchRecentCollectionsForShop,
  saveCollection: saveCollectionLegacy,
  updateCollection,
  deleteCollection,
  deletePendingCollection,
  approveCollection,
  rejectCollection,
  getRecentCollections,
  getPendingApprovalCount,
  getApprovedCount,
  getCollectorSummary,
  getPaymentModeSummary,
  getDashboardSummary,
  refreshCollections,
  getCollectionsForShop,
  refreshFromBackend,
  getEntries,
  getEntriesForShop,
  toEntryInput,
  getShopIdForName,
  getShopBalance,
  fetchWeeklySummary,
  fetchWeeklySummaries,
  fetchWeekBounds,
  fetchCollectionReport,
  fetchPendingSummary,
};

/** Prime the cache as soon as the module is imported (e.g. Header/dashboard). */
if (typeof window !== "undefined") {
  refreshFromBackend().catch(() => {
    /* cache stays empty until a collection module triggers a refresh */
  });
}
