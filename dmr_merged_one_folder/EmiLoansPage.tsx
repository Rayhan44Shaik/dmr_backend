import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, RotateCcw, Search, X } from 'lucide-react';
import ErrorBoundary from '../components/common/ErrorBoundary';
import Pagination from '../components/common/Pagination';
import SearchInput from '../components/common/SearchInput';
import { useEmiData } from '../hooks/useEmiData';
import type { EmiOverview } from '../types';

interface EmiLoansPageProps {
  embedded?: boolean;
}

const PAGE_SIZE = 10;

const money = (value: number | null | undefined) =>
  value != null && Number.isFinite(value)
    ? `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
    : '—';

const formatDate = (value: string | null | undefined) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const emiDayLabel = (day: number | null) => (day ? `${day}${getOrdinalSuffix(day)}` : '—');

function getOrdinalSuffix(n: number): string {
  if (n >= 11 && n <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

const fieldClass =
  'h-9 min-w-[140px] rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15';

const controlClass =
  'flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-xs transition-colors hover:bg-slate-50 disabled:opacity-50';

type SortKey =
  | 'vehicleNo'
  | 'vehicleNumber'
  | 'purchaseAmount'
  | 'totalEMIs'
  | 'completedEMIs'
  | 'pendingEMIs'
  | 'emiDay'
  | 'status';

type SortDir = 'asc' | 'desc';

const SORT_GETTER: Record<SortKey, (row: EmiOverview) => number | string> = {
  vehicleNo: (row) => row.vehicleNo,
  vehicleNumber: (row) => row.vehicleNumber,
  purchaseAmount: (row) => row.purchaseAmount ?? 0,
  totalEMIs: (row) => row.totalEMIs ?? 0,
  completedEMIs: (row) => row.completedEMIs,
  pendingEMIs: (row) => row.pendingEMIs,
  emiDay: (row) => row.emiDay ?? 0,
  status: (row) => (row.status === 'PENDING' ? 0 : 1),
};

const COLUMNS: { key: SortKey; label: string; align: 'left' | 'right' | 'center' }[] = [
  { key: 'vehicleNo', label: 'VEHICLE NO', align: 'left' },
  { key: 'purchaseAmount', label: 'PURCHASE AMOUNT', align: 'right' },
  { key: 'totalEMIs', label: 'TOTAL EMI', align: 'center' },
  { key: 'completedEMIs', label: 'COMPLETED', align: 'center' },
  { key: 'pendingEMIs', label: 'PENDING', align: 'center' },
  { key: 'emiDay', label: 'EMI DATE', align: 'center' },
  { key: 'status', label: 'STATUS', align: 'center' },
];

const StatusBadge = ({ status }: { status: EmiOverview['status'] }) => {
  if (status === 'COMPLETED') {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
        COMPLETED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
      PENDING
    </span>
  );
};

const CompletedCell = ({ completed, total }: { completed: number; total: number | null }) => (
  <div className="flex items-center justify-center gap-1.5">
    <span className="text-xs font-semibold tabular-nums text-slate-700">{completed}</span>
    {total != null && total > 0 && (
      <span className="text-[10px] text-slate-400">/ {total}</span>
    )}
  </div>
);

const EmiLoansPage = ({ embedded = false }: EmiLoansPageProps) => {
  const {
    allRecords,
    kpis,
    todayKey,
    loading,
    refreshing,
    error,
    refresh,
    refreshStatus,
    clearRefreshStatus,
    lastRefreshed,
  } = useEmiData();

  // ---- Filters (applied instantly over the loaded overview — no re-fetch) --
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<EmiOverview['status'] | 'all'>('all');

  const reset = useCallback(() => {
    setSearch('');
    setStatusFilter('all');
  }, []);

  const hasActiveFilters = search.trim() !== '' || statusFilter !== 'all';

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allRecords.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (term) {
        const haystack = `${row.vehicleNo} ${row.vehicleNumber}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [allRecords, search, statusFilter]);

  // ---- Read-only table (sort + paginate over the same filtered set) -------
  const [sortKey, setSortKey] = useState<SortKey>('vehicleNo');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    const getter = SORT_GETTER[sortKey];
    const factor = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = getter(a);
      const bv = getter(b);
      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv) * factor;
      }
      return ((Number(av) || 0) - (Number(bv) || 0)) * factor;
    });
  }, [filtered, sortKey, sortDir]);

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
      setSortDir(key === 'vehicleNo' || key === 'vehicleNumber' || key === 'status' ? 'asc' : 'desc');
    }
  };

  // Reset pagination when filters change
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };
  const handleStatusChange = (value: EmiOverview['status'] | 'all') => {
    setStatusFilter(value);
    setPage(1);
  };

  // ---- Toast for refresh outcome ----------------------------------------
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (refreshStatus === 'success') {
      setToast({ type: 'success', message: 'EMI data refreshed' });
      clearRefreshStatus();
    } else if (refreshStatus === 'error') {
      setToast({ type: 'error', message: 'Unable to refresh EMI data. Please try again.' });
      clearRefreshStatus();
    }
  }, [refreshStatus, clearRefreshStatus]);

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

        {/* Compact KPI + Filter Control Bar */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          {/* KPI Summary Strip - Vehicle Level */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm mb-3">
            <div className="flex items-center gap-1.5 text-slate-600">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">TOTAL VEHICLES</span>
              <span className="font-bold text-slate-900 tabular-nums">{kpis.totalVehicles}</span>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-700 border-l border-slate-200 pl-3">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">COMPLETED EMI VEHICLES</span>
              <span className="font-bold tabular-nums">{kpis.completedEmiVehicles}</span>
            </div>
            <div className="flex items-center gap-1.5 text-amber-700 border-l border-slate-200 pl-3">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">PENDING EMI VEHICLES</span>
              <span className="font-bold tabular-nums">{kpis.pendingEmiVehicles}</span>
            </div>
          </div>

          {/* Search + Filter + Actions */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative flex-1 min-w-[240px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <SearchInput
                value={search}
                onChange={handleSearchChange}
                placeholder="Search vehicle no…"
                className="pl-9"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</span>
              <select
                value={statusFilter}
                onChange={(e) => handleStatusChange(e.target.value as EmiOverview['status'] | 'all')}
                className={fieldClass}
              >
                <option value="all">All statuses</option>
                <option value="PENDING">PENDING</option>
                <option value="COMPLETED">COMPLETED</option>
              </select>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              {hasActiveFilters && (
                <button type="button" onClick={reset} className={controlClass} title="Clear filters">
                  <RotateCcw size={13} className="text-slate-400" />
                  <span className="hidden sm:inline">Clear</span>
                </button>
              )}
              <button
                type="button"
                onClick={refresh}
                disabled={loading || refreshing}
                className={controlClass}
                title="Refresh from Master Vehicle"
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

        {/* EMI Schedule Table */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="px-4 py-3 border-b border-slate-200">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">EMI SCHEDULE</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/80 sticky top-0 z-10">
                <tr>
                  {COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      className={`px-3 py-2.5 ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'}`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider transition-colors ${
                          sortKey === column.key ? 'text-emerald-700' : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {column.label}
                        {sortKey === column.key && (
                          <span className="text-emerald-600">{sortDir === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading ? (
                  <>
                    <tr>
                      <td colSpan={COLUMNS.length} className="px-3 py-4 h-10">
                        <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
                      </td>
                    </tr>
                    {Array.from({ length: 5 }).map((_, index) => (
                      <tr key={index}>
                        <td colSpan={COLUMNS.length} className="px-3 py-3 h-11">
                          <div className="h-11 animate-pulse rounded-lg bg-slate-100" />
                        </td>
                      </tr>
                    ))}
                  </>
                ) : allRecords.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length} className="px-3 py-14 text-center">
                      <div className="flex flex-col items-center">
                        <svg className="mx-auto mb-3 text-slate-300" width={42} height={42} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        <p className="font-bold text-slate-700">No EMI records found</p>
                        <p className="mt-1 text-sm text-slate-400">
                          Add purchase amount, EMI count and EMI date in Master Vehicle to display the EMI schedule.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length} className="px-3 py-14 text-center">
                      <div className="flex flex-col items-center">
                        <svg className="mx-auto mb-3 text-slate-300" width={42} height={42} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 18a1 1 0 001-1v-3.586a1 1 0 01.293-.707l6.414-6.414a1 1 0 00.293-.707V5a1 1 0 00-1-1H9a1 1 0 00-1 1v12.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V19a1 1 0 001 1z" />
                        </svg>
                        <p className="font-bold text-slate-700">No vehicles match the selected filters</p>
                        <button
                          type="button"
                          onClick={reset}
                          className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                        >
                          Clear filters
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paged.map((record) => (
                    <tr key={record.vehicleId} className="transition-colors hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-900">{record.vehicleNo}</span>
                          <span className="text-[10px] text-slate-400">{record.vehicleNumber}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs tabular-nums text-slate-600">
                        {money(record.purchaseAmount)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center text-xs tabular-nums text-slate-600">
                        {record.totalEMIs ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center">
                        <CompletedCell completed={record.completedEMIs} total={record.totalEMIs} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-semibold tabular-nums text-slate-700">
                        {record.pendingEMIs}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center text-xs tabular-nums text-slate-600">
                        {formatDate(record.emiStartDate)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center">
                        <StatusBadge status={record.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && allRecords.length > 0 && (
            <div className="px-4 py-3 border-t border-slate-200">
              <Pagination
                currentPage={safePage}
                totalPages={totalPages}
                onPageChange={setPage}
                itemsPerPage={PAGE_SIZE}
                totalItems={sorted.length}
              />
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default memo(EmiLoansPage);