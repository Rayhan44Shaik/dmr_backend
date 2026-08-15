import type { Collection, RunningBalanceRow } from "../types/operations.js";
import { type PaginatedResult, type PaginationParams } from "../utils/pagination.js";
export declare const collectionsService: {
    list(filters?: {
        shopId?: number;
        fromDate?: string;
        toDate?: string;
        status?: string;
        includeDeleted?: boolean;
        pagination?: PaginationParams | null;
    }): Promise<Collection[] | PaginatedResult<Collection>>;
    pending(shopId?: number): Promise<Collection[]>;
    register(filters?: {
        fromDate?: string;
        toDate?: string;
        shopId?: number;
    }): Promise<PaginatedResult<Collection> | Collection[]>;
    runningBalance(shopId?: number): Promise<RunningBalanceRow[]>;
    getById(id: number): Promise<Collection>;
    create(body: unknown): Promise<Collection>;
    update(id: number, body: unknown): Promise<Collection>;
    updateStatus(id: number, body: unknown): Promise<Collection>;
    softDelete(id: number, reason?: string): Promise<Collection>;
};
