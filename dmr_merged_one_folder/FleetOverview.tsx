// src/modules/fleet-operations/components/fleet/FleetOverview.tsx
// Fleet overview section — searchable, filterable vehicle status cards.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Search, Truck } from "lucide-react";
import type { FleetVehicleOverview, FleetVehicleStatus } from "../../types";
import FleetVehicleCard from "./FleetVehicleCard";

const STATUS_FILTERS: ("all" | FleetVehicleStatus)[] = ["all", "On Trip", "Available", "Inactive"];

function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2.5">
        <div className="h-9 w-9 rounded-lg bg-slate-200/80 dark:bg-slate-800" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 w-28 rounded bg-slate-200/80 dark:bg-slate-800" />
          <div className="h-2.5 w-20 rounded bg-slate-100 dark:bg-slate-800/60" />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-2 w-14 rounded bg-slate-100 dark:bg-slate-800/60" />
            <div className="h-3 w-24 rounded bg-slate-200/80 dark:bg-slate-800" />
          </div>
        ))}
      </div>
      <div className="mt-3 h-16 rounded-lg bg-slate-100/70 dark:bg-slate-800/50" />
    </div>
  );
}

interface FleetOverviewProps {
  vehicles: FleetVehicleOverview[];
  counts: Record<FleetVehicleStatus, number>;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export default function FleetOverview({ vehicles, counts, loading, error, onRetry }: FleetOverviewProps) {
  const [statusFilter, setStatusFilter] = useState<"all" | FleetVehicleStatus>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (statusFilter !== "all" && v.status !== statusFilter) return false;
      if (!q) return true;
      return (
        v.vehicleNumber.toLowerCase().includes(q) ||
        v.driverName.toLowerCase().includes(q) ||
        v.currentTripNo.toLowerCase().includes(q) ||
        v.vehicleType.toLowerCase().includes(q)
      );
    });
  }, [vehicles, statusFilter, query]);

  const renderBody = () => {
    if (loading) {
      return (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      );
    }

    if (error && vehicles.length === 0) {
      return (
        <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center dark:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
            <RefreshCw size={17} />
          </span>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Unable to load vehicles</p>
          <p className="max-w-sm text-xs text-slate-400">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 dark:bg-brand-600 dark:hover:bg-brand-500"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      );
    }

    if (vehicles.length === 0) {
      return (
        <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center dark:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
            <Truck size={17} />
          </span>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No vehicles on record</p>
          <p className="max-w-sm text-xs text-slate-400">
            Add your fleet in Masters → Vehicles and every vehicle's status, trip, fuel and document health will
            appear here automatically.
          </p>
          <Link
            to="/masters?tab=vehicles"
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 dark:bg-brand-600 dark:hover:bg-brand-500"
          >
            <Truck size={14} />
            Add vehicle
          </Link>
        </div>
      );
    }

    if (filtered.length === 0) {
      return (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center dark:border-slate-700">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
            <Search size={15} />
          </span>
          <p className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">No vehicles match this view</p>
          <p className="text-xs text-slate-400">Try a different status filter or search term.</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((vehicle) => (
          <FleetVehicleCard key={vehicle.id} vehicle={vehicle} />
        ))}
      </div>
    );
  };

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-card animate-fade-in-up dark:border-slate-800 dark:bg-slate-900">
      {/* Section header */}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">Fleet overview</h3>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            {counts["On Trip"]} on trip · {counts.Available} available · {counts.Inactive} inactive
          </p>
        </div>
        <Link
          to="/masters?tab=vehicles"
          className="rounded-md px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          Manage vehicles
        </Link>
      </header>

      {error && vehicles.length > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
          <RefreshCw size={13} />
          Vehicle data couldn't refresh from the server — showing the last loaded state.
          <button type="button" onClick={onRetry} className="ml-auto font-semibold underline underline-offset-2">
            Retry
          </button>
        </div>
      )}

      {/* Toolbar: status filters + search */}
      <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map((status) => {
            const isActive = statusFilter === status;
            const count = status === "all" ? vehicles.length : counts[status];
            return (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  isActive
                    ? "bg-brand-600 text-white shadow-sm dark:bg-brand-600"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                }`}
              >
                {status === "all" ? "All" : status}
                <span className={`ml-1 tabular-nums ${isActive ? "text-white/70" : "text-slate-400"}`}>{count}</span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search number, driver, trip…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-[13px] text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>
      </div>

      {/* Body */}
      <div className="mt-3.5">{renderBody()}</div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
        Vehicles and trips sync from the server. Maintenance, documents, FASTag, EMI and fuel data are stored on
        this device until their backend endpoints ship.
      </p>
    </section>
  );
}
