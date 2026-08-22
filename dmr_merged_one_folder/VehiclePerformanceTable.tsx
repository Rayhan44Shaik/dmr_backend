import { memo, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { AnalyticsVehicleStat } from '../../types/analytics';
import Pagination from '../common/Pagination';
import { formatCurrencyCompact, formatNumberCompact } from '../../utils/formatters';

type SortKey =
  | 'vehicleNumber'
  | 'trips'
  | 'distance'
  | 'fuelLitres'
  | 'mileage'
  | 'fuelCost'
  | 'maintenanceCost'
  | 'totalExpense'
  | 'costPerKm';

type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 10;

const COLUMNS: { key: SortKey; label: string; align: 'left' | 'right' }[] = [
  { key: 'vehicleNumber', label: 'Vehicle', align: 'left' },
  { key: 'trips', label: 'Trips', align: 'right' },
  { key: 'distance', label: 'Distance', align: 'right' },
  { key: 'fuelLitres', label: 'Fuel', align: 'right' },
  { key: 'mileage', label: 'Mileage', align: 'right' },
  { key: 'fuelCost', label: 'Fuel Cost', align: 'right' },
  { key: 'maintenanceCost', label: 'Maint. Cost', align: 'right' },
  { key: 'totalExpense', label: 'Total Cost', align: 'right' },
  { key: 'costPerKm', label: 'Cost/KM', align: 'right' },
];

const SORT_GETTER: Record<SortKey, (row: AnalyticsVehicleStat) => number | string> = {
  vehicleNumber: (row) => row.vehicleNumber,
  trips: (row) => row.trips,
  distance: (row) => row.distance,
  fuelLitres: (row) => row.fuelLitres,
  mileage: (row) => row.mileage,
  fuelCost: (row) => row.fuelCost,
  maintenanceCost: (row) => row.maintenanceCost,
  totalExpense: (row) => row.totalExpense,
  costPerKm: (row) => (row.distance > 0 ? row.totalExpense / row.distance : 0),
};

interface VehiclePerformanceTableProps {
  stats: AnalyticsVehicleStat[];
  statusById: Map<number, string>;
}

const VehiclePerformanceTable = ({ stats, statusById }: VehiclePerformanceTableProps) => {
  const [sortKey, setSortKey] = useState<SortKey>('totalExpense');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    const getter = SORT_GETTER[sortKey];
    const factor = sortDir === 'asc' ? 1 : -1;
    return [...stats].sort((a, b) => {
      const av = getter(a);
      const bv = getter(b);
      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv) * factor;
      }
      return ((Number(av) || 0) - (Number(bv) || 0)) * factor;
    });
  }, [stats, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(
    () => sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [sorted, safePage]
  );

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'vehicleNumber' ? 'asc' : 'desc');
    }
  };

  if (stats.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-10 text-sm font-medium text-slate-400">
        No vehicle performance data for the selected filters.
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50/80">
            <tr>
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  className={`px-3 py-2.5 ${
                    column.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider transition-colors ${
                      sortKey === column.key ? 'text-emerald-700' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {column.label}
                    {sortKey === column.key ? (
                      sortDir === 'asc' ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-slate-300" />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {paged.map((row) => {
              const isInactive = statusById.get(row.vehicleId) === 'Inactive';
              const costPerKm = row.distance > 0 ? row.totalExpense / row.distance : 0;
              return (
                <tr key={row.vehicleId} className="transition-colors hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800">{row.vehicleNumber}</span>
                      {isInactive && (
                        <span className="rounded-full border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                          Inactive
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold tabular-nums text-slate-600">
                    {formatNumberCompact(row.trips)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs tabular-nums text-slate-600">
                    {formatNumberCompact(row.distance)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs tabular-nums text-slate-600">
                    {formatNumberCompact(row.fuelLitres)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold tabular-nums text-slate-700">
                    {row.mileage > 0 ? row.mileage.toFixed(2) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs tabular-nums text-slate-600">
                    {row.fuelCost > 0 ? formatCurrencyCompact(row.fuelCost) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs tabular-nums text-slate-600">
                    {row.maintenanceCost > 0 ? formatCurrencyCompact(row.maintenanceCost) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-bold tabular-nums text-slate-800">
                    {formatCurrencyCompact(row.totalExpense)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold tabular-nums text-slate-700">
                    {costPerKm > 0 ? `₹${costPerKm.toFixed(2)}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2">
        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          onPageChange={setPage}
          itemsPerPage={PAGE_SIZE}
          totalItems={sorted.length}
        />
      </div>
    </div>
  );
};

export default memo(VehiclePerformanceTable);