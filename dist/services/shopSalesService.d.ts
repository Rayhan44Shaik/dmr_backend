import type { ShopSale } from "../types/operations.js";
import { type PaginatedResult, type PaginationParams } from "../utils/pagination.js";
export declare const shopSalesService: {
    list(filters?: {
        shopId?: number;
        fromDate?: string;
        toDate?: string;
        status?: string;
        search?: string;
        sortBy?: string;
        includeDeleted?: boolean;
        pagination?: PaginationParams | null;
    }): Promise<ShopSale[] | PaginatedResult<ShopSale>>;
    getById(id: number): Promise<ShopSale>;
    create(body: unknown): Promise<ShopSale>;
    update(id: number, body: unknown): Promise<ShopSale>;
    updateStatus(id: number, body: unknown): Promise<ShopSale>;
    softDelete(id: number, reason?: string): Promise<ShopSale>;
};
