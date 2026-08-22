// ============================================================
// WEEK RANGE
// ============================================================
export function getCurrentWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday, 1 = Monday ...
  const diff = (day === 0 ? 6 : day - 1); // Monday offset
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

export function formatDateRange(monday: Date, sunday: Date) {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${fmt(monday)} to ${fmt(sunday)}`;
}

// ============================================================
// EDIT / DELETE ELIGIBILITY (10‑day rule)
// ============================================================
/**
 * Checks if an item (created on `createdDate`) can be edited or deleted.
 * Allowed only within 10 days from creation.
 */
export function canEditItem(createdDate: string): boolean {
  const created = new Date(createdDate);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays <= 10;
}

export function canDeleteItem(createdDate: string): boolean {
  return canEditItem(createdDate); // same rule
}

// ============================================================
// SAFE DATE PARSING & FORMATTING (ADDED)
// ============================================================

/**
 * Safely parse a value into a Date object.
 * Returns `new Date()` if the value is invalid or missing.
 */
export function safeDate(value?: string | number): Date {
  if (!value) return new Date();
  const d = new Date(value);
  return isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Format a Date object to YYYY-MM-DD string.
 * Returns empty string if the date is invalid.
 */
export function formatDateToYYYYMMDD(date: Date): string {
  if (!date || isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const formatDate = (date: Date | string, locale = 'en-IN') => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatCurrency = (amount: number, currency = 'INR') => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
};
