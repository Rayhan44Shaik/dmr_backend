// src/modules/staff/pages/SupervisorPerformancePage.tsx

import { memo, useMemo, useState, useEffect, useCallback } from 'react';
import {
  AlertCircle,
  ClipboardCheck,
  RefreshCw,
  Scale,
  Store,
  TrendingUp,
  Users,
  X,
  Award,
  Target,
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
import type { SupervisorPerformanceResponse } from '../types/performance';

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

const SupervisorPerformancePage = () => {
  const perf = useStaffPerformance('supervisors');
  const data = perf.data as SupervisorPerformanceResponse;

  const kpis = data.kpis;
  const weekly = useMemo(
    () =>
      (data.weekly || []).map((point) => ({
        week: point.week,
        trips: point.trips,
        birds: point.birds,
        weight: point.weight,
      })),
    [data.weekly]
  );

  // Mortality data for chart summary
  const mortalityWeekly = useMemo(
    () =>
      (data.weekly || []).map((w) => ({
        week: w.week,
        mortalityRate: kpis.mortalityRate,
        mortality: Math.round((w.birds * kpis.mortalityRate) / 100),
      })),
    [data.weekly, kpis.mortalityRate]
  );

  const selectedRow = useMemo(
    () =>
      perf.selectedId != null
        ? data.rows.find((r) => r.supervisorId === perf.selectedId) ?? null
        : null,
    [data.rows, perf.selectedId]
  );

  // Local search state - only submits on explicit search action
  const [searchValue, setSearchValue] = useState(perf.searchInput);
  const [searchSubmitted, setSearchSubmitted] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // Refresh toast state
  const [showRefreshToast, setShowRefreshToast] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState('Supervisor Performance refreshed');
  const [refreshError, setRefreshError] = useState(false);

  // Compute performance rating for each supervisor based on mortality rate and delivery efficiency
  const rowsWithRating = useMemo(() => {
    if (!data.rows.length) return [];
    const mortalityRates = data.rows.map(r => r.mortalityRate).filter(m => m > 0);
    const trips = data.rows.map(r => r.trips).filter(t => t > 0);
    const avgMortalityRate = mortalityRates.length ? mortalityRates.reduce((a, b) => a + b, 0) / mortalityRates.length : 0;
    const avgTrips = trips.length ? trips.reduce((a, b) => a + b, 0) / trips.length : 0;

    return data.rows.map((row, index) => {
      let rating: 'Excellent' | 'Good' | 'Needs Attention' = 'Good';
      // Lower mortality is better, higher trips is better
      if (row.mortalityRate < avgMortalityRate * 0.8 && row.trips > avgTrips * 1.1) rating = 'Excellent';
      else if (row.mortalityRate > avgMortalityRate * 1.2 || row.trips < avgTrips * 0.8) rating = 'Needs Attention';
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
    
    const currentNonce = perf.refreshNonce;
    setRefreshMessage('Supervisor Performance refreshed');
    setRefreshError(false);
    setShowRefreshToast(true);
    perf.refresh();

    // Poll for refresh completion
    const checkRefresh = setInterval(() => {
      if (perf.refreshNonce !== currentNonce && !perf.refreshing) {
        clearInterval(checkRefresh);
        setTimeout(() => {
          if (!perf.error) {
            setRefreshMessage('Supervisor Performance refreshed');
            setRefreshError(false);
          } else {
            setRefreshMessage('Unable to refresh Supervisor Performance');
            setRefreshError(true);
          }
        }, 100);
      }
    }, 200);

    setTimeout(() => clearInterval(checkRefresh), 10000);
  }, [perf]);

  // 4 meaningful supervisor KPIs - different from Driver KPIs
  const performanceKpis = useMemo(() => [
    {
      label: 'Active Supervisors',
      value: perf.loading ? '—' : number(kpis.supervisors),
      sub: 'Participating',
      icon: <Users size={16} />,
      tone: 'bg-blue-50 text-blue-600',
    },
    {
      label: 'Trip Participation',
      value: perf.loading ? '—' : number(kpis.trips),
      sub: 'Total trips',
      icon: <ClipboardCheck size={16} />,
      tone: 'bg-indigo-50 text-indigo-600',
    },
    {
      label: 'Shop Coverage',
      value: perf.loading ? '—' : number(kpis.shops),
      sub: 'Unique shops',
      icon: <Store size={16} />,
      tone: 'bg-cyan-50 text-cyan-600',
    },
    {
      label: 'Mortality Rate',
      value: perf.loading ? '—' : `${number(kpis.mortalityRate, 2)}%`,
      sub: 'Delivery quality',
      icon: <Scale size={16} />,
      tone: 'bg-rose-50 text-rose-600',
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
                    placeholder="Search supervisor name…"
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

      {/* Supervisor Overview - 4 Compact KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {performanceKpis.map((kpi, idx) => (
          <Kpi key={idx} {...kpi} />
        ))}
      </div>

      {/* Weekly Operational Activity Chart - Birds + Weight with mortality summary */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-sm">
        <WeeklyActivityChart
          data={weekly}
          bars={[
            { key: 'birds', label: 'Birds', color: '#10b981' },
            { key: 'weight', label: 'Weight (kg)', color: '#f59e0b' },
          ]}
          emptyText="No weekly activity for the selected filters."
          chartType="mixed"
          supervisorMode={true}
          mortalityData={mortalityWeekly}
          totalTrips={kpis.trips}
        />
      </div>

      {/* Supervisor Ranking Table */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Supervisor Performance</h3>
        </div>

        {perf.loading && !selectedRow ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : rowsWithRating.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center px-6">
            <ClipboardCheck className="mx-auto mb-3 text-slate-300" size={42} />
            <p className="font-bold text-slate-700">No supervisor activity</p>
            <p className="mt-1 text-sm text-slate-400">No completed trips found for the selected period.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 w-10">Rank</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 min-w-[140px]">Supervisor</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 w-24">Status</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500 w-18">Trips</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500 w-18">Shops</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500 w-22">Birds</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500 w-24">Weight (kg)</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500 w-18">Mortality</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500 w-22">Mortality %</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500 w-22">Weight Loss</th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 w-28">Performance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {paginatedRows.map((row) => {
                    const selected = row.supervisorId === perf.selectedId;
                    return (
                      <tr
                        key={row.supervisorId}
                        onClick={() => perf.selectRow(selected ? null : row.supervisorId)}
                        className={`cursor-pointer transition-colors ${selected ? 'bg-emerald-50/70' : 'hover:bg-slate-50/50'}`}
                      >
                        <td className="whitespace-nowrap px-3 py-2.5 text-center">
                          <RankBadge rank={row.rank} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-sm font-semibold text-slate-900">{row.supervisorName}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-sm text-slate-600">{row.employeeStatus}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums text-slate-600">{number(row.trips)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums text-slate-600">{number(row.shops)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums text-slate-600">{number(row.birds)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums text-slate-700">{number(row.weight)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums text-slate-600">{number(row.mortality)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums text-slate-600">{number(row.mortalityRate, 2)}%</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums text-slate-600">{number(row.weightLoss, 1)}</td>
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
                <h3 className="text-sm font-bold text-slate-900">{selectedRow?.supervisorName ?? 'Supervisor detail'}</h3>
                <p className="text-[10px] font-medium text-slate-500">
                  {selectedRow
                    ? `${number(selectedRow.shops)} shops • ${number(selectedRow.birds)} birds • ${number(selectedRow.mortalityRate, 2)}% mortality`
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
              {/* Recent Trips */}
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  <ClipboardCheck size={12} /> Recent Trips
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

export default memo(SupervisorPerformancePage);