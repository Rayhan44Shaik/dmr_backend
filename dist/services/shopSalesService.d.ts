import type { ShopSale } from "../types/operations.js";
import { type PaginatedResult, type PaginationParams } from "../utils/pagination.js";
/**
 * Shop sales are trip_deliveries rows (+ parent trip). No separate
 * shop_sales table — deliberately reusing the existing Trip → Delivery
 * relationship instead of duplicating it (see 023_shop_sales_hardening.sql).
 */
export declare const shopSalesService: {
    list(filters?: {
        shopId?: number;
        fromDate?: string;
        toDate?: string;
        status?: string;
        includeDeleted?: boolean;
        pagination?: PaginationParams | null;
    }): Promise<ShopSale[] | PaginatedResult<ShopSale>>;
    getById(id: number): Promise<ShopSale>;
    create(body: unknown): Promise<ShopSale>;
    /**
     * Reaching this function already requires the trip's Rate Entry to be
     * locked (assertRateEntryLocked below) — so `rate`/`amount` are always
     * the LOCKED price at this point, never an unpriced placeholder. Once
     * locked, the price is immutable: Shop Sales may only correct
     * birds/weight/mortality/remarks/bird type, never re-price a delivery or
     * reassign it to a different shop/trip. A client that includes
     * rate/amount/shopId/shopName/tripId in the request body is rejected
     * outright (409) rather than having those fields silently dropped, so
     * the immutability is an explicit, visible contract rather than a
     * side-effect of which SQL columns happen to be in the UPDATE.
     */
    update(id: number, body: unknown): Promise<ShopSale>;
    /**
     * Historically this endpoint mutated the *parent trip's* status
     * (Draft/Pending/Completed/Deleted) based on an ops-facing status value —
     * completely bypassing the validated trip status-transition table
     * (assertTripStatusTransition) and the wizard-completion gate
     * (assertTripReadyForCompletion) that the real trip status endpoint
     * (tripsService.updateStatus) enforces. That let a direct API call flip
     * an incomplete trip straight to "Completed". A Shop Sale has no
     * independent status of its own (Shop Sales is a projection of
     * trip_deliveries — see shopSalesService module comment) beyond whether
     * the row itself is soft-deleted, so this endpoint now only supports
     * that one real transition — soft-delete — under the exact same guards
     * softDelete() already uses (Rate Entry must be locked, trip must be
     * editable/Approved-or-Completed). Every other status value is rejected;
     * trip status must be changed through tripsService.updateStatus, never
     * through Shop Sales.
     */
    updateStatus(id: number, body: unknown): Promise<ShopSale>;
    /** Soft-delete only — birds/weight/rate/amount are preserved for the
     * historical accounting record, never zeroed out. Allowed only within the
     * 10-day edit window. */
    softDelete(id: number, reason?: string): Promise<ShopSale>;
};
