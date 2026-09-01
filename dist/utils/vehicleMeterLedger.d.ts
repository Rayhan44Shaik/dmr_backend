import type pg from "pg";
type Client = pg.PoolClient;
type Queryable = Client | null;
/**
 * Millisecond-precise ISO string for a DB timestamptz value being re-used as
 * a validateVehicleMeter `eventInstant`. NOT the same as coerce.ts's
 * isoOrNull(), which round-trips through Date.toString() and silently
 * truncates to whole seconds — harmless for display, but two records
 * created within the same second then collapse to the same instant (or
 * worse, one that no longer reflects true creation order), which is exactly
 * the precision this validator depends on to pick the right neighbor.
 */
export declare function preciseIsoOrUndefined(value: unknown): string | undefined;
export type MeterSourceType = "TRIP_START" | "TRIP_END" | "FUEL" | "MAINTENANCE";
export interface MeterEvent {
    vehicleId: number;
    sourceType: MeterSourceType;
    recordId: string;
    ref: string;
    meter: number;
    eventDate: string;
    eventInstant: string;
}
/**
 * Lock the vehicle's row so a concurrent write for the same vehicle serializes
 * behind this one. Must be called inside the same transaction as the
 * subsequent validateVehicleMeter() + write, before either happens — this is
 * what makes "read latest -> validate -> write" atomic (see db.ts withTransaction).
 */
export declare function lockVehicleForMeterWrite(client: Client, vehicleId: number): Promise<void>;
/** Advisory read: the single latest accepted meter reading for a vehicle,
 * across trips (start + end), fuel expenses, and fleet maintenance — ordered
 * by business date first (event_date), then the most precise available
 * "actually happened at" timestamp (event_instant) — never MAX(meter). */
export declare function getLatestVehicleMeter(client: Queryable, vehicleId: number, 
/**
 * Part L: when the Step 1 opening-meter hint is fetched while EDITING a trip,
 * that trip's own TRIP_START / TRIP_END rows must be excluded so the current
 * trip is never treated as its own previous meter. `vehicle_meter_events`
 * stores the trip id in `record_id` for both trip sources.
 */
excludeTripId?: number | null): Promise<MeterEvent | null>;
interface ExcludeSpec {
    sourceType: MeterSourceType | MeterSourceType[];
    recordId: string | number;
}
/**
 * The one universal meter validator. Looks at the vehicle's chronological
 * neighbors relative to (eventDate, eventInstant) — excluding the record
 * being written, when editing — and rejects `newMeter` if it would either:
 *   - fall below the previous neighbor (the forward-only CREATE rule), or
 *   - rise above the next neighbor (the "don't break historical order" EDIT
 *     rule — a create has no next neighbor, so this never fires for creates).
 *
 * `eventDate` is the record's business date (required — this is the primary
 * chronological key, see the view's comment for why). `eventInstant` tiebreaks
 * same-day records and defaults to "now" when the caller has no more precise
 * timestamp (matching how the view falls back to created_at for Fuel/Maintenance).
 *
 * Must run inside the same transaction as lockVehicleForMeterWrite() and the
 * write itself.
 */
export declare function validateVehicleMeter(client: Client, opts: {
    vehicleId: number;
    newMeter: number;
    eventDate: string;
    eventInstant?: string;
    exclude?: ExcludeSpec;
    context: string;
}): Promise<void>;
/**
 * Latest accepted meter event for EVERY vehicle in one query (DISTINCT ON the
 * same authoritative ordering as getLatestVehicleMeter). Backs the Upcoming
 * Service calculation so the frontend receives one batch from the database
 * instead of N per-vehicle calls — there is exactly ONE meter history and it
 * lives here. Read-only; reuses the vehicle_meter_events view.
 */
export declare function listLatestVehicleMeters(): Promise<MeterEvent[]>;
/** Full ordered timeline for a vehicle — backs the Vehicle History UI. */
export declare function listVehicleMeterHistory(vehicleId: number): Promise<Array<MeterEvent & {
    diffFromPrevious: number | null;
}>>;
export {};
