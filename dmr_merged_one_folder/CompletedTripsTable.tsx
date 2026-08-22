import { DollarSign, Pencil, Lock, Hash, Calendar, Truck, UserCog, Warehouse, ShoppingBag, Bird, Scale, Settings } from "lucide-react";
import type { ReactNode } from "react";
import type { Trip } from "../../vehicle-trips/types/trip.ts";

// Helper: check if trip is within 10 days
const isWithin10Days = (createdAt: string) => {
  const created = new Date(createdAt);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays <= 10;
};

interface Props {
  trips: Trip[];
  onEnterRate: (trip: Trip) => void;
  onModifyRate: (trip: Trip) => void;
  children?: ReactNode;
}

export default function CompletedTripsTable({ trips, onEnterRate, onModifyRate, children }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="w-full overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50/80 border-b border-slate-200/70">
            <tr className="text-slate-600 whitespace-nowrap">
              <th className="px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wider w-10">#</th>
              <th className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wider">
                <div className="flex items-center gap-1.5">
                  <Hash size={13} className="text-slate-400 flex-shrink-0" />
                  <span>Trip No</span>
                </div>
              </th>
              <th className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wider">
                <div className="flex items-center gap-1.5">
                  <Calendar size={13} className="text-blue-500 flex-shrink-0" />
                  <span>Date</span>
                </div>
              </th>
              <th className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wider">
                <div className="flex items-center gap-1.5">
                  <Truck size={13} className="text-indigo-500 flex-shrink-0" />
                  <span>Vehicle</span>
                </div>
              </th>
              <th className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wider">
                <div className="flex items-center gap-1.5">
                  <UserCog size={13} className="text-purple-500 flex-shrink-0" />
                  <span>Supervisor</span>
                </div>
              </th>
              <th className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wider">
                <div className="flex items-center gap-1.5">
                  <Warehouse size={13} className="text-amber-500 flex-shrink-0" />
                  <span>Farm</span>
                </div>
              </th>
              <th className="px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wider">
                <div className="flex items-center justify-center gap-1.5">
                  <ShoppingBag size={13} className="text-cyan-500 flex-shrink-0" />
                  <span>Shops</span>
                </div>
              </th>
              <th className="px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wider">
                <div className="flex items-center justify-center gap-1.5">
                  <Bird size={13} className="text-blue-500 flex-shrink-0" />
                  <span>Birds</span>
                </div>
              </th>
              <th className="px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wider">
                <div className="flex items-center justify-center gap-1.5">
                  <Scale size={13} className="text-orange-500 flex-shrink-0" />
                  <span>Weight</span>
                </div>
              </th>
              <th className="px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wider">
                <div className="flex items-center justify-center gap-1.5">
                  <Settings size={13} className="text-slate-500 flex-shrink-0" />
                  <span>Action</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {trips.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-slate-400 text-xs font-medium">
                  No trips waiting for rate entry.
                </td>
              </tr>
            ) : (
              trips.map((trip, index) => {
                const isLocked = trip.rateCompleted === true;
                const canModify = isLocked && isWithin10Days(trip.createdAt || "");
                const isReadOnly = isLocked && !canModify;

                return (
                  <tr key={trip.id} className="border-t hover:bg-slate-50/60 transition-colors">
                    <td className="px-3 py-3 text-center text-xs text-slate-500 font-medium">{index + 1}</td>
                    <td className="px-3 py-3 font-semibold text-slate-700 text-xs whitespace-nowrap">{trip.tripNo}</td>
                    <td className="px-3 py-3 text-xs font-medium text-slate-600 whitespace-nowrap">{trip.tripDate}</td>
                    <td className="px-3 py-3 text-xs font-semibold text-slate-800 whitespace-nowrap">{trip.vehicleNo}</td>
                    <td className="px-3 py-3 text-xs font-medium text-slate-700 whitespace-nowrap">{trip.supervisorName}</td>
                    <td className="px-3 py-3 text-xs font-medium text-slate-700 whitespace-nowrap">{trip.sourceFarm}</td>
                    <td className="px-3 py-3 text-center text-xs font-bold text-slate-700 whitespace-nowrap">{trip.totalShops}</td>
                    <td className="px-3 py-3 text-center text-xs font-bold text-blue-600 whitespace-nowrap">{trip.totalBirds.toLocaleString()}</td>
                    <td className="px-3 py-3 text-center text-xs font-bold text-orange-600 whitespace-nowrap">{trip.totalWeight.toFixed(2)}</td>
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      {!isLocked ? (
                        // Enter Rates – always enabled for un-locked trips
                        <button
                          onClick={() => onEnterRate(trip)}
                          className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-semibold transition-all shadow-sm active:scale-95"
                        >
                          <DollarSign size={14} />
                          Enter Rates
                        </button>
                      ) : canModify ? (
                        // Modify Rates – within 10 days
                        <button
                          onClick={() => onModifyRate(trip)}
                          className="inline-flex items-center gap-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 text-xs font-semibold transition-all shadow-sm active:scale-95"
                        >
                          <Pencil size={14} />
                          Modify Rates
                        </button>
                      ) : isReadOnly ? (
                        // Read-only – older than 10 days
                        <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100 text-slate-400 px-3 py-1.5 text-xs font-semibold cursor-not-allowed">
                          <Lock size={14} />
                          Locked
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {children}
    </div>
  );
}