import { ArrowRight, CalendarDays, FileClock, RefreshCw, Truck } from "lucide-react";
import {
  getNextIncompleteTripStep,
  type Trip,
} from "../../../shared/trip";

const stepLabels = ["Start", "Farm", "Pickup", "Deliveries", "End"];

function formatTripDate(value: string): string {
  if (!value) return "Date not set";
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  if (value.slice(0, 10) === todayKey) return "Today";
  return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function RecentDraftsList({
  drafts,
  loading,
  stale,
  onRefresh,
  onResume,
}: {
  drafts: Trip[];
  loading: boolean;
  stale: boolean;
  onRefresh: () => void;
  onResume: (trip: Trip) => void;
}) {
  return (
    <section aria-labelledby="recent-drafts-title" className="rounded-3xl border border-slate-200/80 bg-white shadow-card-lg">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-100">
            <FileClock size={19} />
          </span>
          <div className="min-w-0">
            <h2 id="recent-drafts-title" className="text-[15px] font-extrabold tracking-tight text-slate-900">
              Recent Drafts
            </h2>
            <p className="mt-0.5 text-[11px] font-medium text-slate-500">
              {drafts.length} {drafts.length === 1 ? "trip" : "trips"} waiting to be completed
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm disabled:opacity-50"
          aria-label="Refresh recent drafts"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {stale && (
        <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-relaxed text-amber-800">
          Showing the last saved device copy. It will be checked against the server when connectivity returns.
        </div>
      )}

      <div className="p-3">
        {loading && drafts.length === 0 ? (
          <div className="space-y-3 p-1" aria-label="Loading drafts">
            {[0, 1].map((item) => (
              <div key={item} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : drafts.length === 0 ? (
          <div className="flex min-h-52 flex-col items-center justify-center px-6 py-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <FileClock size={25} />
            </span>
            <p className="mt-4 text-sm font-bold text-slate-800">No draft trips</p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">
              Trips saved with backend status Draft will appear here. Submitted trips are removed automatically.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {drafts.map((trip, index) => {
              const step = getNextIncompleteTripStep(trip);
              const localOnly = trip.id <= 0 || !trip.tripNo;
              return (
                <li key={trip.id > 0 ? `server-${trip.id}` : `local-${index}`}>
                  <button
                    type="button"
                    onClick={() => onResume(trip)}
                    className="group w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/30"
                    aria-label={`Resume ${trip.tripNo || "local draft"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-extrabold tracking-tight text-slate-900">
                            {trip.tripNo || "Awaiting Trip ID"}
                          </span>
                          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-700">
                            Draft
                          </span>
                        </div>
                        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-slate-500">
                          <span className="inline-flex items-center gap-1.5">
                            <Truck size={13} className="text-slate-400" />
                            {trip.vehicleNo || "Vehicle not selected"}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarDays size={13} className="text-slate-400" />
                            {formatTripDate(trip.tripDate)}
                          </span>
                        </div>
                      </div>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-200 transition group-hover:translate-x-0.5">
                        <ArrowRight size={16} />
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                      <span className="text-[11px] font-bold text-slate-500">
                        Continue with Step {step + 1} · {stepLabels[step]}
                      </span>
                      {localOnly && (
                        <span className="text-[10px] font-bold text-amber-700">Saved locally</span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
