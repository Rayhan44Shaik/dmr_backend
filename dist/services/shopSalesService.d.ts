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
    update(id: number, body: unknown): Promise<ShopSale>;
    updateStatus(id: number, body: unknown): Promise<ShopSale>;
    /** Soft-delete only — birds/weight/rate/amount are preserved for the
     * historical accounting record, never zeroed out. Allowed only within the
     * 10-day edit window. */
    softDelete(id: number, reason?: string): Promise<ShopSale>;
};
