/** DEFERRED / FUTURE WORK — not part of current Fleet Operations production scope. */
import { useEffect, useMemo, useState } from 'react';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { useVehicles } from '../../masters/vehicles/hooks/useVehicles';
import type { Vehicle } from '../../masters/vehicles/types/vehicle';
import useTrips from '../../operations/vehicle-trips/hooks/useTrips';
import type { Trip } from '../../operations/vehicle-trips/types/trip';
import { useFuelExpenses } from '../../operations/fuel-expenses/hooks/useFuelExpenses';
import type { FuelExpense } from '../../operations/fuel-expenses/types/fuelExpense';
import { getFastags, getFastagTransactions } from '../services/storage';
import { maintenanceApi, mapMaintenanceToEvent } from '../services/maintenanceApi';
import emiApi from '../services/emiApi';
import type { MaintenanceEvent } from '../types';

interface FastagTransaction {
  fastagId: string;
  date: string;
  amount: number;
}

interface FastagRecord {
  id: string | number;
  vehicleId: string | number;
}

interface EMIRecord {
  vehicleId: string | number;
  emiAmount: number;
  status: string;
}

interface ExpenseRow {
  vehicle: Vehicle;
  fuelCost: number;
  tollCost: number;
  maintCost: number;
  emiCost: number;
  otherCost: number;
  totalCost: number;
}

const dummyNotify = () => {};

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Trip cash spent outside diesel (fuel_expenses) and tolls (own cost centre). */
const tripOtherExpense = (trips: Trip[]): number =>
  trips.reduce(
    (sum: number, t: Trip) =>
      sum +
      toNumber(t.meals) +
      toNumber(t.mealsTiffin) +
      toNumber(t.loading) +
      toNumber(t.vehicleMaintenance) +
      toNumber(t.othersRC) +
      toNumber(t.others1Amt) +
      toNumber(t.others2Amt) +
      toNumber(t.others3Amt) +
      toNumber(t.others4Amt) +
      toNumber(t.others5Amt),
    0
  );

const tripTollExpense = (trips: Trip[]): number =>
  trips.reduce(
    (sum: number, t: Trip) =>
      sum +
      toNumber(t.pickupTolls) +
      toNumber(t.deliveryTolls) +
      toNumber(t.destinationTolls),
    0
  );

export function useExpenseReportData() {
  const { vehicles } = useVehicles();
  const tripsData = useTrips(dummyNotify);
  const allTrips = useMemo(() => tripsData?.allTrips ?? [], [tripsData]);
  const { filteredData: fuelExpenses } = useFuelExpenses(dummyNotify);
  const [maintenance, setMaintenance] = useState<MaintenanceEvent[]>([]);
  const [emiRecords, setEmiRecords] = useState<EMIRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [res, schedules] = await Promise.all([
          maintenanceApi.list({ status: 'Approved' }),
          emiApi.list(),
        ]);
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        if (!cancelled) {
          setMaintenance(Array.isArray(list) ? list.map(mapMaintenanceToEvent) : []);
          setEmiRecords(schedules.map((schedule) => ({
            vehicleId: schedule.vehicleId,
            emiAmount: schedule.emiAmount,
            status: schedule.status,
          })));
        }
      } catch {
        if (!cancelled) setMaintenance([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fastags = useMemo(() => (getFastags() || []) as FastagRecord[], []);
  const fastagTransactions = useMemo(
    () => (getFastagTransactions() || []) as FastagTransaction[],
    []
  );
  const fastagVehicleId = useMemo(() => {
    const map = new Map<string | number, string>();
    fastags.forEach((tag: FastagRecord) => {
      if (tag.id != null) map.set(tag.id, String(tag.vehicleId));
    });
    return map;
  }, [fastags]);

  const today = new Date();
  const [fromDate, setFromDate] = useState(format(startOfMonth(today), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(endOfMonth(today), 'yyyy-MM-dd'));
  const [selectedVehicle, setSelectedVehicle] = useState('all');

  const reportData = useMemo((): ExpenseRow[] => {
    const from = new Date(fromDate);
    const to = new Date(toDate);

    const inRange = (d: Date): boolean => d >= from && d <= to;

    // Completed trips only — draft/pending/deleted never feed reports.
    const filteredTrips = allTrips.filter((t: Trip) => {
      if (t.status !== 'Completed') return false;
      return inRange(new Date(t.tripDate));
    });

    const periodFuel = (fuelExpenses || []).filter((f: FuelExpense) =>
      inRange(new Date(f.date))
    );
    const periodMaint = maintenance.filter((m: MaintenanceEvent) => inRange(new Date(m.date)));
    const periodToll = fastagTransactions.filter((tx: FastagTransaction) =>
      inRange(new Date(tx.date))
    );

    return vehicles.map((v: Vehicle) => {
      const vNumber = String(v.vehicleNumber || '');
      const vTrips = filteredTrips.filter((t: Trip) => String(t.vehicleNo || '') === vNumber);

      const fuelCost = periodFuel
        .filter((f: FuelExpense) => String(f.vehicleNo || '') === vNumber)
        .reduce((sum: number, f: FuelExpense) => sum + toNumber(f.amount), 0);
      const tollCost =
        periodToll
          .filter(
            (tx: FastagTransaction) => String(fastagVehicleId.get(tx.fastagId) ?? '') === String(v.id)
          )
          .reduce((sum: number, tx: FastagTransaction) => sum + toNumber(tx.amount), 0) +
        tripTollExpense(vTrips);
      const maintCost = periodMaint
        .filter((m: MaintenanceEvent) => String(m.vehicleId) === String(v.id))
        .reduce((sum: number, m: MaintenanceEvent) => sum + toNumber(m.totalCost), 0);
      const emiCost = emiRecords
        .filter((e: EMIRecord) => e.vehicleId === v.id && e.status !== 'paid')
        .reduce((sum: number, e: EMIRecord) => sum + toNumber(e.emiAmount), 0);
      const otherCost = tripOtherExpense(vTrips);
      const totalCost = fuelCost + tollCost + maintCost + emiCost + otherCost;

      return {
        vehicle: v,
        fuelCost,
        tollCost,
        maintCost,
        emiCost,
        otherCost,
        totalCost,
      };
    });
  }, [vehicles, allTrips, fuelExpenses, maintenance, fastagTransactions, fastagVehicleId, emiRecords, fromDate, toDate]);

  const filtered = useMemo((): ExpenseRow[] => {
    return selectedVehicle === 'all'
      ? reportData
      : reportData.filter((r: ExpenseRow) => String(r.vehicle.id) === selectedVehicle);
  }, [reportData, selectedVehicle]);

  const totals = useMemo(() => {
    const initial = {
      fuelCost: 0,
      tollCost: 0,
      maintCost: 0,
      emiCost: 0,
      otherCost: 0,
      totalCost: 0,
    };
    return filtered.reduce<typeof initial>((acc, r: ExpenseRow) => {
      acc.fuelCost += r.fuelCost;
      acc.tollCost += r.tollCost;
      acc.maintCost += r.maintCost;
      acc.emiCost += r.emiCost;
      acc.otherCost += r.otherCost;
      acc.totalCost += r.totalCost;
      return acc;
    }, initial);
  }, [filtered]);

  const summary = useMemo(() => {
    const placeholder = { vehicleNumber: 'N/A' } as unknown as Vehicle;
    const highest = filtered.reduce((max: ExpenseRow, r: ExpenseRow) =>
      r.totalCost > max.totalCost ? r : max,
      filtered[0] || { totalCost: 0, vehicle: placeholder }
    );
    const lowest = filtered.reduce((min: ExpenseRow, r: ExpenseRow) =>
      r.totalCost < min.totalCost ? r : min,
      filtered[0] || { totalCost: 0, vehicle: placeholder }
    );
    const avg = filtered.length > 0 ? totals.totalCost / filtered.length : 0;
    return { highest, lowest, avg };
  }, [filtered, totals]);

  return {
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    selectedVehicle,
    setSelectedVehicle,
    filtered,
    totals,
    summary,
  };
}
