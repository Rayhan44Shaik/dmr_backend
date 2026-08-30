import type { FuelExpense } from "../types/operations.js";
import { type PaginatedResult, type PaginationParams } from "../utils/pagination.js";
export declare const fuelExpensesService: {
    reconcileTripOrigin(): Promise<number>;
    list(filters?: {
        vehicleId?: number;
        vehicleNo?: string;
        driverId?: number;
        fromDate?: string;
        toDate?: string;
        status?: string;
        sourceType?: string;
        tripNo?: string;
        billNo?: string;
        search?: string;
        includeDeleted?: boolean;
        pagination?: PaginationParams | null;
    }): Promise<FuelExpense[] | PaginatedResult<FuelExpense>>;
    getById(id: string): Promise<FuelExpense>;
    create(body: unknown): Promise<FuelExpense>;
    update(id: string, body: unknown): Promise<FuelExpense>;
    approve(id: string, body: unknown): Promise<FuelExpense>;
    reject(id: string, body: unknown): Promise<FuelExpense>;
    softDelete(id: string, reason?: string): Promise<FuelExpense>;
};
