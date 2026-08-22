// src/modules/operations/mortality/components/MortalityTable.tsx

import { useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import type { MortalityRecord } from "../types/mortality";
import { formatDateShort, formatNumber, formatWeight } from "../../../../utils/format";
import {
  paginationBarClass,
  paginationNavBtnClass,
  paginationPageBtnClass,
  shouldShowPagination,
} from "../../../../shared/ui/paginationStyles";
import { usePendingDelete } from "../../../../hooks/usePendingDelete";
import { PendingDeleteNotification } from "../../../../components/common/PendingDeleteNotification";

interface MortalityTableProps {
  records: MortalityRecord[];
  onDelete: (id: string) => void;
}

const REASON_STYLES: Record<string, string> = {
  "Heat Stress": "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400",
  Disease: "bg-rose-50 text-rose-600 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400",
  Suffocation: "bg-orange-50 text-orange-600 ring-orange-600/20 dark:bg-orange-500/10 dark:text-orange-400",
  Transportation: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400",
  Other: "bg-slate-100 text-slate-600 ring-slate-500/10 dark:bg-slate-700/60 dark:text-slate-300",
};

const PAGE_SIZE = 8;

export default function MortalityTable({ records, onDelete }: MortalityTableProps) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const { requestDelete, cancel, pendingItems } = usePendingDelete(onDelete);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter(
      (r) =>
        r.farm.toLowerCase().includes(q) ||
        r.tripNo.toLowerCase().includes(q) ||
        r.entryNo.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q)
    );
  }, [records, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
        <div>
          <h3 className="text-[13.5px] font-semibold tracking-tight text-slate-800 dark:text-slate-100">Mortality register</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500">{formatNumber(records.length)} records on file</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search farm, trip, reason…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-[13px] text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
            <Search size={15} />
          </span>
          <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300">
            {records.length === 0 ? "No mortality records yet" : "No records match your search"}
          </p>
          <p className="text-xs text-slate-400">
            {records.length === 0 ? "Use the entry form above to record the first loss." : "Try a different search term."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Entry No</th>
                <th className="px-4 py-2.5 font-semibold">Date</th>
                <th className="px-4 py-2.5 font-semibold">Farm</th>
                <th className="px-4 py-2.5 font-semibold">Trip No</th>
                <th className="px-4 py-2.5 text-right font-semibold">Birds</th>
                <th className="px-4 py-2.5 text-right font-semibold">Weight</th>
                <th className="px-4 py-2.5 font-semibold">Reason</th>
                <th className="px-4 py-2.5" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="text-[13px]">
              {rows.map((record) => (
                <tr key={record.id} className="border-b border-slate-50 transition-colors last:border-0 hover:bg-slate-50/60 dark:border-slate-800/60 dark:hover:bg-slate-800/30">
                  <td className="px-4 py-2.5 font-semibold text-slate-800 tabular-nums dark:text-slate-100">{record.entryNo}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{formatDateShort(record.date)}</td>
                  <td className="max-w-[180px] truncate px-4 py-2.5 text-slate-600 dark:text-slate-300">{record.farm}</td>
                  <td className="px-4 py-2.5 text-slate-500 tabular-nums dark:text-slate-400">{record.tripNo || "—"}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-slate-700 tabular-nums dark:text-slate-200">{formatNumber(record.birds)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums dark:text-slate-300">{formatWeight(record.weightKg)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${REASON_STYLES[record.reason] ?? REASON_STYLES.Other}`}>
                      {record.reason}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => requestDelete(record.id, { label: `Deleting mortality ${record.entryNo}` })}
                      className="rounded-md p-1.5 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:text-slate-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                      aria-label={`Delete record ${record.entryNo}`}
                      title="Delete record"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {shouldShowPagination(filtered.length) && (
        <div className={paginationBarClass}>
          <button
            type="button"
            disabled={current === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className={paginationNavBtnClass}
          >
            Previous
          </button>
          <span className={paginationPageBtnClass(true)}>
            {current}
          </span>
          <button
            type="button"
            disabled={current === pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            className={paginationNavBtnClass}
          >
            Next
          </button>
        </div>
      )}
      <PendingDeleteNotification items={pendingItems} onCancel={cancel} />
    </div>
  );
}
