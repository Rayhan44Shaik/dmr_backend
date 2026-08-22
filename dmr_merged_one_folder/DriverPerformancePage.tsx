// src/modules/staff/pages/DriverPerformancePage.tsx

import { memo, useMemo, useState, useEffect, useCallback } from 'react';
import {
  AlertCircle,
  Fuel,
  Gauge,
  RefreshCw,
  Route,
  TrendingUp,
  Truck,
  X,
  Award,
  Target,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Search,
} from 'lucide-react';
import { useStaffPerformance } from '../hooks/useStaffPerformance';
import WeeklyActivityChart from '../components/performance/WeeklyActivityChart';
import RecentTripsTable from '../components/performance/RecentTripsTable';
import DateRangePicker from '../components/common/DateRangePicker';
import Pagination from '../components/common/Pagination';
import RefreshToast from '../components/common/RefreshToast';
import type { DriverPerformanceResponse } from '../types/performance';

const money = (value: number, digits = 0) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: digits })}`;
const number = (value: number, digits = 0) =>
  Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: digits });

function Kpi({
  label,
  value,
  sub,
  icon,
  tone,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone: string;
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow min-h-[72px]">
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</div>
        <div className="text-xl font-extrabold text-slate-900 mt-0.5 truncate">{value}</div>
        {sub && (
          <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-500">
            {trend === 'up' && <ArrowUpRight size={10} className="text-emerald-600" />}
            {trend === 'down' && <ArrowDownRight size={10} className="text-rose-600" />}
            {trend === 'neutral' && <span className="w-2 h-2 rounded-full bg-slate-300" />}
            <span>{sub}</span>
          </div>
        )}
      </div>
      <div className={`p-2 rounded-lg ${tone} flex-shrink-0 ml-2`}>{icon}</div>
    </div>
  );
}

function PerformanceBadge({ rating }: { rating: 'Excellent' | 'Good' | 'Needs Attention' }) {
  const styles = {
    Excellent: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Good: 'bg-blue-50 text-blue-700 border-blue-200',
    'Needs Attention': 'bg-rose-50 text-rose-700 border-rose-200',
  };
  const icons = {
    Excellent: <Award size={10} className="text-emerald-600" />,
    Good: <Target size={10} className="text-blue-600" />,
    'Needs Attention': <AlertCircle size={10} className="text-rose-600" />,
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold border ${styles[rating]}`}>
      {icons[rating]} {rating}
    </span>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-700 font-bold text-xs"><Award size={12} /></span>;
  if (rank === 2) return <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-bold text-xs">{rank}</span>;
  if (rank === 3) return <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-50 text-amber-700 font-bold text-xs">{rank}</span>;
  return <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-600 font-medium text-xs">{rank}</span>;
}

const ITEMS_PER_PAGE = 10;

const DriverPerformancePage = () => {
  const perf = useStaffPerformance('drivers');
  const data = perf.data as DriverPerformanceResponse;

  const kpis = data.kpis;
  const weekly = useMemo(
    () =>
      (data.weekly || []).map((point) => ({
        week: point.week,
        distance: point.distance,
        fuelLitres: point.fuelLitres,
      })),
    [data.weekly]
  );

  const selectedRow = useMemo(
    () => (perf.selectedId != null ? data.rows.find((r) => r.driverId === perf.selectedId) ?? null : null),
    [data.rows, perf.selectedId]
  );

  // Local search state - only submits on explicit search action
  const [searchValue, setSearchValue] = useState(perf.searchInput);
  const [searchSubmitted, setSearchSubmitted] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // Refresh toast state
  const [showRefreshToast, setShowRefreshToast] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState('Driver Performance refreshed');
  const [refreshError, setRefreshError] = useState(false);

  // Compute performance rating for each driver based on mileage and cost efficiency
  const rowsWithRating = useMemo(() => {
    if (!data.rows.length) return [];
    const mileages = data.rows.map(r => r.mileage).filter(m => m > 0);
    const costPerKms = data.rows.map(r => r.costPerKm).filter(c => c > 0);
    const avgMileage = mileages.length ? mileages.reduce((a, b) => a + b, 0) / mileages.length : 0;
    const avgCostPerKm = costPerKms.length ? costPerKms.reduce((a, b) => a + b, 0) / costPerKms.length : 0;

    return data.rows.map((row, index) => {
      let rating: 'Excellent' | 'Good' | 'Needs Attention' = 'Good';
      if (row.mileage > avgMileage * 1.1 && row.costPerKm < avgCostPerKm * 0.9) rating = 'Excellent';
      else if (row.mileage < avgMileage * 0.9 || row.costPerKm > avgCostPerKm * 1.1) rating = 'Needs Attention';
      return { ...row, rating, rank: index + 1 };
    });
  }, [data.rows]);

  // Paginated rows
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return rowsWithRating.slice(start, start + ITEMS_PER_PAGE);
  }, [rowsWithRating, currentPage]);

  const totalPages = Math.ceil(rowsWithRating.length / ITEMS_PER_PAGE);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [perf.fromDate, perf.toDate, searchSubmitted]);

  // Handle search submit - only trigger on explicit action
  const handleSearchSubmit = useCallback((e?: React.FormEvent | React.KeyboardEvent) => {
    if (e) e.preventDefault();
    perf.setSearchInput(searchValue);
    setSearchSubmitted(true);
    setCurrentPage(1);
  }, [perf, searchValue]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearchSubmit(e);
    }
  }, [handleSearchSubmit]);

  // Handle refresh with toast notification - wait for data to actually refresh
  const handleRefresh = useCallback(async () => {
    if (perf.loading || perf.refreshing) return;
    
    // Track the current refresh nonce to detect when refresh completes
    const currentNonce = perf.refreshNonce;
    setRefreshMessage('Driver Performance refreshed');
    setRefreshError(false);
    setShowRefreshToast(true);
    perf.refresh();

    // Poll for refresh completion
    const checkRefresh = setInterval(() => {
      if (perf.refreshNonce !== currentNonce && !perf.refreshing) {
        clearInterval(checkRefresh);
        // Small delay to ensure state is updated
        setTimeout(() => {
          if (!perf.error) {
            setRefreshMessage('Driver Performance refreshed');
            setRefreshError(false);
          } else {
            setRefreshMessage('Unable to refresh Driver Performance');
            setRefreshError(true);
          }
        }, 100);
      }
    }, 200);

    // Cleanup after 10 seconds max
    setTimeout(() => clearInterval(checkRefresh), 10000);
  }, [perf]);

  // 4 meaningful performance KPIs
  const performanceKpis = useMemo(() => [
    {
      label: 'Active Drivers',
      value: perf.loading ? '—' : number(kpis.drivers),
      sub: 'Participating',
      icon: <Users size={16} />,
      tone: 'bg-blue-50 text-blue-600',
    },
    {
      label: 'Trip Participation',
      value: perf.loading ? '—' : number(kpis.trips),
      sub: 'Total trips',
      icon: <Route size={16} />,
      tone: 'bg-indigo-50 text-indigo-600',
    },
    {
      label: 'Avg Mileage',
      value: perf.loading ? '—' : `${number(kpis.mileage, 1)} km/L`,
      sub: 'Fuel efficiency',
      icon: <Gauge size={16} />,
      tone: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'Cost / KM',
      value: perf.loading ? '—' : money(kpis.costPerKm, 1),
      sub: 'Per kilometer',
      icon: <TrendingUp size={16} />,
      tone: 'bg-violet-50 text-violet-600',
    },
  ], [kpis, perf.loading]);

  return (
    <div className="w-full space-y-4 bg-slate-50/30 min-h-screen pb-8">
      {/* Refresh Toast */}
      <RefreshToast
        message={refreshMessage}
        isVisible={showRefreshToast}
        onClose={() => setShowRefreshToast(false)}
        duration={5000}
        isError={refreshError}
      />

      {/* Filters Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-3 flex-1 min-w-0">
            {/* Date Range - Wider date fields */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">Date Range</span>
              <DateRangePicker
                fromDate={perf.fromDate}
                toDate={perf.toDate}
                onFromDateChange={perf.setFromDate}
                onToDateChange={perf.setToDate}
                className="flex-shrink-0"
                disabled={perf.loading}
              />
            </div>

            {/* Search - Moderately sized */}
            <div className="w-full lg:w-auto lg:max-w-[280px] lg:flex-1">
              <form onSubmit={handleSearchSubmit} className="w-full">
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Search className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Search driver name…"
                    className="block w-full rounded-md border border-gray-300 py-2 pl-10 pr-10 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    disabled={perf.loading}
                  />
                  {searchValue && (
                    <button
                      type="button"
                      onClick={() => setSearchValue('')}
                      className="absolute inset-y-0 right-0 flex items-center pr-3"
                    >
                      <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>

          {/* Search + Refresh - Same row */}
          <div className="flex items-center gap-2 flex-wrap lg:flex-nowrap">
            <button
              type="button"
              onClick={handleSearchSubmit}
              disabled={perf.loading || !searchValue.trim()}
              className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-xs transition-colors hover:bg-slate-50 disabled:opacity-50 flex-shrink-0"
            >
              <Search size={13} className="text-slate-400" /> Search
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={perf.loading || perf.refreshing}
              className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-xs transition-colors hover:bg-slate-50 disabled:opacity-50 flex-shrink-0"
            >
              <RefreshCw size={13} className={perf.refreshing ? 'animate-spin text-emerald-600' : 'text-slate-400'} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {perf.error && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <span className="flex items-center gap-2"><AlertCircle size={16} />{perf.error}</span>
          <button type="button" onClick={perf.refresh} className="font-bold underline">Retry</button>
        </div>
      )}

      {/* Performance Overview - 4 Compact KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {performanceKpis.map((kpi, idx) => (
          <Kpi key={idx} {...kpi} />
        ))}
      </div>

      {/* Weekly Activity Chart */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-sm">
        <div className="mb-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Weekly Activity</h3>
          <p className="mt-0.5 text-sm font-bold text-slate-800">Distance & Fuel Efficiency</p>
        </div>
        <WeeklyActivityChart
          data={weekly}
          bars={[
            { key: 'distance', label: 'Distance (km)', color: '#2563eb' },
            { key: 'fuelLitres', label: 'Fuel (L)', color: '#f59e0b' },
          ]}
          emptyText="No weekly activity for the selected filters."
          chartType="mixed"
        />
      </div>

      {/* Driver Ranking Table */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Driver Performance</h3>
        </div>

        {perf.loading && !selectedRow ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : rowsWithRating.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center px-6">
            <Route className="mx-auto mb-3 text-slate-300" size={42} />
            <p className="font-bold text-slate-700">No driver activity</p>
            <p className="mt-1 text-sm text-slate-400">No completed trips found for the selected period.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 w-10">Rank</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 min-w-[140px]">Driver</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 w-24">Status</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500 w-18">Trips</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500 w-24">Distance</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500 w-22">Avg/Trip</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500 w-18">Vehicles</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500 w-22">Fuel (L)</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500 w-26">Total Cost</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500 w-22">₹/km</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500 w-22 font-medium">Mileage</th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 w-28">Performance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {paginatedRows.map((row) => {
                    const selected = row.driverId === perf.selectedId;
                    return (
                      <tr
                        key={row.driverId}
                        onClick={() => perf.selectRow(selected ? null : row.driverId)}
                        className={`cursor-pointer transition-colors ${selected ? 'bg-emerald-50/70' : 'hover:bg-slate-50/50'}`}
                      >
                        <td className="whitespace-nowrap px-3 py-2.5 text-center">
                          <RankBadge rank={row.rank} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-sm font-semibold text-slate-900">{row.driverName}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-sm text-slate-600">{row.employeeStatus}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums text-slate-600">{number(row.trips)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums text-slate-700">{number(row.distance)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums text-slate-600">{number(row.avgDistancePerTrip, 1)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums text-slate-600">{number(row.vehicles)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums text-slate-600">{number(row.fuelLitres, 1)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm font-bold tabular-nums text-slate-800">{money(row.totalCost)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums text-slate-600">{number(row.costPerKm, 1)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums text-slate-600 font-medium">{number(row.mileage, 1)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-center">
                          <PerformanceBadge rating={row.rating} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={rowsWithRating.length}
              itemsPerPage={ITEMS_PER_PAGE}
              onPageChange={setCurrentPage}
            />
          </>
        )}
      </div>

      {/* Detail Panel */}
      {perf.selectedId != null && (
        <div className="bg-white rounded-xl border border-emerald-200 shadow-sm overflow-hidden animate-fadeIn">
          <div className="p-4 border-b border-emerald-200 bg-emerald-50/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600"><TrendingUp size={16} /></div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">{selectedRow?.driverName ?? 'Driver detail'}</h3>
                <p className="text-[10px] font-medium text-slate-500">
                  {selectedRow
                    ? `${selectedRow.vehicleNos.join(', ') || 'No vehicles'} • avg ${number(selectedRow.avgDistancePerTrip, 1)} km/trip`
                    : 'Loading detail…'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => perf.selectRow(null)}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              <X size={13} /> Close
            </button>
          </div>

          {perf.loading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-10 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          ) : data.detail ? (
            <div className="p-4 space-y-5">
              {/* Vehicle Breakdown */}
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  <Truck size={12} /> Vehicle Breakdown
                </h4>
                {data.detail.vehicles.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-6 text-center text-sm font-medium text-slate-400">
                    No vehicle detail for the selected period.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-100">
                      <thead className="bg-slate-50/80">
                        <tr>
                          <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Vehicle No</th>
                          <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Trips</th>
                          <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Distance</th>
                          <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Avg/Trip</th>
                          <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Fuel (L)</th>
                          <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Fuel Cost</th>
                          <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Maint Cost</th>
                          <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Cost</th>
                          <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Mileage</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {data.detail.vehicles.map((vehicle) => (
                          <tr key={vehicle.vehicleNo} className="transition-colors hover:bg-slate-50/70">
                            <td className="whitespace-nowrap px-3 py-2.5 text-sm font-bold text-slate-800">{vehicle.vehicleNo}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums text-slate-600">{number(vehicle.trips)}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums text-slate-700">{number(vehicle.distance)}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums text-slate-600">{number(vehicle.avgDistancePerTrip, 1)}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums text-slate-600">{number(vehicle.fuelLitres, 1)}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums text-slate-700">{money(vehicle.fuelCost)}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums text-slate-700">{money(vehicle.maintenanceCost)}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm font-bold tabular-nums text-slate-800">{money(vehicle.totalCost)}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums text-slate-600">{number(vehicle.mileage, 1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Recent Trips */}
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  <Fuel size={12} /> Recent Trips
                </h4>
                <RecentTripsTable trips={data.detail.recentTrips} />
              </div>
            </div>
          ) : (
            <div className="p-5 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-center text-sm font-medium text-slate-400">
              No detail available for the selected period.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default memo(DriverPerformancePage);