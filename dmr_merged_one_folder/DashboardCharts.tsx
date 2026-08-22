// src/modules/dashboard/components/DashboardCharts.tsx
// Business overview charts — restrained, information-first visualisations.

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DerivedDashboard } from "../utils/dashboardDerive";
import { formatINR, formatINRCompact, formatNumber, formatWeight } from "../../../utils/format";

const AXIS_TICK = { fontSize: 11, fill: "#94a3b8" } as const;
const GRID_STROKE = "rgba(148,163,184,0.16)";

function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
  formatter?: (value: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const fmt = formatter ?? ((v: number) => String(v));
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-pop dark:border-slate-700 dark:bg-slate-800">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200">
          <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-slate-400">{entry.name}:</span>
          <span className="tabular-nums">{fmt(Number(entry.value) || 0)}</span>
        </p>
      ))}
    </div>
  );
}

function EmptyChart({ message = "No data yet" }: { message?: string }) {
  return (
    <div className="flex h-full min-h-[180px] items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs font-medium text-slate-400 dark:border-slate-700 dark:text-slate-500">
      {message}
    </div>
  );
}

/* 1 · Sales vs Collections (last 7 days) */
export function SalesVsCollectionsChart({ data }: { data: DerivedDashboard }) {
  const hasData = data.salesVsCollections.some((d) => d.sales > 0 || d.collections > 0);
  if (!hasData) return <EmptyChart message="No sales or collections recorded in the last 7 days" />;

  return (
    <ResponsiveContainer width="100%" height={264}>
      <ComposedChart data={data.salesVsCollections} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id="gradSales" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#059669" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#059669" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} dy={6} />
        <YAxis
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          width={54}
          tickFormatter={(v: number) => formatINRCompact(v)}
        />
        <Tooltip content={<ChartTooltip formatter={formatINR} />} cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }} />
        <Area type="monotone" dataKey="sales" name="Sales" stroke="#059669" strokeWidth={2} fill="url(#gradSales)" dot={false} activeDot={{ r: 3.5 }} />
        <Line type="monotone" dataKey="collections" name="Collections" stroke="#0ea5e9" strokeWidth={2} dot={false} activeDot={{ r: 3.5 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* 2 · Weekly revenue */
export function WeeklyRevenueChart({ data }: { data: DerivedDashboard }) {
  const hasData = data.weeklyRevenue.some((d) => d.revenue > 0);
  if (!hasData) return <EmptyChart message="No revenue recorded in the last 7 days" />;

  return (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={data.weeklyRevenue} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="day" tick={AXIS_TICK} axisLine={false} tickLine={false} dy={6} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={54} tickFormatter={(v: number) => formatINRCompact(v)} />
        <Tooltip content={<ChartTooltip formatter={formatINR} />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
        <Bar dataKey="revenue" name="Revenue" fill="#059669" radius={[5, 5, 0, 0]} maxBarSize={30} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* 3 · Delivery volume — birds delivered + weight */
export function DeliveryVolumeChart({ data }: { data: DerivedDashboard }) {
  const hasData = data.deliveryVolume.some((d) => d.birds > 0 || d.weight > 0);
  if (!hasData) return <EmptyChart message="No deliveries recorded in the last 7 days" />;

  return (
    <ResponsiveContainer width="100%" height={190}>
      <ComposedChart data={data.deliveryVolume} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} dy={6} />
        <YAxis yAxisId="birds" tick={AXIS_TICK} axisLine={false} tickLine={false} width={46} tickFormatter={(v: number) => formatNumber(v)} />
        <YAxis
          yAxisId="weight"
          orientation="right"
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          width={50}
          tickFormatter={(v: number) => `${Math.round(v)} kg`}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload || payload.length === 0) return null;
            const birds = payload.find((p) => p.dataKey === "birds")?.value as number;
            const weight = payload.find((p) => p.dataKey === "weight")?.value as number;
            return (
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-pop dark:border-slate-700 dark:bg-slate-800">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                <p className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200">
                  <span className="h-2 w-2 rounded-full bg-violet-500" /> Birds: <span className="tabular-nums">{formatNumber(Number(birds) || 0)}</span>
                </p>
                <p className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200">
                  <span className="h-2 w-2 rounded-full bg-sky-500" /> Weight: <span className="tabular-nums">{formatWeight(Number(weight) || 0)}</span>
                </p>
              </div>
            );
          }}
          cursor={{ fill: "rgba(148,163,184,0.08)" }}
        />
        <Bar yAxisId="birds" dataKey="birds" name="Birds" fill="#7c3aed" radius={[5, 5, 0, 0]} maxBarSize={18} />
        <Line yAxisId="weight" type="monotone" dataKey="weight" name="Weight" stroke="#0ea5e9" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* 4 · Vehicle activity donut */
const STATUS_COLORS: Record<string, string> = {
  "On Trip": "#059669",
  Available: "#0ea5e9",
  Inactive: "#94a3b8",
};

export function VehicleActivityDonut({ data }: { data: DerivedDashboard }) {
  const total = data.vehicleActivity.reduce((acc, s) => acc + s.value, 0);
  if (total === 0) return <EmptyChart message="No vehicles on record" />;

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-[168px] w-[168px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data.vehicleActivity}
              dataKey="value"
              nameKey="name"
              innerRadius={56}
              outerRadius={78}
              paddingAngle={2}
              stroke="none"
              isAnimationActive={false}
            >
              {data.vehicleActivity.map((entry) => (
                <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "#94a3b8"} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-white">{total}</p>
          <p className="text-[11px] font-medium text-slate-400">vehicles</p>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2.5">
        {data.vehicleActivity.map((entry) => (
          <li key={entry.name} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[4px]" style={{ background: STATUS_COLORS[entry.name] }} />
            <span className="flex-1 truncate font-medium text-slate-600 dark:text-slate-300">{entry.name}</span>
            <span className="font-semibold text-slate-800 tabular-nums dark:text-slate-100">{entry.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
