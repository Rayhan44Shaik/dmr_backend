import type { RateEntryTrip } from "../types/operations.js";
import { type PaginatedResult, type PaginationParams } from "../utils/pagination.js";
export declare const rateEntryService: {
    list(filters?: {
        fromDate?: string;
        toDate?: string;
        vehicleId?: number;
        supervisorId?: number;
        driverId?: number;
        farmId?: number;
        search?: string;
        pagination?: PaginationParams | null;
    }): Promise<RateEntryTrip[] | PaginatedResult<RateEntryTrip>>;
    getById(id: number): Promise<RateEntryTrip>;
    save(tripId: number, body: unknown): Promise<RateEntryTrip>;
    lock(tripId: number, body: unknown): Promise<RateEntryTrip>;
};
export declare function countEligible(): Promise<number>;
