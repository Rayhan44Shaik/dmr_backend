// src/modules/staff/components/performance/RecentTripsTable.tsx

import { memo } from 'react';
import type { PerformanceRecentTrip } from '../../types/performance';

const formatNumber = (value: number, digits = 0) =>
  Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: digits });

const displayDate = (value: string) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

interface RecentTripsTableProps {
  trips: PerformanceRecentTrip[];
}

const RecentTripsTable = ({ trips }: RecentTripsTableProps) => {
  if (!trips || trips.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-8 text-center text-sm font-medium text-slate-400">
        No trips in the selected period.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-100">
        <thead className="bg-slate-50/80">
          <tr>
            <th className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wider text-slate-500">Trip No</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wider text-slate-500">Date</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wider text-slate-500">Vehicle</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-black uppercase tracking-wider text-slate-500">Shops</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-black uppercase tracking-wider text-slate-500">Birds</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-black uppercase tracking-wider text-slate-500">Weight</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-black uppercase tracking-wider text-slate-500">Mortality</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-black uppercase tracking-wider text-slate-500">Weight Loss</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-black uppercase tracking-wider text-slate-500">KM</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {trips.map((trip) => (
            <tr key={trip.tripNo} className="transition-colors hover:bg-slate-50/70">
              <td className="whitespace-nowrap px-3 py-2.5 text-xs font-bold text-slate-800">{trip.tripNo}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-slate-600">{displayDate(trip.tripDate)}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-slate-700">{trip.vehicleNo}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs tabular-nums text-slate-600">{formatNumber(trip.totalShops)}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs tabular-nums text-slate-600">{formatNumber(trip.totalBirdsDelivered)}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs tabular-nums text-slate-600">{formatNumber(trip.totalDeliveredWeight)}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs tabular-nums text-slate-600">{formatNumber(trip.totalMortality)}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs tabular-nums text-slate-600">{formatNumber(trip.weightLoss, 1)}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs tabular-nums text-slate-600">{formatNumber(trip.totalKm)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default memo(RecentTripsTable);