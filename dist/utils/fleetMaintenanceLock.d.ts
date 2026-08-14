/**
 * Fleet Maintenance 10-day edit/delete window, anchored on the record's
 * business date (maintenance_date) — mirrors tripDeliverySync.ts's pattern for
 * Shop Sales, which anchors on the trip's business event rather than a system
 * timestamp. "10 days after this maintenance happened" is the business rule:
 * you cannot backdate-create, edit, or delete a maintenance record for a date
 * more than EDIT_WINDOW_DAYS in the past.
 *
 * This was previously enforced only in the frontend (maintenanceHelpers.ts
 * isEditable(), keyed off createdAt) and was trivially bypassed via direct API
 * calls — this is the first backend enforcement of it.
 */
export declare function maintenanceEditWindowExpiresAt(maintenanceDate: string): Date;
export declare function isMaintenanceDateWithinEditWindow(maintenanceDate: string): boolean;
/** Throws 409 if `maintenanceDate` is more than EDIT_WINDOW_DAYS in the past.
 * Used for CREATE (is the date being backdated too far?) and for
 * UPDATE/DELETE (is the existing record's date still within the window?). */
export declare function assertMaintenanceDateEditable(maintenanceDate: string, billNo?: string): void;
