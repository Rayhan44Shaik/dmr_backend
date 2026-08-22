import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import Select from 'react-select';
import { useAnalyticsData } from '../hooks/useAnalyticsData';
import ErrorBoundary from '../components/common/ErrorBoundary';
import ExpenseBreakdownDonut from '../components/analytics/ExpenseBreakdownDonut';
import VehiclePerformanceChart from '../components/analytics/VehiclePerformanceChart';
import WeeklyTrendChart from '../components/analytics/WeeklyTrendChart';
import VehiclePerformanceTable from '../components/analytics/VehiclePerformanceTable';
import AttentionSection from '../components/analytics/AttentionSection';
import { DatePicker } from '../../../components/common/DatePicker';
import {
  Activity,
  Banknote,
  CalendarDays,
  Fuel,
  Gauge,
  IndianRupee,
  RefreshCw,
  RotateCcw,
  Search,
  TrendingUp,
  Truck,
  Wrench,
} from 'lucide-react';
import { formatCurrencyCompact, formatNumberCompact } from '../utils/formatters';

interface VehicleAnalyticsPageProps {
  embedded?: boolean;
}

const containsFilter = (option: { label: string }, inputValue: string) => {
  if (!inputValue) return true;
  return option.label.toLowerCase().includes(inputValue.toLowerCase());
};

const selectStyles = {
  control: (base: Record<string, unknown>, state: { isFocused: boolean }) => ({
    ...base,
    borderRadius: '0.5rem',
    borderColor: state.isFocused ? '#10b981' : '#e2e8f0',
    boxShadow: state.isFocused ? '0 0 0 2px rgba(16, 185, 129, 0.12)' : 'none',
    minHeight: '38px',
    fontSize: '12px',
    fontWeight: 600,
    backgroundColor: '#ffffff',
    '&:hover': { borderColor: '#cbd5e1' },
  }),
  option: (base: Record<string, unknown>, { isFocused, isSelected }: { isFocused: boolean; isSelected: boolean }) => ({
    ...base,
    backgroundColor: isSelected ? '#10b981' : isFocused ? '#f0fdf4' : 'transparent',
    color: isSelected ? '#ffffff' : '#334155',
    fontSize: '12px',
    fontWeight: isSelected ? 600 : 500,
    padding: '6px 12px',
    cursor: 'pointer',
  }),
  menu: (base: Record<string, unknown>) => ({
    ...base,
    borderRadius: '0.5rem',
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
    border: '1px solid #e2e8f0',
    overflow: 'hidden',
    zIndex: 50,
  }),
  menuPortal: (base: Record<string, unknown>) => ({ ...base, zIndex: 9999 }),
  indicatorSeparator: () => ({ display: 'none' }),
  dropdownIndicator: (base: Record<string, unknown>) => ({ ...base, color: '#94a3b8' }),
  clearIndicator: (base: Record<string, unknown>) => ({ ...base, color: '#94a3b8' }),
};

interface KpiDef {
  label: string;
  value: string;
  icon: typeof Truck;
  tone: string;
}

const SkeletonKpis = () => (
  <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-9">
    {Array.from({ length: 9 }).map((_, index) => (
      <div key={index} className="animate-pulse rounded-xl border border-slate-200 bg-white p-3">
        <div className="h-5 w-5 rounded-lg bg-slate-100" />
        <div className="mt-1.5 h-3 w-2/3 rounded bg-slate-100" />
        <div className="mt-0.5 h-5 w-1/2 rounded bg-slate-100" />
      </div>
    ))}
  </div>
);

const SkeletonCharts = () => (
  <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
    <div className="animate-pulse rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
      <div className="h-4 w-40 rounded bg-slate-100" />
      <div className="mt-3 h-64 rounded-xl bg-slate-50" />
    </div>
    <div className="animate-pulse rounded-xl border border-slate-200 bg-white p-4">
      <div className="h-4 w-32 rounded bg-slate-100" />
      <div className="mt-3 h-64 rounded-xl bg-slate-50" />
    </div>
    <div className="animate-pulse rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
      <div className="h-4 w-40 rounded bg-slate-100" />
      <div className="mt-3 h-60 rounded-xl bg-slate-50" />
    </div>
    <div className="animate-pulse rounded-xl border border-slate-200 bg-white p-4">
      <div className="h-4 w-32 rounded bg-slate-100" />
      <div className="mt-3 h-60 rounded-xl bg-slate-50" />
    </div>
    <div className="animate-pulse rounded-xl border border-slate-200 bg-white p-4">
      <div className="h-4 w-40 rounded bg-slate-100" />
      <div className="mt-3 h-40 rounded-xl bg-slate-50" />
    </div>
  </div>
);

const VehicleAnalyticsPage = ({ embedded = false }: VehicleAnalyticsPageProps) => {
  const {
    stats,
    weeklyData,
    expenseBreakdown,
    vehicleStats,
    vehicleStatusById,
    fromDate,
    toDate,
    setFromDate,
    setToDate,
    selectedVehicleId,
    setSelectedVehicleId,
    vehicleOptions,
    vehiclesLoading,
    clearFilters,
    loading,
    refreshing,
    error,
    refresh,
    lastRefreshed,
  } = useAnalyticsData();

  const selectedOption = useMemo(
    () => vehicleOptions.find((option) => option.value === selectedVehicleId) ?? null,
    [vehicleOptions, selectedVehicleId]
  );

  const showSkeleton = loading && !lastRefreshed;

  const utilization = useMemo(() => {
    const total = vehicleStats.length;
    if (total === 0) return 0;
    const active = vehicleStats.filter((row) => row.trips > 0 || row.distance > 0).length;
    return Math.round((active / total) * 100);
  }, [vehicleStats]);

  const kpis = useMemo<KpiDef[]>(() => {
    const costPerKm = stats.costPerKm > 0 ? `₹${stats.costPerKm.toFixed(2)}` : '—';
    return [
      { label: 'Total Trips', value: formatNumberCompact(stats.totalTrips), icon: Truck, tone: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
      { label: 'Total Distance', value: `${formatNumberCompact(stats.totalDistance)} km`, icon: TrendingUp, tone: 'bg-blue-50 text-blue-600 border-blue-100' },
      { label: 'Fuel Used', value: `${formatNumberCompact(stats.totalFuelLitres)} L`, icon: Fuel, tone: 'bg-amber-50 text-amber-600 border-amber-100' },
      { label: 'Avg Mileage', value: stats.averageMileage > 0 ? `${stats.averageMileage.toFixed(2)} km/l` : '—', icon: Gauge, tone: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
      { label: 'Vehicle Utilization', value: `${utilization}%`, icon: Activity, tone: 'bg-cyan-50 text-cyan-600 border-cyan-100' },
      { label: 'Fuel Cost', value: formatCurrencyCompact(stats.fuelCost), icon: Banknote, tone: 'bg-sky-50 text-sky-600 border-sky-100' },
      { label: 'Maintenance Cost', value: formatCurrencyCompact(stats.maintenanceCost), icon: Wrench, tone: 'bg-violet-50 text-violet-600 border-violet-100' },
      { label: 'Total Fleet Cost', value: formatCurrencyCompact(stats.totalExpense), icon: IndianRupee, tone: 'bg-rose-50 text-rose-600 border-rose-100' },
      { label: 'Cost / KM', value: costPerKm, icon: Activity, tone: 'bg-slate-100 text-slate-600 border-slate-200' },
    ];
  }, [stats, utilization]);

  const hasAnyData = stats.totalTrips > 0 || stats.totalDistance > 0 || stats.totalExpense > 0;

  const controlClass =
    'flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-xs transition-colors hover:bg-slate-50 disabled:opacity-50';

  const onReset = useCallback(() => clearFilters(), [clearFilters]);

  // Toast for refresh
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (refreshing === false && lastRefreshed) {
      setToast({ type: 'success', message: 'Fleet Analytics refreshed' });
    }
  }, [refreshing, lastRefreshed]);

  return (
    <ErrorBoundary>
      <div className={`w-full space-y-5 ${embedded ? '' : 'px-4 py-6 md:px-8 md:py-8'}`}>
        {toast && (
          <div
            className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold shadow-lg ${
              toast.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}
            role="status"
            aria-live="polite"
          >
            {toast.type === 'success' ? (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            )}
            {toast.message}
          </div>
        )}

        {/* Filter/Control Bar */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex flex-wrap items-end gap-4 mb-3">
            {/* Date Range */}
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <CalendarDays size={11} className="text-emerald-600" />
                Date Range
              </span>
              <div className="flex items-center gap-2">
                <div className="w-[180px]">
                  <DatePicker
                    value={fromDate}
                    onChange={setFromDate}
                    placeholder="From date"
                    className="[&_input]:!h-9 [&_input]:!text-xs"
                    hideClear
                  />
                </div>
                <span className="text-xs font-bold text-slate-300 shrink-0">→</span>
                <div className="w-[180px]">
                  <DatePicker
                    value={toDate}
                    onChange={setToDate}
                    placeholder="To date"
                    className="[&_input]:!h-9 [&_input]:!text-xs"
                    hideClear
                  />
                </div>
              </div>
            </div>

            {/* Vehicle Search */}
            <div className="flex flex-col gap-1 flex-1 min-w-[240px] max-w-md">
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <Truck size={11} className="text-emerald-600" />
                Vehicle
              </span>
              <div className="relative flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <Select
                    options={vehicleOptions}
                    value={selectedOption}
                    onChange={(selected) => setSelectedVehicleId(selected ? selected.value : null)}
                    isSearchable
                    isClearable
                    filterOption={containsFilter}
                    placeholder={vehiclesLoading ? 'Loading vehicles…' : 'All vehicles'}
                    isDisabled={vehiclesLoading}
                    styles={selectStyles}
                    menuPortalTarget={document.body}
                    className="w-full"
                    classNamePrefix="select"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {}}
                  className={controlClass}
                  disabled={vehiclesLoading}
                >
                  <Search size={13} className="text-slate-400" />
                  <span className="hidden sm:inline">Search</span>
                </button>
              </div>
            </div>

            {/* Actions: Search, Reset, Refresh */}
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={onReset} className={controlClass} title="Reset filters">
                <RotateCcw size={13} className="text-slate-400" />
                <span className="hidden sm:inline">Reset</span>
              </button>
              <button
                type="button"
                onClick={refresh}
                disabled={loading || refreshing}
                className={controlClass}
                title="Refresh analytics"
              >
                <RefreshCw size={13} className={refreshing ? 'animate-spin text-emerald-600' : 'text-slate-400'} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              {error}
            </span>
            <button type="button" onClick={refresh} className="font-bold underline">
              Retry
            </button>
          </div>
        )}

        {!hasAnyData && !loading && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">
            No analytics data available for the selected filters.
          </div>
        )}

        {showSkeleton ? (
          <div className="space-y-5">
            <SkeletonKpis />
            <SkeletonCharts />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Compact KPI Summary - Single Row Layout */}
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-9">
              {kpis.map((kpi) => (
                <div
                  key={kpi.label}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-xs transition-shadow hover:shadow-sm"
                >
                  <div className={`mb-1 flex h-5 w-5 items-center justify-center rounded-lg border ${kpi.tone}`}>
                    <kpi.icon size={11} />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">
                    {kpi.label}
                  </p>
                  <p className="mt-0 truncate text-base font-black tabular-nums text-slate-900 leading-tight">
                    {kpi.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Analytics Section */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Vehicle Performance */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs lg:col-span-2">
                <div className="mb-3">
                  <h3 className="text-base font-semibold text-slate-900">Vehicle Performance</h3>
                </div>
                <VehiclePerformanceChart stats={vehicleStats} />
              </div>

              {/* Cost Analysis */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <div className="mb-3">
                  <h3 className="text-base font-semibold text-slate-900">Cost Analysis</h3>
                </div>
                <ExpenseBreakdownDonut data={expenseBreakdown} height={280} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Weekly Activity */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs lg:col-span-2">
                <div className="mb-3">
                  <h3 className="text-base font-semibold text-slate-900">Weekly Activity</h3>
                </div>
                <WeeklyTrendChart data={weeklyData} />
              </div>

              {/* Fleet Insights */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <div className="mb-3">
                  <h3 className="text-base font-semibold text-slate-900">Fleet Insights</h3>
                </div>
                <AttentionSection stats={vehicleStats} />
              </div>
            </div>

            {/* Vehicle performance table */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="mb-3">
                <h3 className="text-base font-semibold text-slate-900">Vehicle Details</h3>
              </div>
              <VehiclePerformanceTable stats={vehicleStats} statusById={vehicleStatusById} />
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default memo(VehicleAnalyticsPage);