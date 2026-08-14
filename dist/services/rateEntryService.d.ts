import type pg from "pg";
import type { RateEntry, RateEntryTrip } from "../types/operations.js";
import { type PaginatedResult, type PaginationParams } from "../utils/pagination.js";
type Client = pg.PoolClient;
export declare const rateEntryService: {
    /** Trips still waiting for their FIRST rate entry — finalized
     * (status = Completed), not deleted, AND with no rate_entry row yet.
     * Rate Entry is not an editable history page: once a trip has a
     * rate_entry row it is permanently excluded from this list (the row
     * itself is never deleted — Shop Sales/accounting still read it via
     * trip_id — only this listing stops surfacing it). */
    list(filters?: {
        search?: string;
        rateStatus?: "Pending" | "Entered";
        fromDate?: string;
        toDate?: string;
        vehicleNo?: string;
        supervisorName?: string;
        pagination?: PaginationParams | null;
    }): Promise<RateEntryTrip[] | PaginatedResult<RateEntryTrip>>;
    getByTripId(tripId: number, client?: Client | null): Promise<RateEntry | null>;
    getById(id: number): Promise<RateEntry>;
    /** Create-only. A second create for the same trip is rejected with a 409
     * (via the trip_id UNIQUE constraint) rather than silently duplicating —
     * use update() to edit an already-entered rate. */
    create(body: unknown): Promise<RateEntry>;
    /** Edits the same rate record — never creates a second row for the trip. */
    update(id: number, body: unknown): Promise<RateEntry>;
};
export {};
