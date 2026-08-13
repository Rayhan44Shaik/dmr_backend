import type pg from "pg";
type Client = pg.PoolClient;
export declare function assertEmployeeExists(id: number | null | undefined, label?: string, client?: Client | null): Promise<void>;
export declare function assertVehicleExists(id: number | null | undefined, client?: Client | null): Promise<void>;
export declare function assertFarmExists(id: number | null | undefined, client?: Client | null): Promise<void>;
export declare function assertShopExists(id: number | null | undefined, client?: Client | null): Promise<void>;
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
