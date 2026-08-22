// src/modules/reports/vehicle/utils/vehicleReportUtils.ts
// -----------------------------------------------------------------------------
// Pure, centralized Vehicle Report derivation. The KPI cards and the table
// consume this single result — calculations exist in exactly one place.
//
// Business rules:
//  · Trips       — count only status "Completed" and not deleted; this is the
//                  application's authoritative completed-trip definition
//                  (Draft / Pending / Deleted are excluded).
//  · Distance    — sum of trip.totalKm (backend-authoritative meter-derived
//                  distance).
//  · Fuel        — sum of fuel-bill litres (fuel expense records). Trip
//                  expense is never treated as fuel.
//  · Maintenance — sum of maintenance record totalCost.
//  · Mileage     — distance ÷ fuel litres; N/A when fuel is 0 or unavailable.
//  · Cost / KM   — (fuel cost + maintenance cost) ÷ distance; N/A when the
//                  distance is 0 or a source is unavailable. The operating
//                  cost definition for this report is fuel + maintenance
//                  only (no other vehicle-specific cost source is stored).
//  · A vehicle is included when it has any activity in the period: at least
//    one completed trip, one fuel bill, or one maintenance record.
// -----------------------------------------------------------------------------

import type { Vehicle } from "../../../masters/vehicles/types/vehicle";
import type { Trip } from "../../../operations/vehicle-trips/types/trip";
import type { FuelExpense } from "../../../operations/fuel-expenses/types/fuelExpense";
import type { MaintenanceEvent } from "../../../fleet-operations/types";
import type {
  VehicleReportFilters,
  VehicleReportResult,
  VehicleReportRow,
} from "../types/vehicleReportTypes";
import { isInDateWindow, resolveDateWindow } from "./vehicleReportDates";

interface DeriveInput {
  vehicles: Vehicle[];
  trips: Trip[];
  fuel: FuelExpense[];
  maintenance: MaintenanceEvent[];
  filters: VehicleReportFilters;
  /** Whether each optional source loaded successfully. */
  fuelSourceAvailable: boolean;
  maintenanceSourceAvailable: boolean;
}

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

function isCompletedOperationalTrip(trip: Trip): boolean {
  return trip.status === "Completed" && !trip.deleted;
}

/**
 * Derive the complete vehicle report (rows + summary) from raw source data.
 * Pure function — no side effects, safe to memoize.
 */
export function deriveVehicleReport(input: DeriveInput): VehicleReportResult {
  const { vehicles, trips, fuel, maintenance, filters, fuelSourceAvailable, maintenanceSourceAvailable } = input;
  const window = resolveDateWindow(filters.preset, filters.fromDate, filters.toDate);

  const inScopeVehicles = filters.vehicleId === "all" ? vehicles : vehicles.filter((v) => v.id === filters.vehicleId);

  // Completed trips inside the window, keyed by vehicle number (the business
  // link between trips and vehicles; ids are never surfaced in the UI).
  const completedTripsInWindow = trips.filter(
    (t) => isCompletedOperationalTrip(t) && t.vehicleNo && isInDateWindow(t.tripDate, window)
  );

  const rows: VehicleReportRow[] = inScopeVehicles
    .map((vehicle) => {
      const vehicleTrips = completedTripsInWindow.filter((t) => t.vehicleNo === vehicle.vehicleNumber);
      const distanceKm = vehicleTrips.reduce((sum, t) => sum + num(t.totalKm), 0);

      const vehicleFuel = fuelSourceAvailable
        ? fuel.filter((f) => f.vehicleNo === vehicle.vehicleNumber && isInDateWindow(f.date, window))
        : null;
      const fuelLitres = vehicleFuel === null ? null : vehicleFuel.reduce((sum, f) => sum + num(f.litres), 0);
      const fuelCost = vehicleFuel === null ? null : vehicleFuel.reduce((sum, f) => sum + num(f.amount), 0);

      const vehicleMaintenance = maintenanceSourceAvailable
        ? maintenance.filter(
            (m) => String(m.vehicleId) === String(vehicle.id) && isInDateWindow(m.date?.slice(0, 10), window)
          )
        : null;
      const maintenanceCost =
        vehicleMaintenance === null ? null : vehicleMaintenance.reduce((sum, m) => sum + num(m.totalCost), 0);

      const hasActivity = vehicleTrips.length > 0 || (fuelLitres ?? 0) > 0 || (fuelCost ?? 0) > 0 || (maintenanceCost ?? 0) > 0;
      if (!hasActivity) return null;

      const operatingCost =
        fuelCost === null || maintenanceCost === null ? null : fuelCost + maintenanceCost;
      const costPerKm =
        operatingCost === null || distanceKm <= 0 ? null : operatingCost / distanceKm;
      const mileage = fuelLitres === null || fuelLitres <= 0 ? null : distanceKm / fuelLitres;

      const latestTrip = vehicleTrips.reduce<Trip | null>(
        (latest, t) => (latest === null || t.tripDate > latest.tripDate ? t : latest),
        null
      );

      let lastMeterReading: number | null = null;
      if (latestTrip) {
        if (num(latestTrip.closingMeter) > 0) {
          lastMeterReading = num(latestTrip.closingMeter);
        } else if (num(latestTrip.openingMeter) > 0) {
          lastMeterReading = num(latestTrip.openingMeter) + num(latestTrip.totalKm);
        }
      }

      return {
        vehicleId: vehicle.id,
        vehicleNumber: vehicle.vehicleNumber,
        vehicleType: vehicle.vehicleType,
        status: vehicle.status,
        trips: vehicleTrips.length,
        distanceKm,
        fuelLitres,
        fuelCost,
        maintenanceCost,
        operatingCost,
        costPerKm,
        mileage,
        lastTripDate: latestTrip?.tripDate ?? null,
        lastMeterReading,
      };
    })
    .filter((row): row is VehicleReportRow => row !== null)
    .sort((a, b) => a.vehicleNumber.localeCompare(b.vehicleNumber));

  const totalTrips = rows.reduce((sum, r) => sum + r.trips, 0);
  const totalDistanceKm = rows.reduce((sum, r) => sum + r.distanceKm, 0);

  const totalFuelLitres = fuelSourceAvailable ? rows.reduce((sum, r) => sum + (r.fuelLitres ?? 0), 0) : null;
  const totalFuelCost = fuelSourceAvailable ? rows.reduce((sum, r) => sum + (r.fuelCost ?? 0), 0) : null;
  const totalMaintenanceCost = maintenanceSourceAvailable
    ? rows.reduce((sum, r) => sum + (r.maintenanceCost ?? 0), 0)
    : null;

  const operatingCostTotal =
    totalFuelCost === null || totalMaintenanceCost === null ? null : totalFuelCost + totalMaintenanceCost;

  return {
    rows,
    summary: {
      totalVehicles: rows.length,
      totalTrips,
      totalDistanceKm,
      totalFuelLitres,
      totalFuelCost,
      totalMaintenanceCost,
      // Aggregate mileage (not the mean of per-vehicle mileages).
      avgMileage: totalFuelLitres === null || totalFuelLitres <= 0 ? null : totalDistanceKm / totalFuelLitres,
      avgCostPerKm: operatingCostTotal === null || totalDistanceKm <= 0 ? null : operatingCostTotal / totalDistanceKm,
    },
    vehicleCount: inScopeVehicles.length,
    fuelSourceUnavailable: !fuelSourceAvailable,
    maintenanceSourceUnavailable: !maintenanceSourceAvailable,
  };
}

/* ------------------------------------------------------------------ */
/*  Report-specific display formatting (en-IN conventions)             */
/* ------------------------------------------------------------------ */

const decimal2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** 24,850 km */
export function formatKm(value: number): string {
  return `${integer.format(value)} km`;
}

/** 1,120.00 L */
export function formatLitres(value: number): string {
  return `${decimal2.format(value)} L`;
}

/** 4.04 km/L */
export function formatMileage(value: number): string {
  return `${decimal2.format(value)} km/L`;
}

/** 24,850 */
export function formatCount(value: number): string {
  return integer.format(value);
}

/** ₹32.55 (rate formatting reuses the central INR helper where needed) */
export function formatRate(value: number): string {
  return `₹${decimal2.format(value)}`;
}

/** Business-friendly N/A for unavailable metrics. */
export const NOT_AVAILABLE = "N/A";

/** "12,450 km" without a unit — used in compact table cells. */
export function formatKmValue(value: number): string {
  return integer.format(value);
}