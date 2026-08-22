// src/modules/staff/hooks/useStaffPerformance.ts
// Read-only Driver / Supervisor performance hook. One controlled list GET per
// filter change (debounced search), cached in-memory for the session (60s TTL)
// with in-flight dedupe; the previous dataset stays on screen during refresh.

import { useCallback, useEffect, useRef, useState } from 'react';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import { handleApiError, isCanceledError } from '../../../api/errors';
import { getDriverPerformance, getSupervisorPerformance } from '../services/performanceService';
import { useDebounce } from './useDebounce';
import type {
  DriverPerformanceResponse,
  StaffPerformanceKind,
  SupervisorPerformanceResponse,
} from '../types/performance';

const dateString = (date: Date) => format(date, 'yyyy-MM-dd');

const EMPTY_DRIVER: DriverPerformanceResponse = {
  fromDate: '',
  toDate: '',
  kpis: {
    drivers: 0, trips: 0, distance: 0, avgDistancePerTrip: 0, fuelLitres: 0,
    fuelCost: 0, maintenanceCost: 0, tollCost: 0, otherCost: 0, totalCost: 0,
    costPerKm: 0, mileage: 0,
  },
  weekly: [],
  rows: [],
  detail: null,
};

const EMPTY_SUPERVISOR: SupervisorPerformanceResponse = {
  fromDate: '',
  toDate: '',
  kpis: {
    supervisors: 0, trips: 0, shops: 0, birds: 0, weight: 0,
    mortality: 0, mortalityRate: 0, weightLoss: 0,
  },
  weekly: [],
  rows: [],
  detail: null,
};

type PerformanceResponse = DriverPerformanceResponse | SupervisorPerformanceResponse;

const TTL_MS = 60_000;
const cacheStore = new Map<string, { value: PerformanceResponse; expiresAt: number }>();
const inflightStore = new Map<string, Promise<PerformanceResponse>>();

function cacheGet(key: string): PerformanceResponse | undefined {
  const entry = cacheStore.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cacheStore.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheInvalidate(prefix: string): void {
  for (const key of cacheStore.keys()) {
    if (key.startsWith(prefix)) cacheStore.delete(key);
  }
}

function sharedGet(key: string, loader: () => Promise<PerformanceResponse>): Promise<PerformanceResponse> {
  const existing = inflightStore.get(key);
  if (existing) return existing;
  const pending = loader()
    .then((value) => {
      cacheStore.set(key, { value, expiresAt: Date.now() + TTL_MS });
      return value;
    })
    .finally(() => {
      inflightStore.delete(key);
    });
  inflightStore.set(key, pending);
  return pending;
}

const emptyFor = (kind: StaffPerformanceKind): PerformanceResponse =>
  kind === 'drivers' ? EMPTY_DRIVER : EMPTY_SUPERVISOR;

export function useStaffPerformance(kind: StaffPerformanceKind) {
  const [fromDate, setFromDateState] = useState(() => dateString(startOfMonth(new Date())));
  const [toDate, setToDateState] = useState(() => dateString(endOfMonth(new Date())));
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const cacheKey = `staff-perf:${kind}:${fromDate}|${toDate}|${search}|${selectedId ?? ''}`;
  const initialCached = refreshNonce === 0 ? cacheGet(cacheKey) : undefined;

  const [data, setData] = useState<PerformanceResponse>(initialCached ?? emptyFor(kind));
  const [loading, setLoading] = useState(!initialCached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(
    initialCached ? new Date().toISOString() : null
  );

  const loadGen = useRef(0);
  const mounted = useRef(true);
  const hasData = useRef(Boolean(initialCached));
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const setFromDate = useCallback((value: string) => {
    if (!value) return;
    setFromDateState((current) => (current === value ? current : value));
    setToDateState((currentTo) => (value > currentTo ? value : currentTo));
  }, []);

  const setToDate = useCallback((value: string) => {
    if (!value) return;
    setToDateState((current) => (current === value ? current : value));
    setFromDateState((currentFrom) => (value < currentFrom ? value : currentFrom));
  }, []);

  const selectRow = useCallback((id: number | null) => {
    setSelectedId((current) => (current === id ? current : id));
  }, []);

  const clearFilters = useCallback(() => {
    setSelectedId(null);
    setSearchInput('');
    setFromDateState(dateString(startOfMonth(new Date())));
    setToDateState(dateString(endOfMonth(new Date())));
  }, []);

  const refresh = useCallback(() => {
    if (inFlight.current) return;
    cacheInvalidate('staff-perf:');
    setRefreshNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    const hit = refreshNonce === 0 ? cacheGet(cacheKey) : undefined;
    if (hit) {
      const snapshot = hit;
      void Promise.resolve().then(() => {
        if (!mounted.current) return;
        setData(snapshot);
        setError(null);
        setLoading(false);
        setRefreshing(false);
        hasData.current = true;
      });
      return;
    }

    const gen = ++loadGen.current;
    inFlight.current = true;
    setError(null);
    if (hasData.current) setRefreshing(true);
    else setLoading(true);

    void sharedGet(cacheKey, () =>
      kind === 'drivers'
        ? getDriverPerformance({
            fromDate,
            toDate,
            search: search || undefined,
            driverId: selectedId,
          })
        : getSupervisorPerformance({
            fromDate,
            toDate,
            search: search || undefined,
            supervisorId: selectedId,
          })
    )
      .then((payload) => {
        if (!mounted.current || gen !== loadGen.current) return;
        hasData.current = true;
        setData(payload);
        setLastRefreshed(new Date().toISOString());
        setError(null);
      })
      .catch((cause) => {
        if (!mounted.current || isCanceledError(cause) || gen !== loadGen.current) return;
        if (!hasData.current) setData(emptyFor(kind));
        setError(handleApiError(cause));
      })
      .finally(() => {
        if (!mounted.current || gen !== loadGen.current) return;
        inFlight.current = false;
        setLoading(false);
        setRefreshing(false);
      });
  }, [fromDate, toDate, search, selectedId, refreshNonce, kind, cacheKey]);

  return {
    data,
    fromDate,
    toDate,
    setFromDate,
    setToDate,
    searchInput,
    setSearchInput,
    selectedId,
    selectRow,
    clearFilters,
    loading,
    refreshing,
    error,
    refresh,
    lastRefreshed,
    refreshNonce,
  };
}