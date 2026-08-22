// src/modules/reports/vehicle/components/VehicleReportTable.tsx
// Main vehicle-wise report table: sticky header, sortable columns, search,
// row click → detail drawer, loading skeleton and business empty states.

import { memo, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";
import type { VehicleReportRow, VehicleReportSortKey } from "../types/vehicleReportTypes";
import {
  NOT_AVAILABLE,
  formatCount,
  formatKmValue,
  formatLitres,
  formatMileage,
  formatRate,
} from "../utils/vehicleReportUtils";
import { formatINR } from "../../../../utils/format";

type SortDirection = "asc" | "desc";

interface Column {
  key: VehicleReportSortKey;
  label: string;
  align: "left" | "right";
  render: (row: VehicleReportRow) => string;
}

const COLUMNS: Column[] = [
  { key: "vehicleNumber", label: "Vehicle No", align: "left", render: (r) => r.vehicleNumber },
  { key: "trips", label: "Trips", align: "right", render: (r) => formatCount(r.trips) },
  { key: "distanceKm", label: "Distance", align: "right", render: (r) => formatKmValue(r.distanceKm) },
  { key: "fuelLitres", label: "Fuel", align: "right", render: (r) => (r.fuelLitres === null ? NOT_AVAILABLE : formatLitres(r.fuelLitres)) },
  { key: "fuelCost", label: "Fuel Cost", align: "right", render: (r) => (r.fuelCost === null ? NOT_AVAILABLE : formatINR(r.fuelCost)) },
  { key: "maintenanceCost", label: "Maintenance Cost", align: "right", render: (r) => (r.maintenanceCost === null ? NOT_AVAILABLE : formatINR(r.maintenanceCost)) },
  { key: "costPerKm", label: "Cost / KM", align: "right", render: (r) => (r.costPerKm === null ? NOT_AVAILABLE : formatRate(r.costPerKm)) },
  { key: "mileage", label: "Mileage", align: "right", render: (r) => (r.mileage === null ? NOT_AVAILABLE : formatMileage(r.mileage)) },
];

const SORT_VALUE: Record<VehicleReportSortKey, (row: VehicleReportRow) => number | string> = {
  vehicleNumber: (r) => r.vehicleNumber.toLowerCase(),
  trips: (r) => r.trips,
  distanceKm: (r) => r.distanceKm,
  fuelLitres: (r) => r.fuelLitres ?? -1,
  fuelCost: (r) => r.fuelCost ?? -1,
  maintenanceCost: (r) => r.maintenanceCost ?? -1,
  costPerKm: (r) => r.costPerKm ?? -1,
  mileage: (r) => r.mileage ?? -1,
};

function TableSkeleton() {
  return (
    <div className="animate-pulse space-y-2 p-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-11 rounded-lg bg-slate-100 dark:bg-slate-800/60" />
      ))}
    </div>
  );
}

interface VehicleReportTableProps {
  rows: VehicleReportRow[];
  loading?: boolean;
  /** Vehicle number when a single vehicle is selected (custom empty state). */
  selectedVehicleNumber: string | null;
  onSelectRow: (row: VehicleReportRow) => void;
}

function VehicleReportTable({ rows, loading = false, selectedVehicleNumber, onSelectRow }: VehicleReportTableProps) {
  const [sortKey, setSortKey] = useState<VehicleReportSortKey>("vehicleNumber");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [query, setQuery] = useState("");

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? rows.filter((r) => r.vehicleNumber.toLowerCase().includes(q)) : rows;
    const factor = sortDirection === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      const av = SORT_VALUE[sortKey](a);
      const bv = SORT_VALUE[sortKey](b);
      if (av < bv) return -1 * factor;
      if (av > bv) return 1 * factor;
      return 0;
    });
  }, [rows, query, sortKey, sortDirection]);

  const toggleSort = (key: VehicleReportSortKey) => {
    if (key === sortKey) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const renderBody = () => {
    if (loading) return <TableSkeleton />;

    if (rows.length === 0) {
      return (
        <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
            <Search size={16} />
          </span>
          {selectedVehicleNumber ? (
            <>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                No trips found for {selectedVehicleNumber} during this period.
              </p>
              <p className="text-xs text-slate-400">Try a wider date range or select All Vehicles.</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                No vehicle activity found for the selected period.
              </p>
              <p className="text-xs text-slate-400">Adjust the date range and try again.</p>
            </>
          )}
        </div>
      );
    }

    if (sorted.length === 0) {
      return (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <p className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">
            No vehicles match your search.
          </p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-500">
              {COLUMNS.map((column) => {
                const active = sortKey === column.key;
                return (
                  <th key={column.key} className="sticky top-0 bg-slate-50/95 px-4 py-2.5 font-semibold backdrop-blur dark:bg-slate-900/95">
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className={`inline-flex items-center gap-1 transition-colors hover:text-slate-600 dark:hover:text-slate-300 ${
                        column.align === "right" ? "flex-row-reverse" : ""
                      }`}
                      aria-label={`Sort by ${column.label}`}
                    >
                      {column.label}
                      {active ? (
                        sortDirection === "asc" ? (
                          <ArrowUp size={11} />
                        ) : (
                          <ArrowDown size={11} />
                        )
                      ) : (
                        <ChevronsUpDown size={11} className="opacity-50" />
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {sorted.map((row) => (
              <tr
                key={row.vehicleId}
                onClick={() => onSelectRow(row)}
                className="cursor-pointer border-b border-slate-50 transition-colors last:border-0 hover:bg-brand-50/40 dark:border-slate-800/60 dark:hover:bg-brand-500/5"
              >
                <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">{row.vehicleNumber}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200">{row.trips}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200">
                  {formatKmValue(row.distanceKm)} <span className="text-slate-400">km</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200">
                  {row.fuelLitres === null ? NOT_AVAILABLE : (
                    <>
                      {formatLitres(row.fuelLitres)}
                    </>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200">
                  {row.fuelCost === null ? NOT_AVAILABLE : formatINR(row.fuelCost)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200">
                  {row.maintenanceCost === null ? NOT_AVAILABLE : formatINR(row.maintenanceCost)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200">
                  {row.costPerKm === null ? NOT_AVAILABLE : formatRate(row.costPerKm)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200">
                  {row.mileage === null ? NOT_AVAILABLE : formatMileage(row.mileage)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white shadow-card animate-fade-in-up dark:border-slate-800 dark:bg-slate-900">
      {/* Table toolbar */}
      <div className="flex flex-col gap-2.5 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">Vehicle Report</h3>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            Vehicle-wise trip, distance, fuel and maintenance analysis
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter table by vehicle…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-[13px] text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>
      </div>

      {renderBody()}
    </section>
  );
}

export default memo(VehicleReportTable);