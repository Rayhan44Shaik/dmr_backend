// src/modules/reports/vehicle/utils/vehicleReportDates.ts
// -----------------------------------------------------------------------------
// Date-range utilities for the Vehicle Report.
//  · All boundaries are LOCAL calendar dates formatted as YYYY-MM-DD — the
//    same convention the backend/app already uses for tripDate and fuel dates.
//    No UTC conversion, so there are no off-by-one-day artefacts.
//  · Weeks start on Monday (matches src/utils/dateUtils.getCurrentWeekRange).
//  · Financial year: 1 April → 31 March (Indian business convention).
// -----------------------------------------------------------------------------

import type { DateWindow, VehicleReportDatePreset } from "../types/vehicleReportTypes";

/** Local calendar date as YYYY-MM-DD (no UTC conversion). */
export function toLocalISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today's local date as YYYY-MM-DD. */
export function todayISO(): string {
  return toLocalISODate(new Date());
}

/** YYYY-MM-DD shifted by `days` (negative = past). */
export function shiftDaysISO(days: number, from: string = todayISO()): string {
  const [y, m, d] = from.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  return toLocalISODate(date);
}

/** Monday of the week containing the given date. */
function mondayOf(date: Date): Date {
  const day = date.getDay(); // 0 = Sunday
  const offset = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + offset);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/** The financial year window (Apr 1 → Mar 31) containing the given date. */
function financialYearOf(date: Date): DateWindow {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? year : year - 1; // April (month 3) starts the FY
  return {
    from: `${startYear}-04-01`,
    to: `${startYear + 1}-03-31`,
  };
}

export const DATE_PRESET_LABELS: Record<VehicleReportDatePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  thisWeek: "This Week",
  lastWeek: "Last Week",
  thisMonth: "This Month",
  lastMonth: "Last Month",
  thisFY: "This Financial Year",
  lastFY: "Last Financial Year",
  custom: "Custom Range",
};

export const DATE_PRESETS: { key: VehicleReportDatePreset; label: string }[] = (
  Object.keys(DATE_PRESET_LABELS) as VehicleReportDatePreset[]
).map((key) => ({ key, label: DATE_PRESET_LABELS[key] }));

/** Resolve a preset (or custom range) to an inclusive local-date window. */
export function resolveDateWindow(
  preset: VehicleReportDatePreset,
  customFrom?: string,
  customTo?: string
): DateWindow {
  const today = new Date();

  switch (preset) {
    case "today": {
      const iso = toLocalISODate(today);
      return { from: iso, to: iso };
    }
    case "yesterday": {
      const iso = shiftDaysISO(-1);
      return { from: iso, to: iso };
    }
    case "thisWeek": {
      const monday = mondayOf(today);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: toLocalISODate(monday), to: toLocalISODate(sunday) };
    }
    case "lastWeek": {
      const monday = mondayOf(today);
      const prevMonday = new Date(monday);
      prevMonday.setDate(monday.getDate() - 7);
      const prevSunday = new Date(prevMonday);
      prevSunday.setDate(prevMonday.getDate() + 6);
      return { from: toLocalISODate(prevMonday), to: toLocalISODate(prevSunday) };
    }
    case "thisMonth": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { from: toLocalISODate(first), to: toLocalISODate(last) };
    }
    case "lastMonth": {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: toLocalISODate(first), to: toLocalISODate(last) };
    }
    case "thisFY":
      return financialYearOf(today);
    case "lastFY": {
      const window = financialYearOf(today);
      const startYear = Number(window.from.slice(0, 4));
      return { from: `${startYear - 1}-04-01`, to: `${startYear}-03-31` };
    }
    case "custom": {
      const from = customFrom && /^\d{4}-\d{2}-\d{2}$/.test(customFrom) ? customFrom : todayISO();
      const to = customTo && /^\d{4}-\d{2}-\d{2}$/.test(customTo) ? customTo : from;
      return from <= to ? { from, to } : { from: to, to: from };
    }
  }
}

/** Inclusive range check against local YYYY-MM-DD strings. */
export function isInDateWindow(dateStr: string | null | undefined, window: DateWindow): boolean {
  if (!dateStr) return false;
  const normalized = dateStr.trim().slice(0, 10);
  return normalized >= window.from && normalized <= window.to;
}

/** "01 Aug 2026 – 14 Aug 2026" style period label. */
export function formatPeriodLabel(window: DateWindow): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };
  return `${fmt(window.from)} – ${fmt(window.to)}`;
}

/** The default business period for the report (current month). */
export function defaultDateWindow(): DateWindow {
  return resolveDateWindow("thisMonth");
}