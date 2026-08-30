import type pg from "pg";
import type { DieselEntry } from "../types/models.js";
type Client = pg.PoolClient;
/**
 * Upsert fuel_expenses rows from trip diesel entries (Step 5 sync).
 *
 * Identity is (trip_id, trip_fuel_entry_index) — the diesel row's stable
 * rowIndex — backed by a partial unique index (source_type='TRIP', not
 * deleted). This makes the sync idempotent under repeat/concurrent processing.
 * Manual entries (source_type='MANUAL') are never touched here.
 *
 * Bill numbers are TR-YYYYMMDD-NNN where NNN is the diesel row_index for that
 * trip. Two trips on the same date may share the same display bill_no; they
 * are distinguished by trip_id.
 */
export declare function syncDieselToFuelExpenses(client: Client, tripId: number, tripDate: string, entries: DieselEntry[], context: {
    vehicleId?: number | null;
    vehicleNo?: string | null;
    driverId?: number | null;
    driverName?: string | null;
    supervisorId?: number | null;
    supervisorName?: string | null;
    createdBy?: string;
    tripStatus?: string | null;
    tripNo?: string | null;
}): Promise<void>;
/**
 * Fuel-only pull of existing Trip Step 5 diesel bills.
 * Does not change trip tables. Used because Step 5 persist and trip completion
 * live in the Trip module, which this task must not edit.
 */
export declare function ingestCompletedTripDieselToFuel(client: Client, tripId?: number): Promise<number>;
export declare function loadDcPhoto(client: Client, tripId: number, dcPhotoKey: string | null): Promise<{
    dcPhotoKey: string | null;
    dcPhotoMime: string | null;
    dcPhotoData: string | null;
    dcPhotoKey2: string | null;
    dcPhotoMime2: string | null;
    dcPhotoData2: string | null;
}>;
export {};
