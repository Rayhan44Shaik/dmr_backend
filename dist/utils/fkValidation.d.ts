import type pg from "pg";
type Client = pg.PoolClient;
export declare function assertEmployeeExists(id: number | null | undefined, label?: string, client?: Client | null): Promise<void>;
export declare function assertVehicleExists(id: number | null | undefined, client?: Client | null): Promise<void>;
/** Stricter than assertVehicleExists: also rejects an Inactive (soft-deleted /
 * cancelled) vehicle. Mirrors assertShopActive — new trip/fuel/meter activity
 * against an inactive vehicle is rejected, while historical records that
 * already reference it keep working. Backend-enforced; frontend filtering
 * alone is insufficient. */
export declare function assertVehicleActive(id: number | null | undefined, client?: Client | null): Promise<void>;
export declare function assertFarmExists(id: number | null | undefined, client?: Client | null): Promise<void>;
export declare function assertShopExists(id: number | null | undefined, client?: Client | null): Promise<void>;
/** Stricter than assertShopExists: also rejects a soft-deleted (Inactive)
 * shop. Use this wherever a NEW transactional record (e.g. a Shop Sale) is
 * being created against a shop — existing historical records that already
 * reference a since-deactivated shop must keep working, but new activity
 * against an inactive shop should not be possible. */
export declare function assertShopActive(id: number | null | undefined, client?: Client | null): Promise<void>;
export declare function assertBirdTypeExists(id: number | null | undefined, client?: Client | null): Promise<void>;
export declare function assertTripExists(id: number | null | undefined, client?: Client | null): Promise<void>;
export declare function validateTripForeignKeys(body: {
    vehicleId?: number | null;
    driverId?: number | null;
    supervisorId?: number | null;
    sourceFarmId?: number | null;
    farmBirdTypeId?: number | null;
    deliveries?: Array<{
        shopId?: number | null;
        birdTypeId?: number | null;
    }>;
}, client?: Client | null): Promise<void>;
export declare function resolveEmployeeNames(client: Client, names: string[], role: "helper" | "loader"): Promise<Array<{
    employeeId: number | null;
    employeeName: string;
}>>;
export {};
