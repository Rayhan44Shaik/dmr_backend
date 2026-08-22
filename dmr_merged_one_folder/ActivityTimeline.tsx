// src/modules/dashboard/components/ActivityTimeline.tsx
// Recent activity — a clean vertical timeline.

import { Activity } from "lucide-react";
import type { ActivityItem } from "../utils/dashboardDerive";

const TONE_CLASSES: Record<ActivityItem["tone"], string> = {
  brand: "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400",
  sky: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
  slate: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300",
};

interface ActivityTimelineProps {
  items: ActivityItem[];
}

export default function ActivityTimeline({ items }: ActivityTimelineProps) {
  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-card animate-fade-in-up dark:border-slate-800 dark:bg-slate-900">
      <header className="mb-3">
        <h3 className="text-[13.5px] font-semibold tracking-tight text-slate-800 dark:text-slate-100">Recent activity</h3>
        <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Latest movements across the business</p>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center dark:border-slate-700">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
            <Activity size={16} />
          </span>
          <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300">No recent activity</p>
          <p className="max-w-xs text-xs text-slate-400">Trips, collections and expenses will appear here as they happen.</p>
        </div>
      ) : (
        <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-slate-100 dark:before:bg-slate-800">
          {items.slice(0, 7).map((item) => (
            <li key={item.id} className="relative flex gap-3">
              <span
                className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white dark:ring-slate-900 ${TONE_CLASSES[item.tone]}`}
              >
                <item.icon size={14} />
              </span>
              <span className="min-w-0 flex-1 pt-0.5">
                <span className="block truncate text-[13px] font-medium text-slate-700 dark:text-slate-200">{item.title}</span>
                <span className="block truncate text-xs text-slate-400 dark:text-slate-500">{item.description}</span>
                <span className="mt-0.5 block text-[11px] font-medium text-slate-300 dark:text-slate-600">{item.time}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
