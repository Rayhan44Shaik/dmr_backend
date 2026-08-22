// src/modules/dashboard/components/PendingCollectionsCard.tsx
// Outstanding money per shop, with intelligent overdue highlighting.

import { Link } from "react-router-dom";
import { ArrowRight, CircleAlert, Clock3 } from "lucide-react";
import type { PendingCollection } from "../../operations/collections/types/collection";
import { formatINR } from "../../../utils/format";

interface PendingCollectionsCardProps {
  pending: PendingCollection[];
  totalAmount: number;
}

export default function PendingCollectionsCard({ pending, totalAmount }: PendingCollectionsCardProps) {
  const sorted = [...pending]
    .sort((a, b) => Number(b.currentPending) - Number(a.currentPending))
    .slice(0, 6);
  const overdueCount = pending.filter((p) => Number(p.overdueDays) > 0).length;

  return (
    <section className="flex flex-col rounded-xl border border-slate-200/80 bg-white shadow-card animate-fade-in-up dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-start justify-between gap-2 px-4 pb-1 pt-4">
        <div>
          <h3 className="text-[13.5px] font-semibold tracking-tight text-slate-800 dark:text-slate-100">Pending collections</h3>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Amounts due from shops</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tracking-tight text-slate-900 tabular-nums dark:text-white">{formatINR(totalAmount)}</p>
          {overdueCount > 0 && (
            <p className="flex items-center justify-end gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
              <CircleAlert size={11} />
              {overdueCount} overdue
            </p>
          )}
        </div>
      </header>

      <div className="flex-1 px-2 py-2">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center dark:border-slate-700">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              <Clock3 size={16} />
            </span>
            <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300">Nothing pending</p>
            <p className="max-w-xs text-xs text-slate-400">All shop dues are collected. Great work.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-50 dark:divide-slate-800/60">
            {sorted.map((item) => {
              const overdue = Number(item.overdueDays) > 0;
              return (
                <li key={item.shopName} className="flex items-center gap-3 px-2 py-2.5">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${
                      overdue
                        ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
                        : "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
                    }`}
                  >
                    {item.shopName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-slate-700 dark:text-slate-200">
                      {item.shopName}
                    </span>
                    <span
                      className={`text-[11px] font-medium ${
                        overdue ? "text-rose-500 dark:text-rose-400" : "text-slate-400 dark:text-slate-500"
                      }`}
                    >
                      {overdue ? `${item.overdueDays} days overdue` : `Due · ${item.overdueDays === 0 ? "today" : `${item.overdueDays}d`}`}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[13px] font-semibold text-slate-800 tabular-nums dark:text-slate-100">
                      {formatINR(Number(item.currentPending) || 0)}
                    </span>
                    <span className={`block text-[10.5px] font-semibold uppercase tracking-wide ${overdue ? "text-rose-500 dark:text-rose-400" : "text-amber-500 dark:text-amber-400"}`}>
                      {overdue ? "Overdue" : "Due"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="border-t border-slate-100 px-4 py-2.5 dark:border-slate-800">
        <Link
          to="/operations?tab=pending-collections"
          className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          View all collections
          <ArrowRight size={13} />
        </Link>
      </footer>
    </section>
  );
}
