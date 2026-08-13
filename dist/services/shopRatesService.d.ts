import type { ShopRate } from "../types/operations.js";
import { type PaginatedResult, type PaginationParams } from "../utils/pagination.js";
/**
 * Shop rates derived from trip_deliveries historical rates.
 * No shop_rates table.
 */
export declare const shopRatesService: {
    list(filters?: {
        shopId?: number;
        status?: string;
        includeDeleted?: boolean;
        pagination?: PaginationParams | null;
    }): Promise<ShopRate[] | PaginatedResult<ShopRate>>;
    getById(id: number): Promise<ShopRate>;
    create(body: unknown): Promise<ShopRate>;
    update(id: number, body: unknown): Promise<ShopRate>;
    updateStatus(id: number, body: unknown): Promise<ShopRate>;
    softDelete(id: number, reason?: string): Promise<ShopRate>;
};
