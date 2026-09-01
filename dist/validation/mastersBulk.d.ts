export type BulkEntityKind = "shops" | "vehicles" | "employees" | "farms" | "bird-types";
export declare const ACTIVE_STATUSES: readonly ["Active", "Inactive"];
export declare const EMPLOYEE_STATUSES: readonly ["Active", "Inactive", "Suspended"];
export interface BulkRowError {
    /** 1-based row number in the uploaded batch. */
    row: number;
    /** camelCase field name the error refers to ("" when row-level). */
    field: string;
    /** Safe, human-readable message. */
    message: string;
}
export interface NormalizedShopRow {
    shopNo: number | null;
    shopNumber: string;
    shopName: string;
    ownerName: string;
    phoneNumber: string;
    secondaryPhoneNumber: string;
    email: string;
    city: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    paperRate: number;
    associationType: string;
    status: "Active" | "Inactive";
    openingBalance: number;
}
export interface NormalizedVehicleRow {
    vehicleNo: number | null;
    vehicleNumber: string;
    vehicleType: string;
    noOfBoxes: number;
    birdCapacity: number;
    capacityKg: number;
    trackingId: string;
    fastagBank: string;
    engineNumber: string;
    chassisNumber: string;
    insuranceExpiry: string | null;
    permitExpiry: string | null;
    fitnessExpiry: string | null;
    purchaseDate: string | null;
    purchaseAmount: number | null;
    emiStartDate: string | null;
    rcDate: string | null;
    status: "Active" | "Inactive";
}
export interface NormalizedEmployeeRow {
    employeeNo: number | null;
    employeeName: string;
    department: string;
    role: string;
    phoneNumber: string;
    email: string;
    address: string;
    joiningDate: string | null;
    aadharNumber: string | null;
    licenseNumber: string | null;
    salary: number;
    status: "Active" | "Inactive" | "Suspended";
    avatar: string | null;
}
export interface NormalizedFarmRow {
    farmNo: number | null;
    farmName: string;
    ownerName: string;
    supervisorName: string;
    phoneNumber: string;
    village: string;
    address: string;
    capacity: number;
    status: "Active" | "Inactive";
}
export interface NormalizedBirdTypeRow {
    birdTypeNo: number | null;
    birdType: string;
    averageWeight: number;
    description: string;
    status: "Active" | "Inactive";
}
export type NormalizedBulkRow = NormalizedShopRow | NormalizedVehicleRow | NormalizedEmployeeRow | NormalizedFarmRow | NormalizedBirdTypeRow;
export interface ValidatedBulkBatch {
    rows: NormalizedBulkRow[];
}
/**
 * Validates the request body for a master bulk import.
 *
 * - body must be a non-empty JSON array of plain objects
 * - every row is validated + normalized with the same field rules/defaults as
 *   the singular create endpoints
 * - duplicate rows within the batch are rejected (409)
 *
 * Throws AppError(400 | 409) with structured `details.errors` on failure.
 */
export declare function validateBulkRows(kind: BulkEntityKind, body: unknown): ValidatedBulkBatch;
