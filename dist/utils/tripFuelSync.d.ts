import type pg from "pg";
import type { DieselEntry } from "../types/models.js";
type Client = pg.PoolClient;
/**
 * Upsert fuel_expenses rows from trip diesel entries (Step 5 sync).
 *
 * Identity is (trip_id, trip_fuel_entry_index) — the diesel row's stable
 * rowIndex — backed by a partial unique index (source_type='TRIP', not
 * deleted). This makes the sync idempotent under repeat/concurrent Step 5
 * submissions (INSERT ... ON CONFLICT) instead of relying on bill_no text
 * matching. Manual entries (source_type='MANUAL') are never touched here.
 */
export declare function syncDieselToFuelExpenses(client: Client, tripId: number, tripDate: string, entries: DieselEntry[], context: {
    vehicleId?: number | null;
    vehicleNo?: string | null;
    driverId?: number | null;
    driverName?: string | null;
    supervisorId?: number | null;
    supervisorName?: string | null;
    createdBy?: string;
}): Promise<void>;
export declare function loadDcPhoto(client: Client, tripId: number, dcPhotoKey: string | null): Promise<{
    dcPhotoData: string | null;
    dcPhotoMime: string | null;
}>;
export {};
