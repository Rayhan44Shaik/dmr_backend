/* ==========================================================
   COLLECTION STATUS
   Mirrors backend ops_record_status (collection-entry API).
========================================================== */

export type CollectionStatus =
  | "Pending Approval"
  | "Approved"
  | "Rejected"
  | "Deleted"
  | "Draft";

/** Legacy 2-state view used by some modules. Do not extend UI logic on this. */
export type CollectionLegacyStatus = "Pending" | "Approved" | "Deleted";

/* ==========================================================
   COLLECTION API ENTRY
   Exact backend shape from GET/POST /operations/collection-entry
========================================================== */

export interface CollectionApiEntry {
  id: number;
  collectionNo: string;
  collectionDate: string;
  shopId: number | null;
  shopName: string;
  tripId: number | null;
  amountDue: number;
  amount: number;
  amountCollected: number;
  collector: string;
  paymentMode: string;
  referenceNo: string;
  remarks: string;
  status: CollectionStatus;
  deleted: boolean;
  deletedBy?: string | null;
  deletedAt?: string | null;
  isFinancial: boolean;
  openingBalance: number | null;
  closingBalance: number | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdBy: string;
  createdAt: string | null;
  updatedAt?: string | null;
  /** Backend-authoritative Pending Collection delete eligibility (from GET .../recent). UI convenience only — backend enforces on DELETE regardless. */
  canDelete?: boolean;
}

/** Payload for POST /operations/collection-entry */
export interface CollectionEntryInput {
  collectionDate: string;
  shopId: number;
  shopName?: string;
  collector?: string;
  paymentMode?: string;
  referenceNo?: string;
  remarks?: string;
  amount: number;
  createdBy?: string;
}

/* ==========================================================
   COLLECTION ENTRY FORM
   UI form state consumed by the Entry page and its components
========================================================== */

export interface CollectionEntry {
  collectionId: string;
  collectionNo: string;
  collectionDate: string;
  shopName: string;
  collectorName: string;
  paymentModeName: string;
  referenceNo: string;
  amount: number;
  remarks: string;
  numericId?: number;
  numericShopId?: number | null;
}

/* ==========================================================
   PAYMENT MODE
========================================================== */

export interface PaymentMode {
  id: string;
  name: string;
}

/* ==========================================================
   COLLECTOR
========================================================== */

export interface Collector {
  employeeName: string;
}

/* ==========================================================
   COLLECTION (legacy view for external modules)
========================================================== */

export interface Collection {
  id: string;
  collectionNo: string;
  collectionDate: string;
  shopName: string;
  collectorName: string;
  paymentModeName: string;
  referenceNo: string;
  amount: number;
  remarks: string;
  status: CollectionLegacyStatus;
  createdDate: string;
  createdBy: string;
  approvedDate?: string;
  approvedBy?: string;
  modifiedDate?: string;
  modifiedBy?: string;
  /** Backend ids surfaced for the collection module */
  numericId?: number;
  numericShopId?: number | null;
}

/* ==========================================================
   PENDING SHOP
========================================================== */

export interface PendingCollection {
  shopId?: number;
  shopName: string;
  totalSales: number;
  totalCollections: number;
  currentPending: number;
  overdueDays: number;
  lastCollectionDate: string;
}

/* ==========================================================
   RECENT COLLECTION
========================================================== */

export interface RecentCollection {
  id: string;
  collectionNo: string;
  collectionDate: string;
  shopName: string;
  collectorName: string;
  paymentModeName: string;
  referenceNo: string;
  amount: number;
  remarks: string;
  status: CollectionLegacyStatus;
  /** Exact backend status ("Pending Approval" | "Approved" | "Rejected" | "Deleted"). */
  rawStatus?: CollectionStatus;
  approvedBy?: string;
  approvedDate?: string;
  numericId?: number;
  numericShopId?: number | null;
}

/* ==========================================================
   ENTRY VALIDATION
========================================================== */

export interface CollectionErrors {
  collectionDate?: string;
  shopName?: string;
  collectorName?: string;
  paymentModeName?: string;
  referenceNo?: string;
  amount?: string;
  remarks?: string;
}

/* ==========================================================
   COLLECTION FILTER
========================================================== */

export interface CollectionFilter {
  fromDate: string;
  toDate: string;
  shopName: string;
  collectorName: string;
  paymentModeName: string;
  status: string;
}

/* ==========================================================
   PAGINATION
========================================================== */

export interface Pagination {
  page: number;
  pageSize: number;
  totalRecords: number;
  totalPages: number;
}

/* ==========================================================
   COLLECTOR SUMMARY
========================================================== */

export interface CollectorSummary {
  collectorId: string;
  collectorName: string;
  totalCollections: number;
  totalAmount: number;
}

/* ==========================================================
   PAYMENT MODE SUMMARY
========================================================== */

export interface PaymentModeSummary {
  paymentModeName: string;
  totalCollections: number;
  totalAmount: number;
  percentage: number;
}

/* ==========================================================
   COLLECTION DASHBOARD
========================================================== */

export interface CollectionDashboardSummary {
  totalPendingShops: number;
  totalPendingAmount: number;
  pendingApproval: number;
  approvedCollections: number;
}

/** GET /operations/collection-entry/weekly-summary */
export interface CollectionWeeklySummary {
  shopId: number;
  shopName: string;
  weekStart: string;
  weekEnd: string;
  /** Authoritative live shop outstanding (shops.current_balance) — persistent, never weekly. */
  balance: number;
  weeklySales: number;
  approvedCollections: number;
  pendingCollections: number;
  isCurrentWeek: boolean;
}

/** GET /operations/collection-entry/week-bounds */
export interface CollectionWeekBounds {
  asOfDate: string;
  weekStart: string;
  weekEnd: string;
  isCurrentWeek: boolean;
}

/** GET /operations/collection-entry/pending-summary — one row per active
 * shop, fully backend-aggregated (balance/sales/approved/pending/recovery).
 * This is the Pending Collection main table's authoritative source: do not
 * recompute recoveryPercentage or balance from these fields. */
export interface CollectionPendingSummaryRow {
  shopId: number;
  shopName: string;
  weekStart: string;
  weekEnd: string;
  /** Authoritative live shop outstanding (shops.current_balance) — persistent, never weekly. */
  balance: number;
  weeklySales: number;
  weeklyApprovedCollections: number;
  weeklyPendingCollections: number;
  recoveryPercentage: number;
  overdueDays: number | null;
  hasPendingCollections: boolean;
  lastCollectionDate?: string | null;
}

export interface PendingReportRow {
  shopId: number;
  shopName: string;
  ownerName: string;
  phoneNumber: string;
  weekStart: string;
  weekEnd: string;
  balance: number;
  weeklySales: number;
  weeklyApprovedCollections: number;
  weeklyPendingCollections: number;
  recoveryPercentage: number;
  overdueDays: number | null;
  lastCollectionDate: string | null | undefined;
  hasPendingCollections: boolean;
}

export interface CollectionPendingSummaryTotals {
  weeklySales: number;
  weeklyApprovedCollections: number;
  weeklyPendingCollections: number;
  balance: number;
  recoveryPercentage: number;
}

export interface CollectionPendingSummaryResponse {
  weekStart: string;
  weekEnd: string;
  shops: CollectionPendingSummaryRow[];
  totals: CollectionPendingSummaryTotals;
}

/** GET /operations/collection-entry/report — official financial totals for
 * the Collection Report page/PDF/Excel export. Backend-authoritative: do not
 * recompute these from raw collection rows. */
export interface CollectionReportPaymentModeRow {
  paymentMode: string;
  count: number;
  amount: number;
  percentage: number;
}

export interface CollectionReportCollectorRow {
  collector: string;
  amounts: Record<string, number>;
  total: number;
}

export interface CollectionReportSummary {
  fromDate: string;
  toDate: string;
  totalAmount: number;
  totalCount: number;
  totalCollectors: number;
  paymentModeSummary: CollectionReportPaymentModeRow[];
  collectorsByPaymentMode: { paymentMode: string; collectorCount: number }[];
  collectorSummary: CollectionReportCollectorRow[];
}