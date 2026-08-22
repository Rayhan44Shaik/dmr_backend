import type { BirdType, Employee, Farm, Shop, Vehicle } from "../types/models.js";
import { type BulkRowError } from "../validation/mastersBulk.js";
export interface BulkImportResult<T> {
    total: number;
    successful: number;
    failed: number;
    errors: BulkRowError[];
    created: T[];
}
export declare const mastersBulkService: {
    importShops(body: unknown): Promise<BulkImportResult<Shop>>;
    importVehicles(body: unknown): Promise<BulkImportResult<Vehicle>>;
    importEmployees(body: unknown): Promise<BulkImportResult<Employee>>;
    importFarms(body: unknown): Promise<BulkImportResult<Farm>>;
    importBirdTypes(body: unknown): Promise<BulkImportResult<BirdType>>;
};
