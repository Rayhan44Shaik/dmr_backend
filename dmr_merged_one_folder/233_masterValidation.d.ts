export declare const EMPLOYEE_DEPARTMENTS: string[];
export declare const ACTIVE_STATUSES: string[];
export declare const EMPLOYEE_STATUSES: string[];
export type FieldError = {
    field: string;
    message: string;
};
export declare function isMissing(value: unknown): boolean;
export declare function isPositiveNumber(value: unknown): boolean;
export declare function isValidDateInput(value: unknown): boolean;
export declare function aadharNumberOrNull(raw: Record<string, unknown>): string | null;
export declare function licenseNumberOrNull(raw: Record<string, unknown>): string | null;
export declare function validateShopFields(raw: Record<string, unknown>): FieldError[];
export declare function validateFarmFields(raw: Record<string, unknown>): FieldError[];
export declare function validateVehicleFields(raw: Record<string, unknown>): FieldError[];
export declare function validateEmployeeFields(raw: Record<string, unknown>): FieldError[];
export declare function validateBirdTypeFields(raw: Record<string, unknown>): FieldError[];
export declare function validateRouteFields(raw: Record<string, unknown>): FieldError[];
/** All rate columns on a market-rate record (Additional Metrics + Company Rates + Size Categories). */
export declare const MARKET_RATE_NUMERIC_FIELDS: readonly ["vij", "gun", "rp", "sneha", "vencobRate", "vencobVii", "vencobGun", "associationVii", "c17", "c15", "c13", "c12", "c10"];
export declare function validateMarketRateFields(raw: Record<string, unknown>): FieldError[];
