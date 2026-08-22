// src/modules/reports/vehicle/pages/VehicleReportPage.tsx
// Vehicle Report — vehicle-wise trip, distance, fuel and maintenance analysis.
// Header → filters → KPI summary → main table → vehicle detail drawer.

import { useMemo, useState } from "react";
import { CircleAlert, RefreshCw } from "lucide-react";
import { useVehicleReport } from "../hooks/useVehicleReport";
import { formatPeriodLabel, resolveDateWindow } from "../utils/vehicleReportDates";
import VehicleReportFilters from "../components/VehicleReportFilters";
import VehicleReportKpis from "../components/VehicleReportKpis";
import VehicleReportTable from "../components/VehicleReportTable";
import VehicleDetailDrawer from "../components/VehicleDetailDrawer";
import type { VehicleReportRow } from "../types/vehicleReportTypes";

interface VehicleReportPageProps {
  embedded?: boolean;
}

export default function VehicleReportPage({ embedded = false }: VehicleReportPageProps) {
  const { sources, draftFilters, appliedFilters, report, loading, applyFilters, resetFilters, refresh } =
    useVehicleReport();
  const [selectedRow, setSelectedRow] = useState<VehicleReportRow | null>(null);

  const periodLabel = useMemo(
    () => formatPeriodLabel(resolveDateWindow(appliedFilters.preset, appliedFilters.fromDate, appliedFilters.toDate)),
    [appliedFilters]
  );

  const selectedVehicleNumber =
    appliedFilters.vehicleId === "all"
      ? null
      : (sources.vehicles.data.find((v) => v.id === appliedFilters.vehicleId)?.vehicleNumber ?? null);

  // Core sources (vehicles + trips) failing = fatal error state.
  const coreFailed =
    sources.vehicles.status === "error" || sources.trips.status === "error";
  const coreError =
    sources.vehicles.status === "error"
      ? sources.vehicles.error
      : sources.trips.status === "error"
      ? sources.trips.error
      : null;

  return (
    <div className={`space-y-4 ${embedded ? "" : "px-4 py-6 sm:px-6 lg:px-8"}`}>
      {/* ------------------------------------------------ Header ---- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between animate-fade-in-up">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Vehicle Report</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Vehicle-wise trip, distance, fuel and maintenance analysis
          </p>
          <p className="mt-2 inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span className="text-slate-400 dark:text-slate-500">Vehicle:</span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {appliedFilters.vehicleId === "all" ? "All Vehicles" : selectedVehicleNumber ?? "—"}
            </span>
            <span className="text-slate-400 dark:text-slate-500">Period:</span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {periodLabel}
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={refresh}
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 sm:self-auto dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* ------------------------------------------ Filters ------ */}
      <VehicleReportFilters
        vehicles={sources.vehicles.data}
        applied={draftFilters}
        onApply={applyFilters}
        onReset={resetFilters}
        disabled={sources.vehicles.status !== "success"}
      />

      {/* ------------------------- Source warnings (partial data) -- */}
      {!coreFailed && report && (report.fuelSourceUnavailable || report.maintenanceSourceUnavailable) && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200/80 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
          <CircleAlert size={14} className="mt-0.5 shrink-0" />
          <span>
            {report.fuelSourceUnavailable && "Fuel data could not be loaded — fuel, fuel cost and mileage show N/A. "}
            {report.maintenanceSourceUnavailable && "Maintenance data could not be loaded — maintenance and cost/KM show N/A."}
          </span>
        </div>
      )}

      {/* ------------------------- Fatal error state ----------------- */}
      {coreFailed ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-white/60 px-4 py-14 text-center dark:border-slate-800 dark:bg-slate-900/60">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
            <CircleAlert size={18} />
          </span>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Unable to load vehicle report data.</p>
          <p className="max-w-sm text-xs text-slate-400">{coreError}</p>
          <button
            type="button"
            onClick={refresh}
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 dark:bg-brand-600 dark:hover:bg-brand-500"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* -------------------------------------------- KPIs ------ */}
          <VehicleReportKpis summary={report?.summary ?? null} loading={loading && !report} />

          {/* ----------------------------------------- Table -------- */}
          <VehicleReportTable
            rows={report?.rows ?? []}
            loading={loading && !report}
            selectedVehicleNumber={selectedVehicleNumber}
            onSelectRow={setSelectedRow}
          />
        </>
      )}

      {/* ---------------------------------------- Detail drawer ----- */}
      <VehicleDetailDrawer
        row={selectedRow}
        periodLabel={periodLabel}
        onClose={() => setSelectedRow(null)}
      />
    </div>
  );
}