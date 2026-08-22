// src/modules/operations/shop-sales/utils/shopSaleFormat.ts
// Pure display helpers for the Shop Sales table. No React, no I/O — kept
// separate so they can be unit-tested with the project's node:test runner.

import type { ShopSale } from "../types/shopSale";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Weekday short label ("Mon".."Sun") for a backend business date string
 * (YYYY-MM-DD) or Date.
 *
 * The backend date is a date-only value. `new Date("2026-08-20")` parses as
 * UTC midnight, which can shift the day in negative-offset timezones — so the
 * date-only string is split and reconstructed with local calendar parts to
 * keep the weekday stable and truthful.
 */
export function weekdayShort(value: string | Date): string {
  if (typeof value === "string") {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value.trim());
    if (m) {
      const local = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return WEEKDAY_SHORT[local.getDay()] ?? "—";
    }
  }
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : WEEKDAY_SHORT[d.getDay()] ?? "—";
}

/** Weight display — 2 decimals, consistent with the Operations tables. */
export function formatSaleWeight(weight: number): string {
  return Number.isFinite(weight) ? weight.toFixed(2) : "0.00";
}

/** Rate display — ₹100.00 (backend rate, never recalculated here). */
export function formatSaleRate(rate: number | null | undefined): string {
  const r = Number(rate);
  return Number.isFinite(r) ? `₹${r.toFixed(2)}` : "₹0.00";
}

/** Amount display — ₹5,330 / ₹5,330.50 (en-IN grouping, backend value). */
export function formatSaleAmount(amount: number): string {
  const a = Number(amount);
  if (!Number.isFinite(a)) return "₹0";
  return `₹${a.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** Remark display — "-" when empty, never undefined/null. */
export function formatSaleRemark(remark: string | null | undefined): string {
  return remark?.trim() ? remark.trim() : "-";
}

export interface SaleLockState {
  editable: boolean;
  /** Short label shown next to the lock icon / edit button. */
  label: string;
  /** User-friendly explanation for a locked sale. */
  message: string;
}

/**
 * Derive the display-only editability of a Shop Sale from the backend
 * response. The backend is the single authority: we never authorize editing
 * here because a date "looks" within 10 days. Only `sale.editable` decides;
 * `lockReason` / `tripDeleted` / `correctionWindowExpired` are used purely to
 * explain why a sale is locked.
 */
export function shopSaleLockState(sale: Pick<ShopSale, "editable" | "lockReason" | "tripDeleted" | "correctionWindowExpired">): SaleLockState {
  if (sale.editable) {
    return { editable: true, label: "Edit", message: "" };
  }

  if (sale.tripDeleted) {
    return {
      editable: false,
      label: "Locked",
      message: "Trip no longer exists — historical record is read-only.",
    };
  }

  if (sale.correctionWindowExpired) {
    return {
      editable: false,
      label: "Locked",
      message: "Edit window expired (10-day correction policy).",
    };
  }

  return {
    editable: false,
    label: "Locked",
    message:
      sale.lockReason?.trim() ||
      "This Shop Sale is read-only.",
  };
}