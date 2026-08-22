// src/modules/dashboard/components/TodayTripsTable.tsx
// Operations snapshot — today's trips with a sticky header.

import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, PackageOpen } from "lucide-react";
import type { TripView } from "../utils/dashboardDerive";
import { formatNumber, formatWeight } from "../../../utils/format";
import TripStatusBadge from "./TripStatusBadge";

interface TodayTripsTableProps {
  trips: TripView[];
  /** True when the shown rows are the latest available (not today's). */
  isFallback?: boolean;
}

export default function TodayTripsTable({ trips, isFallback = false }: TodayTripsTableProps) {
  return (
    <section className="rounded-xl border border-slate-200/80 bg-white shadow-card animate-fade-in-up dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-center justify-between gap-2 px-4 pb-3 pt-4">
        <div>
          <h3 className="text-[13.5px] font-semibold tracking-tight text-slate-800 dark:text-slate-100">
            {isFallback ? "Latest trips" : "Today's trips"}
          </h3>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            {isFallback ? "No trips recorded today — showing the most recent activity" : "Live operations snapshot"}
          </p>
        </div>
        <Link
          to="/operations?tab=trip-list"
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          View all
          <ArrowRight size={13} />
        </Link>
      </header>

      {trips.length === 0 ? (
        <div className="mx-4 mb-4 flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center dark:border-slate-700">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
            <PackageOpen size={16} />
          </span>
          <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300">No trips recorded today</p>
          <p className="max-w-xs text-xs text-slate-400">
            Dispatch a vehicle to start the day's first trip.
          </p>
          <Link
            to="/operations?tab=trip-entry"
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 dark:bg-brand-600 dark:hover:bg-brand-500"
          >
            <CalendarDays size={13} />
            Start trip entry
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-500">
                <th className="sticky top-0 px-4 py-2.5 font-semibold">Trip No</th>
                <th className="px-4 py-2.5 font-semibold">Vehicle</th>
                <th className="px-4 py-2.5 font-semibold">Driver</th>
                <th className="px-4 py-2.5 font-semibold">Supervisor</th>
                <th className="px-4 py-2.5 font-semibold">Farm</th>
                <th className="px-4 py-2.5 font-semibold">Shop</th>
                <th className="px-4 py-2.5 text-right font-semibold">Birds</th>
                <th className="px-4 py-2.5 text-right font-semibold">Weight</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="text-[13px]">
              {trips.slice(0, 6).map((trip) => (
                <tr
                  key={trip.tripNo}
                  className="border-b border-slate-50 transition-colors hover:bg-slate-50/60 dark:border-slate-800/60 dark:hover:bg-slate-800/30"
                >
                  <td className="px-4 py-2.5 font-semibold text-slate-800 tabular-nums dark:text-slate-100">{trip.tripNo}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-200">{trip.vehicle}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{trip.driver}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{trip.supervisor}</td>
                  <td className="max-w-[140px] truncate px-4 py-2.5 text-slate-600 dark:text-slate-300">{trip.farm}</td>
                  <td className="max-w-[150px] truncate px-4 py-2.5 text-slate-600 dark:text-slate-300">{trip.shop}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{formatNumber(trip.birds)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{formatWeight(trip.weight)}</td>
                  <td className="px-4 py-2.5">
                    <TripStatusBadge status={trip.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
