// src/modules/dashboard/hooks/useExecutiveDashboard.ts

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearDemoData,
  loadDashboardData,
  seedDemoData,
  type DashboardData,
} from "../services/dashboardService";
import { deriveDashboard, type DerivedDashboard } from "../utils/dashboardDerive";

interface ExecutiveDashboardState {
  data: DashboardData | null;
  derived: DerivedDashboard | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  loadDemo: () => Promise<void>;
  clearDemo: () => Promise<void>;
  demoBusy: boolean;
}

export function useExecutiveDashboard(): ExecutiveDashboardState {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);

  // Initial load — runs once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await loadDashboardData();
        if (!cancelled) setData(rows);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load dashboard data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Manual refresh (event handlers only).
  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await loadDashboardData();
      setData(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  const derived = useMemo(() => (data ? deriveDashboard(data) : null), [data]);

  const loadDemo = useCallback(async () => {
    setDemoBusy(true);
    try {
      seedDemoData();
      await refetch();
    } finally {
      setDemoBusy(false);
    }
  }, [refetch]);

  const clearDemo = useCallback(async () => {
    setDemoBusy(true);
    try {
      clearDemoData();
      await refetch();
    } finally {
      setDemoBusy(false);
    }
  }, [refetch]);

  return {
    data,
    derived,
    loading,
    error,
    refetch,
    loadDemo,
    clearDemo,
    demoBusy,
  };
}
