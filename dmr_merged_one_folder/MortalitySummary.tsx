// src/modules/operations/mortality/components/MortalitySummary.tsx

import { Activity, Bird, Scale, TrendingDown } from "lucide-react";
import type { MortalitySummary as Summary } from "../types/mortality";
import { formatNumber, formatWeight } from "../../../../utils/format";

interface MortalitySummaryProps {
  summary: Summary;
}

export default function MortalitySummary({ summary }: MortalitySummaryProps) {
  const cards = [
    {
      label: "Today's Loss",
      value: formatNumber(summary.todayCount),
      sub: `${formatWeight(summary.todayWeight)} lost weight`,
      icon: Bird,
      tone: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
    },
    {
      label: "Last 7 Days",
      value: formatNumber(summary.weekCount),
      sub: `${formatWeight(summary.weekWeight)} total weight`,
      icon: Activity,
      tone: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    },
    {
      label: "Avg Loss / Trip",
      value: `${summary.avgLossRate} birds`,
      sub: "average across the week",
      icon: TrendingDown,
      tone: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400",
    },
    {
      label: "Top Reason",
      value: summary.byReason[0]?.reason ?? "—",
      sub: summary.byReason[0] ? `${formatNumber(summary.byReason[0].count)} birds this period` : "no losses recorded",
      icon: Scale,
      tone: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card, i) => (
        <div
          key={card.label}
          className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-card animate-fade-in-up dark:border-slate-800 dark:bg-slate-900"
          style={{ animationDelay: `${i * 40}ms` }}
        >
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${card.tone}`}>
            <card.icon size={16} />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {card.label}
            </span>
            <span className="block truncate text-[15px] font-bold text-slate-800 tabular-nums dark:text-slate-100">{card.value}</span>
            <span className="block truncate text-[11px] text-slate-400 dark:text-slate-500">{card.sub}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
