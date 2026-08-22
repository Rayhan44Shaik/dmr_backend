// src/modules/fleet-operations/components/analytics/TopPerformersTable.tsx
import { memo } from 'react';

interface PerformerData {
  id: string | number;
  vehicleNumber: string;
  mileage: number;
  dist: number;
  fuel: number;
}

interface TopPerformersTableProps {
  performers: PerformerData[];
}

const TopPerformersTable = ({ performers }: TopPerformersTableProps) => {
  if (!performers || performers.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400 text-sm font-medium">
        No dynamic flight data recorded
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100">
      <table className="min-w-full divide-y divide-slate-100">
        <thead className="bg-slate-50/70 backdrop-blur-md">
          <tr>
            <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Vehicle</th>
            <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Mileage</th>
            <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Distance</th>
            <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Fuel Vol</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-slate-100">
          {performers.map((vehicle) => (
            <tr key={vehicle.id} className="hover:bg-slate-50/80 transition-colors duration-150 group">
              <td className="px-4 py-3.5 whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-6 rounded-r bg-emerald-500 -ml-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <span className="font-bold text-slate-800 tracking-wide text-sm">{vehicle.vehicleNumber}</span>
                </div>
              </td>
              <td className="px-4 py-3.5 text-right whitespace-nowrap">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-100">
                  {Number(vehicle.mileage).toFixed(2)} <span className="text-[10px] font-medium text-emerald-600">km/l</span>
                </div>
              </td>
              <td className="px-4 py-3.5 text-right whitespace-nowrap font-semibold text-slate-600 text-sm">
                {Number(vehicle.dist).toLocaleString('en-IN')} <span className="text-[11px] font-normal text-slate-400">KM</span>
              </td>
              <td className="px-4 py-3.5 text-right whitespace-nowrap font-semibold text-slate-600 text-sm">
                {Number(vehicle.fuel).toLocaleString('en-IN')} <span className="text-[11px] font-normal text-slate-400">Ltrs</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default memo(TopPerformersTable);