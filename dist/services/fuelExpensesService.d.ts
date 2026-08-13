import type { FuelExpense } from "../types/operations.js";
import { type PaginatedResult, type PaginationParams } from "../utils/pagination.js";
export declare const fuelExpensesService: {
    list(filters?: {
        vehicleId?: number;
        driverId?: number;
        fromDate?: string;
        toDate?: string;
        status?: string;
        sourceType?: string;
        search?: string;
        includeDeleted?: boolean;
        pagination?: PaginationParams | null;
    }): Promise<FuelExpense[] | PaginatedResult<FuelExpense>>;
    getById(id: string): Promise<FuelExpense>;
    /** Manual fuel entry only — Trip fuel is created exclusively by
     * syncDieselToFuelExpenses (tripFuelSync.ts) during Step 5 submission. */
    create(body: unknown): Promise<FuelExpense>;
    update(id: string, body: unknown): Promise<FuelExpense>;
    /** Approve a PENDING manual fuel expense. Trip-generated fuel is
     * auto-approved by tripsService.updateStatus on trip completion and is
     * never approved through this manual action. */
    approve(id: string, body: unknown): Promise<FuelExpense>;
    /** Reject a PENDING manual fuel expense. A reason is mandatory. */
    reject(id: string, body: unknown): Promise<FuelExpense>;
    softDelete(id: string, reason?: string): Promise<FuelExpense>;
};
