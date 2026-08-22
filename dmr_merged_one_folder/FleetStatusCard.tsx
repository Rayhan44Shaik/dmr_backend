// src/modules/dashboard/components/FleetStatusCard.tsx
// Fleet overview — vehicle tiles with status, driver, trip, fuel, maintenance.

import { Link } from "react-router-dom";
import { ArrowRight, Gauge, ShieldAlert, Truck } from "lucide-react";
import type { FleetVehicleView } from "../utils/dashboardDerive";
import { formatINR, formatNumber } from "../../../utils/format";

const STATUS_STYLES: Record<FleetVehicleView["status"], string> = {
  "On Trip": "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400",
  Available: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400",
  Inactive: "bg-slate-100 text-slate-500 ring-slate-500/10 dark:bg-slate-700/60 dark:text-slate-400",
};

const STATUS_DOT: Record<FleetVehicleView["status"], string> = {
  "On Trip": "bg-emerald-500",
  Available: "bg-sky-500",
  Inactive: "bg-slate-400",
};

function daysUntil(value: string): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

interface FleetStatusCardProps {
  fleet: FleetVehicleView[];
}

export default function FleetStatusCard({ fleet }: FleetStatusCardProps) {
  const visible = fleet.slice(0, 6);

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white shadow-card animate-fade-in-up dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-center justify-between gap-2 px-4 pb-3 pt-4">
        <div>
          <h3 className="text-[13.5px] font-semibold tracking-tight text-slate-800 dark:text-slate-100">Vehicle status</h3>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            {fleet.filter((f) => f.status === "On Trip").length} on trip · {fleet.filter((f) => f.status === "Available").length} available
          </p>
        </div>
        <Link
          to="/fleet?tab=analytics"
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          Fleet overview
          <ArrowRight size={13} />
        </Link>
      </header>

      <div className="px-3 pb-4">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center dark:border-slate-700">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
              <Truck size={16} />
            </span>
            <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300">No vehicles on record</p>
            <p className="max-w-xs text-xs text-slate-400">
              Add vehicles in Masters → Vehicles to start tracking your fleet.
            </p>
            <Link
              to="/masters?tab=vehicles"
              className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 dark:bg-brand-600 dark:hover:bg-brand-500"
            >
              Add vehicle
            </Link>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((vehicle) => {
              const permit = daysUntil(vehicle.permitExpiry);
              const insurance = daysUntil(vehicle.insuranceExpiry);
              const expiringSoon = (permit != null && permit <= 30) || (insurance != null && insurance <= 30);
              return (
                <li
                  key={vehicle.id}
                  className="rounded-lg border border-slate-100 bg-slate-50/40 p-3 transition-colors hover:border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-slate-700 dark:hover:bg-slate-800/70"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                      <Truck size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                          {vehicle.number}
                        </span>
                        {expiringSoon && (
                          <span title="Document expiring within 30 days" className="shrink-0 text-amber-500">
                            <ShieldAlert size={12} />
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-[11px] text-slate-400 dark:text-slate-500">
                        {vehicle.currentTrip
                          ? `Trip ${vehicle.currentTrip}`
                          : vehicle.driver !== "—"
                          ? `Driver · ${vehicle.driver}`
                          : vehicle.type}
                      </span>
                    </span>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset ${STATUS_STYLES[vehicle.status]}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[vehicle.status]}`} />
                      {vehicle.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 pl-[42px] text-[11px] text-slate-400 dark:text-slate-500">
                    <span className="flex items-center gap-1">
                      <Gauge size={11} />
                      {vehicle.km != null ? `${formatNumber(vehicle.km)} km` : "— km"}
                    </span>
                    <span>Fuel {vehicle.fuel > 0 ? formatINR(vehicle.fuel) : "—"}</span>
                    <span className="hidden truncate lg:inline">{vehicle.maintenanceNote}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
