import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVehicles } from '../../masters/vehicles/hooks/useVehicles';
import { apiGet } from '../../../api';
import { handleApiError } from '../../../api/errors';
import { maintenanceApi, mapMaintenanceToEvent } from '../services/maintenanceApi';
import { fleetCacheInvalidate } from '../services/fleetSessionCache';
import type { MaintenanceEvent } from '../types';

interface UpcomingService {
  vehicle: any;
  lastMaint: MaintenanceEvent | null;
  nextKM: number;
  dueKM: number;
  isDue: boolean;
  liveCurrentKM: number;
}

const rowsOf = (payload: any): any[] => Array.isArray(payload) ? payload : (payload?.data ?? []);

export function useMaintenanceData(scope: 'entry' | 'history' | 'all' = 'all') {
  const { vehicles } = useVehicles();
  const [refreshKey, setRefreshKey] = useState(0);
  const [maintenance, setMaintenance] = useState<MaintenanceEvent[]>([]);
  const [approvedMaintenance, setApprovedMaintenance] = useState<MaintenanceEvent[]>([]);
  const [deletedRecords, setDeletedRecords] = useState<MaintenanceEvent[]>([]);
  const [historyRecords, setHistoryRecords] = useState<MaintenanceEvent[]>([]);
  const [latestMeters, setLatestMeters] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(scope !== 'history');
  const [historyLoading, setHistoryLoading] = useState(scope !== 'entry');
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const hasLoaded = useRef(false);
  const historyHasLoaded = useRef(false);

  const [selectedVehicle, setSelectedVehicle] = useState('all');
  const [selectedDriver, setSelectedDriver] = useState('all');
  const [selectedMaintenanceType, setSelectedMaintenanceType] = useState('all');
  const [selectedServiceType, setSelectedServiceType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Entry workspace datasets: pending/current, latest approved per vehicle and
  // the deleted audit list. These are intentionally independent of History filters.
  useEffect(() => {
    if (scope === 'history') {
      return;
    }
    let cancelled = false;
    (async () => {
      if (!hasLoaded.current) setLoading(true);
      setError(null);
      try {
        const [activeData, approvedData, allData] = await Promise.all([
          maintenanceApi.list({ limit: 500 }),
          maintenanceApi.list({ status: 'Approved', latestApproved: true, limit: 500 }),
          maintenanceApi.list({ includeDeleted: true, limit: 500 }),
        ]);
        if (cancelled) return;
        const active = rowsOf(activeData).map(mapMaintenanceToEvent);
        const approved = rowsOf(approvedData).map(mapMaintenanceToEvent);
        const all = rowsOf(allData).map(mapMaintenanceToEvent);
        hasLoaded.current = true;
        setMaintenance(active);
        setApprovedMaintenance(approved);
        setDeletedRecords(all.filter((record) => Boolean(record.deletedAt)));
      } catch (cause) {
        if (!cancelled) {
          if (!hasLoaded.current) {
            setMaintenance([]);
            setApprovedMaintenance([]);
            setDeletedRecords([]);
          }
          setError(handleApiError(cause));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey, scope]);

  useEffect(() => {
    if (scope !== 'history') return;
    let cancelled = false;
    (async () => {
      try {
        const approvedData = await maintenanceApi.list({ status: 'Approved', latestApproved: true, limit: 500 });
        if (!cancelled) setApprovedMaintenance(rowsOf(approvedData).map(mapMaintenanceToEvent));
      } catch {
        if (!cancelled) setApprovedMaintenance([]);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey, scope]);

  // Upcoming Service meters are History-only. Entry must not load this dataset.
  useEffect(() => {
    if (scope !== 'history') return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      apiGet<Array<{ vehicleId: number; meter: number }>>('/fleet/vehicles/meter-summary')
        .then((response) => {
          if (cancelled) return;
          const map: Record<string, number> = {};
          (response.data || []).forEach((event) => {
            map[String(event.vehicleId)] = Number(event.meter) || 0;
          });
          setLatestMeters(map);
        })
        .catch(() => { if (!cancelled) setLatestMeters({}); });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [refreshKey, scope]);

  // History uses the established query contract. Type/service filtering remains
  // client-side because those fields are not part of the backend query contract.
  useEffect(() => {
    if (scope === 'entry') {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (!historyHasLoaded.current) setHistoryLoading(true);
      setHistoryError(null);
      try {
        const payload = await maintenanceApi.list({
          vehicleId: selectedVehicle === 'all' ? undefined : selectedVehicle,
          driverId: selectedDriver === 'all' ? undefined : selectedDriver,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          status: selectedStatus === 'all' || selectedStatus === 'Deleted' ? undefined : selectedStatus,
          search: searchQuery.trim() || undefined,
          includeDeleted: selectedStatus === 'Deleted' || selectedStatus === 'all',
          page: 1,
          limit: 500,
        });
        if (!cancelled) {
          historyHasLoaded.current = true;
          setHistoryRecords(rowsOf(payload).map(mapMaintenanceToEvent));
        }
      } catch (cause) {
        if (!cancelled) {
          if (!historyHasLoaded.current) setHistoryRecords([]);
          setHistoryError(handleApiError(cause));
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }, searchQuery ? 250 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [fromDate, refreshKey, scope, searchQuery, selectedDriver, selectedStatus, selectedVehicle, toDate]);

  const approvedHistory = useMemo(
    () => {
      const source = approvedMaintenance.length ? approvedMaintenance : maintenance;
      return source.filter((record) => record.paymentStatus === 'approved' && !record.deletedAt);
    },
    [approvedMaintenance, maintenance]
  );

  const maintenanceTypes = useMemo(() => {
    const values = new Set<string>();
    historyRecords.forEach((record) => String(record.maintenanceType || '').split(',').forEach((type) => {
      if (type.trim()) values.add(type.trim());
    }));
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [historyRecords]);

  const serviceTypes = useMemo(() => {
    const values = new Set(historyRecords.map((record) => String(record.serviceType || '').trim()).filter(Boolean));
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [historyRecords]);

  const drivers = useMemo(() => {
    const map = new Map<string, string>();
    historyRecords.forEach((record) => {
      if (record.driverId && record.driverName) map.set(String(record.driverId), record.driverName);
    });
    return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [historyRecords]);

  const vehicleNumberById = useMemo(() => {
    const map = new Map<string, string>();
    vehicles.forEach((vehicle: any) => map.set(String(vehicle.id), String(vehicle.vehicleNumber || '')));
    return map;
  }, [vehicles]);

  const filtered = useMemo(() => historyRecords.filter((record) => {
    if (selectedStatus === 'Deleted' && !record.deletedAt) return false;
    if (selectedStatus === 'Pending' && (record.paymentStatus !== 'pending' || record.deletedAt)) return false;
    if (selectedStatus === 'Approved' && (record.paymentStatus !== 'approved' || record.deletedAt)) return false;
    if (selectedStatus === 'all' && record.deletedAt) return false;
    if (selectedMaintenanceType !== 'all' && !String(record.maintenanceType || '').split(',').map((value) => value.trim()).includes(selectedMaintenanceType)) return false;
    if (selectedServiceType !== 'all' && String(record.serviceType || '') !== selectedServiceType) return false;
    if (searchQuery.trim()) {
      const needle = searchQuery.trim().toLowerCase();
      const vehicleNo = vehicleNumberById.get(String(record.vehicleId)) || record.vehicleNo || '';
      const values = [record.billNumber, vehicleNo, record.driverName, record.maintenanceType, record.serviceType, record.garage, record.mechanic, record.remarks];
      if (!values.some((value) => String(value || '').toLowerCase().includes(needle))) return false;
    }
    return true;
  }), [historyRecords, searchQuery, selectedMaintenanceType, selectedServiceType, selectedStatus, vehicleNumberById]);

  const historyStats = useMemo(() => ({
    total: filtered.length,
    totalCost: filtered.reduce((sum, record) => sum + Number(record.totalCost || 0), 0),
    approved: filtered.filter((record) => record.paymentStatus === 'approved').length,
    pending: filtered.filter((record) => record.paymentStatus !== 'approved').length,
    vehiclesServiced: new Set(filtered.map((record) => String(record.vehicleId))).size,
    documents: filtered.reduce((sum, record) => sum + (record.documents?.length || 0), 0),
  }), [filtered]);

  const lastApprovedByVehicle = useMemo(() => {
    const map = new Map<string, MaintenanceEvent>();
    approvedHistory.forEach((record) => {
      const id = String(record.vehicleId);
      const previous = map.get(id);
      if (!previous || new Date(record.date).getTime() > new Date(previous.date).getTime()) {
        map.set(id, record);
      }
    });
    return map;
  }, [approvedHistory]);

  const upcomingServices = useMemo((): UpcomingService[] => {
    const list = vehicles.map((vehicle: any) => {
      const lastMaint = lastApprovedByVehicle.get(String(vehicle.id)) || null;
      // Authoritative latest chronological meter from the backend ledger. The
      // vehicle master `currentKM` is a soft fallback when no meter event exists.
      const backendMeter = Number(latestMeters[String(vehicle.id)] || 0);
      const liveCurrentKM = Math.max(Number(vehicle.currentKM) || 0, backendMeter, lastMaint?.currentKM || 0);
      const nextKM = lastMaint?.nextServiceKM && lastMaint.nextServiceKM > 0 ? lastMaint.nextServiceKM : liveCurrentKM + 5000;
      const dueKM = nextKM - liveCurrentKM;
      return { vehicle, lastMaint, nextKM, dueKM, isDue: dueKM <= 1000, liveCurrentKM };
    }).sort((a, b) => a.dueKM - b.dueKM);
    return selectedVehicle === 'all' ? list : list.filter((item) => String(item.vehicle.id) === selectedVehicle);
  }, [lastApprovedByVehicle, latestMeters, selectedVehicle, vehicles]);

  const hasActiveFilters = selectedVehicle !== 'all' || selectedDriver !== 'all' ||
    selectedMaintenanceType !== 'all' || selectedServiceType !== 'all' || selectedStatus !== 'all' ||
    Boolean(fromDate || toDate || searchQuery);

  const resetFilters = useCallback(() => {
    setSelectedVehicle('all'); setSelectedDriver('all'); setSelectedMaintenanceType('all');
    setSelectedServiceType('all'); setSelectedStatus('all'); setFromDate(''); setToDate(''); setSearchQuery('');
  }, []);

  const refresh = useCallback(() => {
    fleetCacheInvalidate('analytics:');
    setRefreshKey((value) => value + 1);
  }, []);

  return {
    vehicles, maintenance, approvedMaintenance, approvedHistory, deletedRecords,
    filtered, maintenanceTypes, serviceTypes, drivers, historyStats, upcomingServices,
    selectedVehicle, setSelectedVehicle, selectedDriver, setSelectedDriver,
    selectedMaintenanceType, setSelectedMaintenanceType, selectedServiceType, setSelectedServiceType,
    selectedStatus, setSelectedStatus, fromDate, setFromDate, toDate, setToDate,
    searchQuery, setSearchQuery, hasActiveFilters, resetFilters,
    loading, historyLoading, error, historyError, refresh,
  };
}
