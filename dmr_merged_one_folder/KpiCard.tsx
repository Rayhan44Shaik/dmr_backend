// src/modules/dashboard/components/KpiCard.tsx
// Premium KPI card: value, comparison, trend chip, sparkline, tinted icon.

import { memo } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { KpiDatum } from "../utils/dashboardDerive";

const toneClasses: Record<KpiDatum["tone"], { icon: string; spark: string }> = {
  brand: { icon: "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400", spark: "#059669" },
  sky: { icon: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400", spark: "#0ea5e9" },
  amber: { icon: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400", spark: "#d97706" },
  rose: { icon: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400", spark: "#e11d48" },
  violet: { icon: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400", spark: "#7c3aed" },
  slate: { icon: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300", spark: "#64748b" },
};

interface KpiCardProps {
  kpi: KpiDatum;
  index?: number;
}

function KpiCard({ kpi, index = 0 }: KpiCardProps) {
  const tone = toneClasses[kpi.tone];
  const Icon = kpi.icon;
  const hasSpark = kpi.spark.some((p) => p.y > 0);

  return (
    <div
      className="group relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 shadow-card transition-all duration-200 hover:-translate-y-px hover:border-slate-300/80 hover:shadow-card-lg animate-fade-in-up dark:border-slate-800 dark:bg-slate-900"
      style={{ animationDelay: `${Math.min(index * 40, 320)}ms` }}
    >
      <div className={hasSpark ? "pb-7" : ""}>
        <div className="flex items-start justify-between">
          <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400">{kpi.label}</p>
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone.icon}`}>
            <Icon size={16} />
          </span>
        </div>

        <div className="mt-2 flex items-end justify-between gap-2">
          <p className="truncate text-[22px] font-bold tracking-tight text-slate-900 tabular-nums dark:text-white">
            {kpi.value}
          </p>
          {kpi.delta != null && (
            <span
              className={`mb-1 flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                kpi.trend === "up"
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                  : kpi.trend === "down"
                  ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
                  : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              }`}
            >
              {kpi.trend === "up" ? <ArrowUpRight size={12} /> : kpi.trend === "down" ? <ArrowDownRight size={12} /> : <Minus size={12} />}
              {Math.abs(kpi.delta)}%
            </span>
          )}
        </div>

        <p className="mt-1 truncate text-[11.5px] text-slate-400 dark:text-slate-500">{kpi.sub}</p>
      </div>

      {hasSpark && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-9 opacity-70 transition-opacity group-hover:opacity-100">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={kpi.spark} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`spark-${kpi.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={tone.spark} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={tone.spark} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="y"
                stroke={tone.spark}
                strokeWidth={1.5}
                fill={`url(#spark-${kpi.key})`}
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default memo(KpiCard);
