import { AppError } from "../middleware/errorHandler.js";

const EDIT_WINDOW_DAYS = 10;

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
export function maintenanceEditWindowExpiresAt(maintenanceDate: string): Date {
  const expires = new Date(maintenanceDate);
  expires.setDate(expires.getDate() + EDIT_WINDOW_DAYS);
  return expires;
}

export function isMaintenanceDateWithinEditWindow(maintenanceDate: string): boolean {
  return new Date() <= maintenanceEditWindowExpiresAt(maintenanceDate);
}

/** Throws 409 if `maintenanceDate` is more than EDIT_WINDOW_DAYS in the past.
 * Used for CREATE (is the date being backdated too far?) and for
 * UPDATE/DELETE (is the existing record's date still within the window?). */
export function assertMaintenanceDateEditable(maintenanceDate: string, billNo?: string): void {
  if (!isMaintenanceDateWithinEditWindow(maintenanceDate)) {
    const expired = maintenanceEditWindowExpiresAt(maintenanceDate);
    throw new AppError(
      409,
      `Maintenance record ${billNo ?? ""} is locked — the 10-day edit window closed on ${expired
        .toISOString()
        .slice(0, 10)}. No creates, edits, or deletes are allowed for this date.`
        .replace(/\s+/g, " ")
        .trim()
    );
  }
}
