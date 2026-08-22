/** Visual-only pagination classes. Do not use for page math or API behaviour. */

export const PAGINATION_MIN_RECORDS = 10;

export const shouldShowPagination = (totalRecords: number) =>
  totalRecords >= PAGINATION_MIN_RECORDS;

export const paginationBarClass =
  "w-full max-w-full flex items-center justify-end flex-wrap gap-1.5 px-3 py-2 bg-white border-t border-slate-200 rounded-b-xl";

export const paginationNavBtnClass =
  "h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-600";

export const paginationPageBtnClass = (active: boolean) =>
  `h-8 min-w-8 px-2.5 rounded-lg text-xs font-bold border inline-flex items-center justify-center transition ${
    active
      ? "bg-emerald-600 text-white border-emerald-600"
      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
  }`;
