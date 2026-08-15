import type pg from "pg";
type Client = pg.PoolClient;
/** Trip statuses finalized enough to receive/carry a Rate Entry and, once
 * locked, to be Shop-Sales-eligible. Single shared source — Rate Entry
 * eligibility (rateEntryService.ts) and Shop Sales eligibility (below) must
 * never drift apart, since a trip that can be rate-locked but can't reach
 * Shop Sales afterwards would be a dead end. */
export declare const RATE_ENTRY_ELIGIBLE_STATUSES: readonly ["Approved", "Completed"];
export declare function editWindowExpiresAt(trip: {
    approvedAt?: string | null;
    tripDate: string;
}): Date;
/** A trip (and therefore its Shop Sales) is editable only while it has not
 * yet reached the finalized "Completed" state (still mid-workflow, handled
 * elsewhere), or — once Completed — only within EDIT_WINDOW_DAYS of
 * completion. Deleted trips are never editable. */
export declare function isTripEditable(trip: {
    status: string;
    deleted?: boolean;
    approvedAt?: string | null;
    tripDate: string;
}): boolean;
export declare function assertTripEditable(trip: {
    tripNo?: string;
    status: string;
    deleted?: boolean;
    approvedAt?: string | null;
    tripDate: string;
}): void;
/** Shop Sales is the post-completion editable layer over trip_deliveries —
 * Draft/Pending trips must only be mutated through Trip Entry Step 4
 * (replaceDeliveries), never through this API. Deleted trips are already
 * rejected by assertTripEditable; this additionally rejects any trip that
 * hasn't reached a finalized status yet. Uses the same
 * RATE_ENTRY_ELIGIBLE_STATUSES as Rate Entry — a trip whose rate can be
 * locked must always be able to reach Shop Sales afterwards. */
export declare function assertTripCompletedForShopSales(trip: {
    tripNo?: string;
    status: string;
}): void;
/** Same advisory-lock + MAX(seq)+1 pattern as tripsService.generateTripNo,
 * scoped per trip instead of per trip-date. Format: "<tripNo>-S01". */
export declare function generateSaleNo(client: Client, tripId: number, tripNo: string): Promise<string>;
/** Recomputes every delivered-side KPI column on trips — total_shops,
 * total_delivered_weight, total_birds_delivered, total_mortality(_count/_weight),
 * weight_loss, survival_rate, last_shop — from the live, non-deleted
 * trip_deliveries rows. These are exactly the columns computeTripKpis()
 * (tripCalculations.ts) derives from deliveries at Trip Entry time; calling
 * this after every Shop Sale create/update/delete keeps them in sync with
 * Trip List/Trip View without touching any Trip List/Trip Entry UI or
 * duplicating these totals anywhere else. */
export declare function recalcTripDeliveryTotals(client: Client, tripId: number): Promise<void>;
/** Sums birds/weight AND mortality (mortality/mort_kg) of active
 * (non-deleted) trip_deliveries for a trip, optionally excluding one row
 * (the sale being edited). Farm capacity is consumed by delivered birds/
 * weight AND mortality together — a bird/kg either reaches a shop or is
 * recorded as mortality, but either way it came out of the farm load. */
export declare function sumActiveDeliveries(client: Client, tripId: number, excludeId?: number): Promise<{
    birds: number;
    weight: number;
    mortalityCount: number;
    mortalityWeight: number;
}>;
export declare function assertWithinCapacity(opts: {
    label: "birds" | "weight";
    available: number;
    alreadyAllocated: number;
    requested: number;
}): void;
export {};
