/**
 * Fleet Maintenance 10-day edit/delete window, anchored on created_at — the
 * moment the bill was entered. Historical bill dates are valid on CREATE; once
 * saved, that record may be corrected or deleted for ten days from entry.
 */
export declare function maintenanceEditWindowExpiresAt(createdAt: string | Date): Date;
export declare function isMaintenanceWithinEditWindow(createdAt: string | Date): boolean;
/** Throws 409 when an already-created record's correction window has closed. */
export declare function assertMaintenanceRecordEditable(createdAt: string | Date, billNo?: string): void;
