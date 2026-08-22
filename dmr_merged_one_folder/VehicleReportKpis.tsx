// src/modules/reports/vehicle/components/VehicleReportKpis.tsx
// Eight KPI cards fed by the single derived report summary.

import { memo } from "react";
import {
  Activity,
  Fuel,
  Gauge,
  IndianRupee,
  Route,
  Truck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { VehicleReportSummary } from "../types/vehicleReportTypes";
import { formatCount, formatKm, formatLitres, formatMileage, formatRate, NOT_AVAILABLE } from "../utils/vehicleReportUtils";
import { formatINR } from "../../../../utils/format";

interface KpiDef {
  key: string;
  label: string;
  icon: LucideIcon;
  tone: string;
  value: (summary: VehicleReportSummary) => string;
}

const KPI_DEFS: KpiDef[] = [
  {
    key: "vehicles",
    label: "Total Vehicles",
    icon: Truck,
    tone: "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400",
    value: (s) => formatCount(s.totalVehicles),
  },
  {
    key: "trips",
    label: "Total Trips",
    icon: Route,
    tone: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400",
    value: (s) => formatCount(s.totalTrips),
  },
  {
    key: "distance",
    label: "Total Distance",
    icon: Gauge,
    tone: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
    value: (s) => formatKm(s.totalDistanceKm),
  },
  {
    key: "fuel",
    label: "Total Fuel",
    icon: Fuel,
    tone: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    value: (s) => (s.totalFuelLitres === null ? NOT_AVAILABLE : formatLitres(s.totalFuelLitres)),
  },
  {
    key: "fuelCost",
    label: "Fuel Cost",
    icon: IndianRupee,
    tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    value: (s) => (s.totalFuelCost === null ? NOT_AVAILABLE : formatINR(s.totalFuelCost)),
  },
  {
    key: "maintenance",
    label: "Maintenance",
    icon: Wrench,
    tone: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
    value: (s) => (s.totalMaintenanceCost === null ? NOT_AVAILABLE : formatINR(s.totalMaintenanceCost)),
  },
  {
    key: "mileage",
    label: "Average Mileage",
    icon: Activity,
    tone: "bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400",
    value: (s) => (s.avgMileage === null ? NOT_AVAILABLE : formatMileage(s.avgMileage)),
  },
  {
    key: "costPerKm",
    label: "Average Cost / KM",
    icon: IndianRupee,
    tone: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400",
    value: (s) => (s.avgCostPerKm === null ? NOT_AVAILABLE : formatRate(s.avgCostPerKm)),
  },
];

interface VehicleReportKpisProps {
  summary: VehicleReportSummary | null;
  loading?: boolean;
}

function KpiSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between">
        <div className="h-3.5 w-24 rounded bg-slate-200/80 dark:bg-slate-800" />
        <div className="h-8 w-8 rounded-lg bg-slate-200/80 dark:bg-slate-800" />
      </div>
      <div className="mt-3 h-7 w-28 rounded bg-slate-200/80 dark:bg-slate-800" />
    </div>
  );
}

function VehicleReportKpis({ summary, loading = false }: VehicleReportKpisProps) {
  if (loading || !summary) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <KpiSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {KPI_DEFS.map((kpi, index) => (
        <div
          key={kpi.key}
          className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-card animate-fade-in-up dark:border-slate-800 dark:bg-slate-900"
          style={{ animationDelay: `${Math.min(index * 35, 280)}ms` }}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {kpi.label}
            </p>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${kpi.tone}`}>
              <kpi.icon size={15} />
            </span>
          </div>
          <p className="mt-2 truncate text-[19px] font-bold tracking-tight text-slate-900 tabular-nums dark:text-white">
            {kpi.value(summary)}
          </p>
        </div>
      ))}
    </div>
  );
}

export default memo(VehicleReportKpis);