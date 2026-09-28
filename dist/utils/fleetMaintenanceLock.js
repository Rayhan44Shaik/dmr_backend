import { AppError } from "../middleware/errorHandler.js";
const EDIT_WINDOW_DAYS = 10;
/**
 * Fleet Maintenance 10-day edit/delete window, anchored on created_at — the
 * moment the bill was entered. Historical bill dates are valid on CREATE; once
 * saved, that record may be corrected or deleted for ten days from entry.
 */
export function maintenanceEditWindowExpiresAt(createdAt) {
    const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
    const expires = new Date(created.getTime() + EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    return expires;
}
export function isMaintenanceWithinEditWindow(createdAt) {
    return new Date() <= maintenanceEditWindowExpiresAt(createdAt);
}
/** Throws 409 when an already-created record's correction window has closed. */
export function assertMaintenanceRecordEditable(createdAt, billNo) {
    if (!isMaintenanceWithinEditWindow(createdAt)) {
        const expired = maintenanceEditWindowExpiresAt(createdAt);
        throw new AppError(409, `Maintenance record ${billNo ?? ""} is locked — the 10-day edit window closed on ${expired
            .toISOString()
            .slice(0, 10)}. This saved record can no longer be edited or deleted.`
            .replace(/\s+/g, " ")
            .trim());
    }
}
//# sourceMappingURL=fleetMaintenanceLock.js.map