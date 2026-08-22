// src/modules/reports/vehicle/types/vehicleReportTypes.ts
// -----------------------------------------------------------------------------
// Vehicle Report data model.
// -----------------------------------------------------------------------------

import type { Vehicle } from "../../../masters/vehicles/types/vehicle";
import type { Trip } from "../../../operations/vehicle-trips/types/trip";
import type { FuelExpense } from "../../../operations/fuel-expenses/types/fuelExpense";
import type { MaintenanceEvent } from "../../../fleet-operations/types";

/** Preset date windows. Financial year is Apr 1 → Mar 31 (Indian FY). */
export type VehicleReportDatePreset =
  | "today"
  | "yesterday"
  | "thisWeek"
  | "lastWeek"
  | "thisMonth"
  | "lastMonth"
  | "thisFY"
  | "lastFY"
  | "custom";

/** Resolved, inclusive date range as local YYYY-MM-DD strings. */
export interface DateWindow {
  from: string;
  to: string;
}

/** Applied report filter (draft state lives in the hook). */
export interface VehicleReportFilters {
  /** Vehicle master id, or "all" for the whole fleet. */
  vehicleId: number | "all";
  preset: VehicleReportDatePreset;
  /** Custom range (used when preset === "custom"). */
  fromDate: string;
  toDate: string;
}

/** Per-source load state so failures are never shown as zero. */
export type SourceStatus = "loading" | "success" | "error";

export interface SourceState<T> {
  data: T[];
  status: SourceStatus;
  error: string | null;
}

export interface VehicleReportSourceData {
  vehicles: SourceState<Vehicle>;
  trips: SourceState<Trip>;
  fuel: SourceState<FuelExpense>;
  maintenance: SourceState<MaintenanceEvent>;
}

/**
 * One row of the vehicle report.
 * `null` on a metric means "source unavailable" (rendered N/A);
 * a real zero means "no records" and renders as 0.
 */
export interface VehicleReportRow {
  vehicleId: number;
  vehicleNumber: string;
  vehicleType: string;
  /** Master-record status (Active / Inactive). */
  status: Vehicle["status"];
  /** Completed trips inside the period. */
  trips: number;
  /** Sum of trip.totalKm for completed trips inside the period. */
  distanceKm: number;
  /** Sum of fuel-bill litres inside the period; null when the fuel source failed. */
  fuelLitres: number | null;
  /** Sum of fuel-bill amounts inside the period; null when the fuel source failed. */
  fuelCost: number | null;
  /** Sum of maintenance record costs inside the period; null when the maintenance source failed. */
  maintenanceCost: number | null;
  /** Fuel cost + maintenance cost (documented operating-cost definition). */
  operatingCost: number | null;
  /** Operating cost ÷ distance; null when distance or a source is unavailable. */
  costPerKm: number | null;
  /** Distance ÷ fuel litres; null when fuel is 0 or unavailable. */
  mileage: number | null;
  /** Latest completed-trip date inside the period. */
  lastTripDate: string | null;
  /** Latest known meter reading (closing meter preferred, else opening + km). */
  lastMeterReading: number | null;
}

export interface VehicleReportSummary {
  /** Vehicles with any activity (trips/fuel/maintenance) in the period. */
  totalVehicles: number;
  totalTrips: number;
  totalDistanceKm: number;
  totalFuelLitres: number | null;
  totalFuelCost: number | null;
  totalMaintenanceCost: number | null;
  /** Aggregate mileage = total distance ÷ total litres. */
  avgMileage: number | null;
  /** Aggregate operating cost ÷ total distance. */
  avgCostPerKm: number | null;
}

export interface VehicleReportResult {
  rows: VehicleReportRow[];
  summary: VehicleReportSummary;
  /** Vehicle master records considered (all, or the single selected one). */
  vehicleCount: number;
  /** True when the fuel source failed — fuel metrics are N/A. */
  fuelSourceUnavailable: boolean;
  /** True when the maintenance source failed — maintenance metrics are N/A. */
  maintenanceSourceUnavailable: boolean;
}

/** Known-field mapping for table sorting. */
export type VehicleReportSortKey =
  | "vehicleNumber"
  | "trips"
  | "distanceKm"
  | "fuelLitres"
  | "fuelCost"
  | "maintenanceCost"
  | "costPerKm"
  | "mileage";