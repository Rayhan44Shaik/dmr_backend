// src/modules/fleet-operations/components/fleet/FleetVehicleCard.tsx
// Per-vehicle status card for the fleet overview.

import { memo } from "react";
import { Banknote, Fuel, ShieldAlert, Truck, Wrench } from "lucide-react";
import type { FleetDocumentStatus, FleetExpiryState, FleetVehicleOverview, FleetVehicleStatus } from "../../types";
import { formatINR, formatNumber } from "../../../../utils/format";

const STATUS_STYLES: Record<FleetVehicleStatus, { badge: string; dot: string }> = {
  "On Trip": {
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  Available: {
    badge: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400",
    dot: "bg-sky-500",
  },
  Inactive: {
    badge: "bg-slate-100 text-slate-500 ring-slate-500/10 dark:bg-slate-700/60 dark:text-slate-400",
    dot: "bg-slate-400",
  },
};

const DOC_STATE_STYLES: Record<FleetExpiryState, { chip: string; dot: string }> = {
  expired: { chip: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400", dot: "bg-rose-500" },
  expiring: { chip: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400", dot: "bg-amber-500" },
  safe: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400", dot: "bg-emerald-500" },
  none: { chip: "bg-slate-50 text-slate-400 ring-slate-500/10 dark:bg-slate-800 dark:text-slate-500", dot: "bg-slate-300 dark:bg-slate-600" },
};

function DocumentChip({ label, doc }: { label: string; doc: FleetDocumentStatus }) {
  const style = DOC_STATE_STYLES[doc.state];
  return (
    <span
      title={`${label}${doc.expiry ? ` — ${doc.expiry}` : " — not on record"}`}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10.5px] font-semibold ring-1 ring-inset ${style.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {label}
      <span className="font-medium opacity-80 tabular-nums">{doc.expiry ?? "—"}</span>
    </span>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className="truncate text-[13px] font-semibold text-slate-800 tabular-nums dark:text-slate-100">{value}</p>
      {sub && <p className="truncate text-[10.5px] text-slate-400 dark:text-slate-500">{sub}</p>}
    </div>
  );
}

interface FleetVehicleCardProps {
  vehicle: FleetVehicleOverview;
}

function FleetVehicleCard({ vehicle }: FleetVehicleCardProps) {
  const statusStyle = STATUS_STYLES[vehicle.status];
  const docs = vehicle.documents;

  return (
    <article className="flex flex-col rounded-xl border border-slate-200/80 bg-white p-4 shadow-card transition-all duration-150 hover:-translate-y-px hover:border-slate-300/80 hover:shadow-card-lg dark:border-slate-800 dark:bg-slate-900">
      {/* Header */}
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <Truck size={16} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-bold tracking-tight text-slate-900 dark:text-white">
              {vehicle.vehicleNumber}
            </p>
            <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">
              {vehicle.vehicleType} · #{String(vehicle.vehicleNo || vehicle.id).padStart(3, "0")}
            </p>
          </div>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset ${statusStyle.badge}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
          {vehicle.status}
        </span>
      </header>

      {/* Key metrics */}
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
        <Metric label="Driver" value={vehicle.driverName} />
        <Metric label="Current trip" value={vehicle.currentTripNo || "—"} />
        <Metric
          label="Odometer"
          value={vehicle.odometerKm != null ? `${formatNumber(vehicle.odometerKm)} km` : "—"}
        />
        <Metric
          label="Fuel · month"
          value={vehicle.fuelThisMonth > 0 ? formatINR(vehicle.fuelThisMonth) : "—"}
          sub={
            vehicle.lastFuel
              ? `Last ${vehicle.lastFuel.litres} L · ${formatINR(vehicle.lastFuel.amount)}`
              : "No fuel entries"
          }
        />
      </dl>

      {/* Documents */}
      <div className="mt-3 border-t border-slate-100 pt-2.5 dark:border-slate-800">
        <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Documents
        </p>
        <div className="flex flex-wrap gap-1.5">
          <DocumentChip label="Permit" doc={docs.permit} />
          <DocumentChip label="Insurance" doc={docs.insurance} />
          <DocumentChip label="Fitness" doc={docs.fitness} />
        </div>
      </div>

      {/* Maintenance / EMI / FASTag footer */}
      <footer className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span className="flex items-center gap-1">
          <Wrench size={11} className="text-slate-400" />
          {vehicle.maintenance.lastServiceDate
            ? `Serviced ${vehicle.maintenance.lastServiceDate}`
            : "No service record"}
          {vehicle.maintenance.nextServiceKm != null && (
            <span className="text-slate-400">· next {formatNumber(vehicle.maintenance.nextServiceKm)} km</span>
          )}
          {vehicle.maintenance.serviceDue && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-px font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400">
              <ShieldAlert size={10} />
              Service due
            </span>
          )}
        </span>

        {vehicle.emi && (
          <span
            className={`flex items-center gap-1 ${
              vehicle.emi.overdue ? "font-semibold text-rose-600 dark:text-rose-400" : ""
            }`}
          >
            <Banknote size={11} className="text-slate-400" />
            EMI {formatINR(vehicle.emi.emiAmount)} · due {vehicle.emi.nextDueDate}
            {vehicle.emi.overdue && <span className="font-semibold">(overdue)</span>}
          </span>
        )}

        {vehicle.fastag && (
          <span className={`flex items-center gap-1 ${vehicle.fastag.lowBalance ? "font-semibold text-amber-600 dark:text-amber-400" : ""}`}>
            <Fuel size={11} className="text-slate-400" />
            FASTag {formatINR(vehicle.fastag.balance)}
            {vehicle.fastag.lowBalance && " · low balance"}
          </span>
        )}
      </footer>
    </article>
  );
}

export default memo(FleetVehicleCard);
