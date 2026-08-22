import { useCallback, useEffect, useRef, useState } from 'react';
import { isCanceledError } from '../../../api/errors';
import { buildEmiOverview, computeKpis } from '../services/emiService';
import { fleetCacheInvalidate } from '../services/fleetSessionCache';
import type { EmiOverview } from '../types';

interface KpiSummary {
  totalVehicles: number;
  completedEmiVehicles: number;
  pendingEmiVehicles: number;
}

/**
 * EMI Management data hook — READ ONLY.
 *
 * Computes EMI overview from Master Vehicle data (vehicles API).
 * The page never creates, edits or pays an EMI — all calculations are
 * derived from purchase amount, total EMIs, EMI day, and current date.
 */
export function useEmiData() {
  const [allRecords, setAllRecords] = useState<EmiOverview[]>([]);
  const [kpis, setKpis] = useState<KpiSummary>({
    totalVehicles: 0,
    completedEmiVehicles: 0,
    pendingEmiVehicles: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshStatus, setRefreshStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const loadGen = useRef(0);
  const listInFlight = useRef(false);
  const hasLoaded = useRef(false);

  const refresh = useCallback(() => {
    if (listInFlight.current) return;
    fleetCacheInvalidate('vehicles:');
    setRefreshNonce((value) => value + 1);
  }, []);

  const clearRefreshStatus = useCallback(() => setRefreshStatus('idle'), []);

  // ---- Overview (computed from Master Vehicle data) -----------------------
  useEffect(() => {
    const controller = new AbortController();
    const gen = ++loadGen.current;
    listInFlight.current = true;
    setError(null);
    if (hasLoaded.current) setRefreshing(true);
    else setLoading(true);

    void buildEmiOverview()
      .then((rows) => {
        if (gen !== loadGen.current) return;
        const wasRefresh = hasLoaded.current;
        hasLoaded.current = true;
        setAllRecords(rows);
        setKpis(computeKpis(rows));
        setLastRefreshed(new Date().toISOString());
        if (wasRefresh) setRefreshStatus('success');
      })
      .catch((cause) => {
        if (isCanceledError(cause) || gen !== loadGen.current) return;
        if (hasLoaded.current) {
          setRefreshStatus('error');
        } else {
          setAllRecords([]);
          setKpis({ totalVehicles: 0, completedEmiVehicles: 0, pendingEmiVehicles: 0 });
          setError('Unable to load EMI data.');
        }
      })
      .finally(() => {
        if (gen === loadGen.current) {
          listInFlight.current = false;
          setLoading(false);
          setRefreshing(false);
        }
      });

    return () => controller.abort();
  }, [refreshNonce]);

  // Local date key (yyyy-MM-dd) used for reference.
  const todayKey = new Date().toISOString().split('T')[0];

  return {
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
  };
}