// src/modules/operations/dashboard/hooks/useDashboardData.ts

import { useCallback, useEffect, useState } from "react";
import {
  handleApiError,
  loadOperationsDashboard,
  type DashboardData,
} from "../services/dashboardService";

export type { DashboardData };

const initialData: DashboardData = {
  totalTrips: 0,
  totalSalesWeight: 0,
  totalSalesAmount: 0,
  totalCollections: 0,
  pendingCollections: 0,
  totalExpenses: 0,
  fuelExpense: 0,
  tripExpense: 0,
  todaysTrips: 0,
  weeklyTrips: 0,
  monthlyTrips: 0,
  trendData: [],
  topShops: [],
  collectionsByMode: [],
  expensesByCategory: [],
  mortalityData: [],
  recentTrips: [],
  activeVehicles: 0,
  activeDrivers: 0,
  activeHelpers: 0,
  totalShops: 0,
  totalFarms: 0,
  pendingCollectionsByShop: [],
  usedVehicles: 0,
  usedDrivers: 0,
  usedHelpers: 0,
  usedShops: 0,
  usedFarms: 0,
};

/**
 * Operations Dashboard hook — KPIs from GET /api/operations/dashboard only.
 * Date-range args are retained for call-site compatibility; the API is the source of truth.
 */
export function useDashboardData(
  _fromDate: Date | null,
  _toDate: Date | null,
  _comparisonPeriod: "7d" | "15d" | "30d"
) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [previousData] = useState<DashboardData>(initialData);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const dashboard = await loadOperationsDashboard();
      setData(dashboard);
    } catch (err) {
      setError(handleApiError(err));
      setData(initialData);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const refetch = useCallback(() => {
    void loadData();
  }, [loadData]);

  return {
    data,
    previousData,
    isLoading,
    error,
    refetch,
  };
}
