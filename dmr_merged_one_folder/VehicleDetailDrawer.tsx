// src/modules/reports/vehicle/components/VehicleDetailDrawer.tsx
// Right-side summary drawer for a selected vehicle row. Foundation for the
// future detailed vehicle report — shows only summary metrics today.

import { useEffect } from "react";
import { CalendarDays, Gauge, Truck, X } from "lucide-react";
import type { VehicleReportRow } from "../types/vehicleReportTypes";
import {
  NOT_AVAILABLE,
  formatCount,
  formatKm,
  formatKmValue,
  formatLitres,
  formatMileage,
  formatRate,
} from "../utils/vehicleReportUtils";
import { formatINR } from "../../../../utils/format";

interface VehicleDetailDrawerProps {
  row: VehicleReportRow | null;
  periodLabel: string;
  onClose: () => void;
}

function MetricCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className="mt-1 truncate text-[14px] font-bold text-slate-900 tabular-nums dark:text-white">{value}</p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-slate-400 dark:text-slate-500">{sub}</p>}
    </div>
  );
}

function VehicleDetailDrawer({ row, periodLabel, onClose }: VehicleDetailDrawerProps) {
  useEffect(() => {
    if (!row) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [row, onClose]);

  if (!row) return null;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />

      <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-pop animate-scale-in dark:border-slate-700 dark:bg-slate-900">
        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
              <Truck size={18} />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-[16px] font-bold tracking-tight text-slate-900 dark:text-white">
                {row.vehicleNumber}
              </h3>
              <p className="truncate text-xs text-slate-400 dark:text-slate-500">{row.vehicleType}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Close vehicle details"
          >
            <X size={17} />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          {/* Vehicle + period info */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${
                row.status === "Active"
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400"
                  : "bg-slate-100 text-slate-500 ring-slate-500/10 dark:bg-slate-700/60 dark:text-slate-400"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${row.status === "Active" ? "bg-emerald-500" : "bg-slate-400"}`} />
              {row.status}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <CalendarDays size={11} />
              {periodLabel}
            </span>
          </div>

          {/* Summary metrics */}
          <div className="grid grid-cols-2 gap-2.5">
            <MetricCell label="Trips" value={formatCount(row.trips)} />
            <MetricCell label="Distance" value={formatKm(row.distanceKm)} />
            <MetricCell label="Fuel" value={row.fuelLitres === null ? NOT_AVAILABLE : formatLitres(row.fuelLitres)} />
            <MetricCell label="Fuel Cost" value={row.fuelCost === null ? NOT_AVAILABLE : formatINR(row.fuelCost)} />
            <MetricCell
              label="Maintenance Cost"
              value={row.maintenanceCost === null ? NOT_AVAILABLE : formatINR(row.maintenanceCost)}
            />
            <MetricCell label="Cost / KM" value={row.costPerKm === null ? NOT_AVAILABLE : formatRate(row.costPerKm)} />
            <MetricCell label="Mileage" value={row.mileage === null ? NOT_AVAILABLE : formatMileage(row.mileage)} />
            <MetricCell
              label="Last Meter Reading"
              value={row.lastMeterReading === null ? NOT_AVAILABLE : `${formatKmValue(row.lastMeterReading)} km`}
            />
          </div>

          {/* Last activity */}
          <div className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2.5 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <Gauge size={13} className="shrink-0 text-slate-400" />
            Last trip: {row.lastTripDate ? row.lastTripDate : NOT_AVAILABLE}
          </div>
        </div>
      </aside>
    </div>
  );
}

export default VehicleDetailDrawer;