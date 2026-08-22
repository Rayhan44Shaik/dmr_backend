import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { endOfWeek, format, startOfWeek } from 'date-fns';
import { useFleetVehicles } from './useFleetVehicles';
import { handleApiError, isCanceledError } from '../../../api/errors';
import analyticsApi from '../services/analyticsApi';
import { fleetCacheGet, fleetCacheInvalidate, fleetSharedGet } from '../services/fleetSessionCache';
import type { FleetAnalyticsResponse } from '../types/analytics';

const dateString = (date: Date) => format(date, 'yyyy-MM-dd');

const getCurrentWeekRange = () => {
  const now = new Date();
  const start = startOfWeek(now, { weekStartsOn: 1 }); // Monday
  const end = endOfWeek(now, { weekStartsOn: 1 }); // Sunday
  return { start, end };
};

type AnalyticsView = Pick<
  FleetAnalyticsResponse,
  'kpis' | 'weekly' | 'costCenters' | 'topPerformers' | 'highestExpense' | 'vehicleStats'
>;

const EMPTY: AnalyticsView = {
  kpis: {
    totalTrips: 0,
    totalDistance: 0,
    averageMileage: 0,
    totalFuelLitres: 0,
    fuelCost: 0,
    maintenanceCost: 0,
    emiDue: 0,
    tollCost: 0,
    otherCost: 0,
    totalExpense: 0,
    costPerKm: 0,
  },
  weekly: [],
  costCenters: [],
  topPerformers: [],
  highestExpense: [],
  vehicleStats: [],
};

function filterKey(fromDate: string, toDate: string, vehicleId: number | null) {
  return `analytics:${fromDate}|${toDate}|${vehicleId ?? ''}`;
}

function toView(payload: FleetAnalyticsResponse): AnalyticsView {
  return {
    kpis: payload.kpis,
    weekly: payload.weekly,
    costCenters: payload.costCenters,
    topPerformers: payload.topPerformers,
    highestExpense: payload.highestExpense,
    vehicleStats: payload.vehicleStats,
  };
}

export function useAnalyticsData() {
  const { vehicles, loading: vehiclesLoading } = useFleetVehicles();
  const { start: weekStart, end: weekEnd } = getCurrentWeekRange();
  const [fromDate, setFromDateState] = useState(() => dateString(weekStart));
  const [toDate, setToDateState] = useState(() => dateString(weekEnd));
  const [selectedVehicleId, setSelectedVehicleIdState] = useState<number | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const initialKey = filterKey(fromDate, toDate, selectedVehicleId);
  const cached = fleetCacheGet<FleetAnalyticsResponse>(initialKey);

  const [data, setData] = useState<AnalyticsView>(cached ? toView(cached) : EMPTY);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(cached ? new Date().toISOString() : null);

  const loadGen = useRef(0);
  const mounted = useRef(true);
  const hasData = useRef(Boolean(cached));
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

  const setSelectedVehicleId = useCallback((value: number | null) => {
    setSelectedVehicleIdState((current) => (current === value ? current : value));
  }, []);

  const clearFilters = useCallback(() => {
    const { start, end } = getCurrentWeekRange();
    setSelectedVehicleIdState(null);
    setFromDateState(dateString(start));
    setToDateState(dateString(end));
  }, []);

  const refresh = useCallback(() => {
    if (inFlight.current) return;
    fleetCacheInvalidate('analytics:');
    setRefreshNonce((n) => n + 1);
    setRefreshTrigger((t) => t + 1);
  }, []);

  useEffect(() => {
    const key = filterKey(fromDate, toDate, selectedVehicleId);
    const hit = refreshNonce === 0 ? fleetCacheGet<FleetAnalyticsResponse>(key) : undefined;
    if (hit) {
      const snapshot = hit;
      void Promise.resolve().then(() => {
        if (!mounted.current) return;
        setData(toView(snapshot));
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

    void fleetSharedGet(key, () =>
      analyticsApi.get({ fromDate, toDate, vehicleId: selectedVehicleId })
    )
      .then((payload) => {
        if (!mounted.current || gen !== loadGen.current) return;
        hasData.current = true;
        setData(toView(payload));
        setLastRefreshed(new Date().toISOString());
        setError(null);
      })
      .catch((cause) => {
        if (!mounted.current || isCanceledError(cause) || gen !== loadGen.current) return;
        if (!hasData.current) setData(EMPTY);
        setError(handleApiError(cause));
      })
      .finally(() => {
        if (!mounted.current || gen !== loadGen.current) return;
        inFlight.current = false;
        setLoading(false);
        setRefreshing(false);
      });
  }, [fromDate, toDate, selectedVehicleId, refreshNonce]);

  const kpis = data.kpis;
  const stats = useMemo(
    () => ({
      totalTrips: kpis.totalTrips,
      totalDistance: kpis.totalDistance,
      totalFuelLitres: kpis.totalFuelLitres,
      fuelCost: kpis.fuelCost,
      maintenanceCost: kpis.maintenanceCost,
      emiDue: kpis.emiDue,
      totalExpense: kpis.totalExpense,
      averageMileage: kpis.averageMileage,
      costPerKm: kpis.costPerKm,
    }),
    [kpis]
  );

  const vehicleOptions = useMemo(
    () =>
      (vehicles || []).map((vehicle) => ({
        value: vehicle.id,
        label: vehicle.vehicleNumber || String(vehicle.vehicleNo),
      })),
    [vehicles]
  );

  const vehicleStatusById = useMemo(() => {
    const map = new Map<number, string>();
    (vehicles || []).forEach((vehicle) => {
      map.set(Number(vehicle.id), vehicle.status || 'Active');
    });
    return map;
  }, [vehicles]);

  return {
    stats,
    weeklyData: data.weekly,
    expenseBreakdown: data.costCenters,
    topPerformers: data.topPerformers,
    highestExpense: data.highestExpense,
    vehicleStats: data.vehicleStats,
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
    refreshTrigger,
  };
}