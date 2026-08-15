import type pg from "pg";
import type { RateEntry, RateEntryTrip } from "../types/operations.js";
import { type PaginatedResult, type PaginationParams } from "../utils/pagination.js";
type Client = pg.PoolClient;
export declare const rateEntryService: {
    /** Trips eligible for Rate Entry: finalized (Approved/Completed), not
     * deleted, and not yet rate-locked. A trip with a saved-but-unlocked rate
     * still appears here (rateStatus = "Entered") — Rate Entry is only ever
     * permanently excluded once its rate is explicitly LOCKED via lock(). */
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
    /**
     * Save (upsert) a trip's rate entry — the header record plus, optionally,
     * shop-wise rates on the trip's deliveries. Safe to call repeatedly while
     * unlocked (each call overwrites the same row). Rejected once the trip's
     * rate has been locked. Fully transactional: on any validation failure
     * the transaction rolls back and nothing is partially saved.
     */
    create(body: unknown): Promise<RateEntry>;
    /** Edits the same rate record — never creates a second row for the trip.
     * Rejected once the rate has been locked (409). */
    update(id: number, body: unknown): Promise<RateEntry>;
    /**
     * Explicit lock — the only backend-controlled way a trip's rate becomes
     * immutable and eligible for Shop Sales. After a successful commit the
     * trip no longer satisfies the Rate Entry eligibility query.
     *
     * Concurrency: both the trip row and (if present) the rate_entry row are
     * SELECT ... FOR UPDATE inside this transaction, so two simultaneous lock
     * (or lock + save) requests for the same trip serialize — the second to
     * reach the row sees the first's committed state (already locked, or the
     * up-to-date rate) rather than racing.
     */
    lock(tripId: number, body: unknown): Promise<RateEntry>;
};
export {};
