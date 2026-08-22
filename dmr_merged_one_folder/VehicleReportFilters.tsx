// src/modules/reports/vehicle/components/VehicleReportFilters.tsx
// Filter toolbar: searchable vehicle selector, date preset, custom range,
// Apply and Reset. Draft state stays here until Apply is pressed.

import { useMemo, useState } from "react";
import { CalendarDays, RotateCcw, Search, Truck } from "lucide-react";
import type { Vehicle } from "../../../masters/vehicles/types/vehicle";
import type { VehicleReportDatePreset, VehicleReportFilters as Filters } from "../types/vehicleReportTypes";
import { DATE_PRESETS, resolveDateWindow } from "../utils/vehicleReportDates";
import VehicleSelect from "./VehicleSelect";

const inputClass =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";

const labelClass = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500";

interface VehicleReportFiltersProps {
  vehicles: Vehicle[];
  applied: Filters;
  onApply: (filters: Filters) => void;
  onReset: () => void;
  disabled?: boolean;
}

export default function VehicleReportFilters({ vehicles, applied, onApply, onReset, disabled = false }: VehicleReportFiltersProps) {
  const [vehicleId, setVehicleId] = useState<number | "all">(applied.vehicleId);
  const [preset, setPreset] = useState<VehicleReportDatePreset>(applied.preset);
  const [fromDate, setFromDate] = useState(applied.fromDate);
  const [toDate, setToDate] = useState(applied.toDate);

  // Custom-range draft is always kept valid so Apply can resolve it.
  const customRange = useMemo(
    () => (preset === "custom" ? resolveDateWindow("custom", fromDate, toDate) : null),
    [preset, fromDate, toDate]
  );

  const handleApply = () => {
    const window = resolveDateWindow(preset, fromDate, toDate);
    onApply({
      vehicleId,
      preset,
      fromDate: window.from,
      toDate: window.to,
    });
  };

  const handleReset = () => {
    setVehicleId("all");
    setPreset("thisMonth");
    setFromDate("");
    setToDate("");
    onReset();
  };

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-card animate-fade-in-up dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {/* Vehicle */}
          <div className="min-w-0">
            <label className={labelClass}>
              <span className="mr-1 inline-flex align-middle">
                <Truck size={11} />
              </span>
              Vehicle
            </label>
            <VehicleSelect vehicles={vehicles} value={vehicleId} onChange={setVehicleId} disabled={disabled} />
          </div>

          {/* Date preset */}
          <div>
            <label className={labelClass}>
              <span className="mr-1 inline-flex align-middle">
                <CalendarDays size={11} />
              </span>
              Date Range
            </label>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as VehicleReportDatePreset)}
              disabled={disabled}
              className={inputClass}
            >
              {DATE_PRESETS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Custom range */}
          <div className={preset === "custom" ? "" : "pointer-events-none opacity-50"}>
            <label className={labelClass}>From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              disabled={disabled || preset !== "custom"}
              className={inputClass}
            />
          </div>
          <div className={preset === "custom" ? "" : "pointer-events-none opacity-50"}>
            <label className={labelClass}>To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              disabled={disabled || preset !== "custom"}
              className={inputClass}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {preset === "custom" && customRange
              ? `Custom range: ${customRange.from} to ${customRange.to}`
              : "Tip: pick a vehicle and a preset, then Apply."}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <RotateCcw size={14} />
              Reset
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-brand-600 dark:hover:bg-brand-500"
            >
              <Search size={14} />
              Apply
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}