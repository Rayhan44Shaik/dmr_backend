// src/modules/reports/vehicle/services/vehicleReportService.ts
// -----------------------------------------------------------------------------
// Vehicle Report data-loading layer. Exactly one request per source — no N+1:
//   vehicles      GET /api/masters/vehicles        (PostgreSQL)
//   trips         GET /api/trips                   (PostgreSQL)
//   fuel          operations fuel-expense store    (local store; no backend endpoint yet)
//   maintenance   fleet maintenance store          (local store; no backend endpoint yet)
// Each source reports its own status so a backend failure is surfaced as
// "N/A / unable to load", never as zero.
// -----------------------------------------------------------------------------

import { loadVehicles } from "../../../masters/vehicles/services/vehicleService";
import { listTrips } from "../../../operations/vehicle-trips/services/tripHeaderApiService";
import { fuelExpenseService } from "../../../operations/fuel-expenses/services/fuelExpenseService";
import { getMaintenance } from "../../../fleet-operations/services/storage";
import type { Vehicle } from "../../../masters/vehicles/types/vehicle";
import type { Trip } from "../../../operations/vehicle-trips/types/trip";
import type { FuelExpense } from "../../../operations/fuel-expenses/types/fuelExpense";
import type { MaintenanceEvent } from "../../../fleet-operations/types";
import type { SourceState, VehicleReportSourceData } from "../types/vehicleReportTypes";

function success<T>(data: T[]): SourceState<T> {
  return { data, status: "success", error: null };
}

function loading<T>(): SourceState<T> {
  return { data: [], status: "loading", error: null };
}

function failure<T>(message: string): SourceState<T> {
  return { data: [], status: "error", error: message };
}

async function loadSource<T>(
  label: string,
  fn: () => Promise<T[]>,
  onState: (state: SourceState<T>) => void
): Promise<void> {
  onState(loading());
  try {
    const data = await fn();
    onState(success(data));
  } catch (error) {
    onState(failure(`${label} — ${error instanceof Error ? error.message : "unknown error"}`));
  }
}

/**
 * Load every report source in parallel with isolated state tracking.
 * `onState(partial)` is invoked as each source settles; the final
 * accumulated state is also returned for convenience.
 */
export async function loadVehicleReportSources(
  onState: (next: VehicleReportSourceData) => void
): Promise<VehicleReportSourceData> {
  const state: VehicleReportSourceData = {
    vehicles: loading<Vehicle>(),
    trips: loading<Trip>(),
    fuel: loading<FuelExpense>(),
    maintenance: loading<MaintenanceEvent>(),
  };
  onState(state);

  const setSource = <K extends keyof VehicleReportSourceData>(
    key: K,
    value: VehicleReportSourceData[K]
  ) => {
    state[key] = value;
    onState({ ...state });
  };

  await Promise.all([
    loadSource<Vehicle>("Vehicles", () => loadVehicles(), (s) => setSource("vehicles", s)),
    loadSource<Trip>("Trips", () => listTrips(), (s) => setSource("trips", s)),
    loadSource<FuelExpense>("Fuel expenses", () => Promise.resolve(fuelExpenseService.getAll()), (s) => setSource("fuel", s)),
    loadSource<MaintenanceEvent>("Maintenance records", () => Promise.resolve(getMaintenance() as MaintenanceEvent[]), (s) =>
      setSource("maintenance", s)
    ),
  ]);

  return { ...state };
}