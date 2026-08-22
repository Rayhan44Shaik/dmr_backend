// src/modules/dashboard/components/TripStatusBadge.tsx

import { memo } from "react";

const STATUS_STYLES: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-600 ring-slate-500/10 dark:bg-slate-700/60 dark:text-slate-300",
  Pending: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400",
  Completed: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400",
  Deleted: "bg-rose-50 text-rose-600 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400",
};

function TripStatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.Draft;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${style}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status}
    </span>
  );
}

export default memo(TripStatusBadge);
