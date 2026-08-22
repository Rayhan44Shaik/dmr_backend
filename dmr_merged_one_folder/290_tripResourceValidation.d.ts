import type pg from "pg";
type Client = pg.PoolClient;
export interface TripResourceInput {
    /** The trip being created/edited (0/undefined/null => brand-new trip). */
    tripId?: number | null;
    vehicleId?: number | null;
    driverId?: number | null;
    supervisorId?: number | null;
    helpers?: string[];
    loaders?: string[];
}
/**
 * Throw an HTTP 409 with a clear message if any of the supplied resources is
 * already assigned to another active (Draft) trip. Returns normally otherwise.
 */
export declare function assertTripResourcesAvailable(input: TripResourceInput | null | undefined, client: Client): Promise<void>;
export {};
