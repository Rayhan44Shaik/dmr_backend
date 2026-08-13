import type { Bank, BirdType, Employee, Farm, Shop, Vehicle } from "../types/models.js";
export declare const mastersService: {
    listEmployees(department?: string): Promise<Employee[]>;
    upsertEmployee(body: Partial<Employee> & {
        employeeName: string;
    }): Promise<Employee>;
    updateEmployeeStatus(id: number, status: Employee["status"]): Promise<Employee>;
    deleteEmployee(id: number): Promise<{
        id: number;
        deleted: boolean;
        deactivated: boolean;
    }>;
    listVehicles(): Promise<Vehicle[]>;
    upsertVehicle(body: Partial<Vehicle> & {
        vehicleNumber: string;
    }): Promise<Vehicle>;
    updateVehicleStatus(id: number, status: Vehicle["status"]): Promise<Vehicle>;
    deleteVehicle(id: number): Promise<{
        id: number;
        deleted: boolean;
        deactivated: boolean;
    }>;
    listFarms(): Promise<Farm[]>;
    upsertFarm(body: Partial<Farm> & {
        farmName: string;
    }): Promise<Farm>;
    updateFarmStatus(id: number, status: Farm["status"]): Promise<Farm>;
    deleteFarm(id: number): Promise<{
        id: number;
        deleted: boolean;
        deactivated: boolean;
    }>;
    listShops(): Promise<Shop[]>;
    upsertShop(body: Partial<Shop> & {
        shopName: string;
    }): Promise<Shop>;
    updateShopStatus(id: number, status: Shop["status"]): Promise<Shop>;
    deleteShop(id: number): Promise<{
        id: number;
        deleted: boolean;
        deactivated: boolean;
    }>;
    /** Bulk create — validates every row first, inserts all in one transaction. */
    bulkCreateShops(inputs: (Partial<Shop> & {
        shopName: string;
    })[]): Promise<Shop[]>;
    /**
     * Bulk create farms — validates the whole batch first, then inserts all
     * rows in one transaction. Any failure rolls back the entire batch.
     */
    bulkCreateFarms(inputs: Record<string, unknown>[]): Promise<Farm[]>;
    /**
     * Bulk create vehicles — validates the whole batch first, then inserts all
     * rows in one transaction. Preserves emiDay and totalEMIs end to end.
     */
    bulkCreateVehicles(inputs: Record<string, unknown>[]): Promise<Vehicle[]>;
    /**
     * Bulk create employees — validates the whole batch first, then inserts all
     * rows in one transaction. employeeNo is always server-assigned.
     */
    bulkCreateEmployees(inputs: Record<string, unknown>[]): Promise<Employee[]>;
    /**
     * Bulk create bird types — validates the whole batch first, then inserts all
     * rows in one transaction.
     */
    bulkCreateBirdTypes(inputs: Record<string, unknown>[]): Promise<BirdType[]>;
    listBanks(): Promise<Bank[]>;
    upsertBank(body: Partial<Bank> & {
        bankName: string;
    }): Promise<Bank>;
    updateBankStatus(id: number, status: Bank["status"]): Promise<Bank>;
    deleteBank(id: number): Promise<{
        id: number;
        deleted: boolean;
        deactivated: boolean;
    }>;
    listBirdTypes(): Promise<BirdType[]>;
    upsertBirdType(body: Partial<BirdType> & {
        birdType: string;
    }): Promise<BirdType>;
    updateBirdTypeStatus(id: number, status: BirdType["status"]): Promise<BirdType>;
    deleteBirdType(id: number): Promise<{
        id: number;
        deleted: boolean;
        deactivated: boolean;
    }>;
};
