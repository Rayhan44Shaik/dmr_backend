// src/shared/ui/operationsStyles.ts
// Shared visual shell for all Operations pages.
// Visual consistency only — no business logic lives here.

/* ── Page shell ─────────────────────────────────────────────────── */
export const opsPageClass = "w-full space-y-5";

/* ── Filter surface ─────────────────────────────────────────────── */
export const opsFilterCardClass =
  "bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 md:p-5 space-y-4";

export const opsFilterLabelClass =
  "text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5";

export const opsInputClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition-all";

export const opsSelectClass = opsInputClass;

/* ── Buttons ────────────────────────────────────────────────────── */
export const opsPrimaryButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition-all active:scale-95 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed";

export const opsSecondaryButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all active:scale-95 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed";

export const opsPdfButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-rose-600 transition-all active:scale-95 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-rose-50";

export const opsExcelButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-emerald-600 transition-all active:scale-95 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-emerald-50";

export const opsIconButtonClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40";

/* ── Sections / titles ──────────────────────────────────────────── */
export const opsSectionTitleClass =
  "text-sm font-bold text-slate-800 uppercase tracking-wider";

export const opsPageTitleClass = "text-lg font-bold text-slate-900 tracking-tight";

/* ── Table shell ────────────────────────────────────────────────── */
export const opsTableCardClass =
  "bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden";

export const opsTableHeaderBarClass =
  "px-5 py-3 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between flex-wrap gap-2";

export const opsTableHeadRowClass = "bg-slate-50/80";

export const opsTableThClass =
  "px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap";

export const opsTableTdClass = "px-4 py-3 text-sm text-slate-700 whitespace-nowrap";

export const opsTableRowClass = "hover:bg-slate-50/70 transition-colors";

export const opsTableDivideClass = "divide-y divide-slate-100";

/* ── Status badge ───────────────────────────────────────────────── */
const STATUS_TONES: Record<string, string> = {
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Draft: "bg-slate-100 text-slate-600 border-slate-200",
  Rejected: "bg-red-50 text-red-700 border-red-200",
  Deleted: "bg-red-50 text-red-700 border-red-200",
  Failed: "bg-red-50 text-red-700 border-red-200",
  Sent: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Sending: "bg-sky-50 text-sky-700 border-sky-200",
};

export function opsStatusBadgeClass(status?: string | null): string {
  return (
    "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap " +
    (STATUS_TONES[status ?? ""] ?? "bg-slate-100 text-slate-600 border-slate-200")
  );
}

/* ── React-select (shared) ──────────────────────────────────────── */
export function opsReactSelectStyles(accent = "#059669") {
  return {
    control: (base: any, state: any) => ({
      ...base,
      borderRadius: "0.75rem",
      minHeight: "40px",
      fontSize: "13px",
      fontWeight: 500,
      borderColor: state.isFocused ? accent : "#e2e8f0",
      boxShadow: state.isFocused ? `0 0 0 2px ${accent}1f` : "none",
      backgroundColor: "#ffffff",
      "&:hover": { borderColor: "#cbd5e1" },
    }),
    option: (base: any, { isFocused, isSelected }: any) => ({
      ...base,
      backgroundColor: isSelected ? accent : isFocused ? "#f1f5f9" : "transparent",
      color: isSelected ? "#ffffff" : "#334155",
      fontSize: "13px",
      fontWeight: isSelected ? 600 : 500,
      padding: "8px 12px",
      cursor: "pointer",
    }),
    menu: (base: any) => ({
      ...base,
      borderRadius: "0.75rem",
      boxShadow: "0 10px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
      border: "1px solid #e2e8f0",
      overflow: "hidden",
      zIndex: 50,
    }),
    indicatorSeparator: () => ({ display: "none" }),
    dropdownIndicator: (base: any) => ({
      ...base,
      color: "#94a3b8",
      "&:hover": { color: "#64748b" },
    }),
    multiValue: (base: any) => ({ ...base, backgroundColor: "#d1fae5", borderRadius: "6px" }),
    multiValueLabel: (base: any) => ({ ...base, color: "#065f46", fontSize: "12px", fontWeight: 600 }),
    multiValueRemove: (base: any) => ({
      ...base,
      color: "#065f46",
      ":hover": { backgroundColor: "#a7f3d0", color: "#dc2626" },
    }),
  };
}

/* ── Empty state ────────────────────────────────────────────────── */
export const opsEmptyStateClass =
  "rounded-2xl border border-dashed border-slate-200 bg-white/60 px-4 py-10 text-center text-sm font-medium text-slate-500";