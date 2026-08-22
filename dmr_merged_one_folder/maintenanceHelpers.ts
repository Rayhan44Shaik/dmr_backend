// utils/maintenanceHelpers.ts

// ============================================================
// EDIT / DELETE ELIGIBILITY (10‑day rule)
// ============================================================
export const isEditable = (createdAt?: string): boolean => {
  if (!createdAt) return false;
  const created = new Date(createdAt);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays <= 10;
};

export const canEditItem = isEditable; // alias for consistency

// ============================================================
// SAFE DATE PARSING
// ============================================================
export const safeDate = (value?: string | number): Date => {
  if (!value) return new Date();
  const d = new Date(value);
  return isNaN(d.getTime()) ? new Date() : d;
};

// ============================================================
// BILL NUMBER GENERATION
// ============================================================

/**
 * Get the next bill number WITHOUT incrementing the counter.
 * Used for display in the form (preview).
 */
export const getBillNumberPreview = (vehicleId: string, vehicleNumber: string): string => {
  const lastFour = vehicleNumber.slice(-4);
  const storageKey = `maintenance_bill_counter_${vehicleId}`;
  const counter = parseInt(localStorage.getItem(storageKey) || '0', 10);
  const next = counter + 1;
  return `Veh-${lastFour}-${next.toString().padStart(4, '0')}`;
};

/**
 * Increment the counter for a vehicle – called ONLY after successful save.
 */
export const incrementBillCounter = (vehicleId: string): void => {
  const storageKey = `maintenance_bill_counter_${vehicleId}`;
  const counter = parseInt(localStorage.getItem(storageKey) || '0', 10);
  localStorage.setItem(storageKey, (counter + 1).toString());
};

/**
 * Generate a new bill number (increments counter) – legacy, kept for compatibility.
 */
export const generateBillNumber = (vehicleId: string, vehicleNumber: string): string => {
  const preview = getBillNumberPreview(vehicleId, vehicleNumber);
  incrementBillCounter(vehicleId);
  return preview;
};