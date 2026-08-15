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
    /**
     * Collections has no state of its own to write — "collected" is derived
     * entirely from rate_entry.locked (see mapCollection above). Previously
     * this endpoint set trips.rate_completed directly (and even promoted
     * trips.status Draft→Pending) based on a client-supplied amountCollected,
     * completely bypassing Rate Entry — a trip could be marked "collected"
     * having never been through Rate Entry or Shop Sales at all. That
     * workflow is removed: use Rate Entry's save/lock endpoints to make a
     * trip's amount collectible; Collections only reports on that state.
     */
    create(_body: unknown): Promise<never>;
    /** See create() — Collections has no independently-writable state. */
    update(_id: number, _body: unknown): Promise<never>;
    /** See create() — Collections has no independently-writable status,
     * including "Deleted": a delivery/sale can only be soft-deleted through
     * the Shop Sales API, and a trip's status can only be changed through
     * the Trip status API. */
    updateStatus(_id: number, _body: unknown): Promise<never>;
    softDelete(id: number, reason?: string): Promise<never>;
};
