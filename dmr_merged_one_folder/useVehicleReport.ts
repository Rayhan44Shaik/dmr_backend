// src/modules/reports/vehicle/hooks/useVehicleReport.ts
// -----------------------------------------------------------------------------
// Vehicle Report state hook: source loading (isolated per-source status),
// draft + applied filters, memoized derivation, refresh and reset.
// -----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadVehicleReportSources } from "../services/vehicleReportService";
import { deriveVehicleReport } from "../utils/vehicleReportUtils";
import { defaultDateWindow } from "../utils/vehicleReportDates";
import type {
  VehicleReportFilters,
  VehicleReportResult,
  VehicleReportSourceData,
} from "../types/vehicleReportTypes";

function defaultFilters(): VehicleReportFilters {
  const window = defaultDateWindow();
  return {
    vehicleId: "all",
    preset: "thisMonth",
    fromDate: window.from,
    toDate: window.to,
  };
}

const EMPTY_SOURCES: VehicleReportSourceData = {
  vehicles: { data: [], status: "loading", error: null },
  trips: { data: [], status: "loading", error: null },
  fuel: { data: [], status: "loading", error: null },
  maintenance: { data: [], status: "loading", error: null },
};

export interface VehicleReportState {
  sources: VehicleReportSourceData;
  /** Filters shown in the toolbar (draft — not applied yet). */
  draftFilters: VehicleReportFilters;
  /** Filters the visible report was generated with. */
  appliedFilters: VehicleReportFilters;
  report: VehicleReportResult | null;
  loading: boolean;
  applyFilters: (filters: VehicleReportFilters) => void;
  resetFilters: () => void;
  refresh: () => void;
}

export function useVehicleReport(): VehicleReportState {
  const [sources, setSources] = useState<VehicleReportSourceData>(EMPTY_SOURCES);
  const [draftFilters, setDraftFilters] = useState<VehicleReportFilters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<VehicleReportFilters>(defaultFilters);
  const [loadToken, setLoadToken] = useState(0);

  // Load all sources once per mount / explicit refresh. A stale settle cannot
  // overwrite a newer load thanks to the effect cleanup.
  useEffect(() => {
    let cancelled = false;
    const apply = (next: VehicleReportSourceData) => {
      if (!cancelled) setSources(next);
    };
    loadVehicleReportSources(apply).catch(() => {
      /* per-source errors are already captured in state */
    });
    return () => {
      cancelled = true;
    };
  }, [loadToken]);

  const refresh = useCallback(() => {
    setSources(EMPTY_SOURCES);
    setLoadToken((token) => token + 1);
  }, []);

  // Centralized derivation — KPI cards and table share this one result.
  const report = useMemo<VehicleReportResult | null>(() => {
    const coreReady = sources.vehicles.status === "success" && sources.trips.status === "success";
    if (!coreReady) return null;
    return deriveVehicleReport({
      vehicles: sources.vehicles.data,
      trips: sources.trips.data,
      fuel: sources.fuel.data,
      maintenance: sources.maintenance.data,
      filters: appliedFilters,
      fuelSourceAvailable: sources.fuel.status === "success",
      maintenanceSourceAvailable: sources.maintenance.status === "success",
    });
  }, [sources, appliedFilters]);

  const applyFilters = useCallback((filters: VehicleReportFilters) => {
    setAppliedFilters(filters);
    setDraftFilters(filters);
  }, []);

  const resetFilters = useCallback(() => {
    const defaults = defaultFilters();
    setDraftFilters(defaults);
    setAppliedFilters(defaults);
  }, []);

  const loading = useMemo(
    () => Object.values(sources).some((s) => s.status === "loading"),
    [sources]
  );

  return {
    sources,
    draftFilters,
    appliedFilters,
    report,
    loading,
    applyFilters,
    resetFilters,
    refresh,
  };
}