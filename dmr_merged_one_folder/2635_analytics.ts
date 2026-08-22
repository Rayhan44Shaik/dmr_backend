/** Fleet Analytics module types — read-only aggregation over existing Fleet data. */

export interface AnalyticsKpis {
  /** Completed, non-deleted trips in range (and vehicle, if filtered). */
  totalTrips: number;
  totalDistance: number;
  /** Distance / fuel litres; 0 when distance or litres is 0 (never NaN/Infinity). */
  averageMileage: number;
  /** Fuel litres across eligible fuel_expenses (litres column). */
  totalFuelLitres: number;
  fuelCost: number;
  maintenanceCost: number;
  /** Non-paid EMI whose next due date falls inside the range. */
  emiDue: number;
  tollCost: number;
  otherCost: number;
  /** Sum of the five cost centres — equals costCenters total, exactly. */
  totalExpense: number;
  costPerKm: number;
}

/** One Sunday-started week of the report range (backend-aggregated). */
export interface AnalyticsWeeklyPoint {
  /** Existing page label, e.g. "W33" (ISO week of the Sunday bucket start). */
  week: string;
  weekLabel: string;
  /** Litres consumed that week. */
  fuel: number;
  /** Completed-trip distance that week. */
  distance: number;
  /** Zero-safe distance / litres for that week. */
  mileage: number;
}

export interface AnalyticsCostCenter {
  name: "Fuel" | "Maintenance" | "EMI" | "Toll" | "Other";
  amount: number;
  /** percent of total expense; 0 when total outlay is 0. */
  percentage: number;
  /** Drop-in alias of amount for the existing donut ({ name, value }). */
  value: number;
}

/** Per-vehicle aggregation for the report window. */
export interface AnalyticsVehicleStat {
  vehicleId: number;
  vehicleNumber: string;
  trips: number;
  distance: number;
  fuelLitres: number;
  fuelCost: number;
  maintenanceCost: number;
  emiCost: number;
  tollCost: number;
  otherCost: number;
  totalExpense: number;
  /** Zero-safe distance / fuelLitres. */
  mileage: number;
}

/**
 * Per-vehicle mileage metrics. `id`/`dist`/`fuel`/`vehicleNumber` aliases are
 * provided so the existing TopPerformersTable can consume rows unchanged.
 */
export interface AnalyticsTopPerformer {
  vehicleId: number;
  id: number;
  vehicleNumber: string;
  mileage: number;
  distance: number;
  dist: number;
  fuelLitres: number;
  fuel: number;
  trips: number;
}

/**
 * Per-vehicle expense metrics. `id`/`totalExpense`/`maintenance`/`fuel`
 * aliases mirror HighestExpenseTable's expected shape.
 */
export interface AnalyticsHighestExpense {
  vehicleId: number;
  id: number;
  vehicleNumber: string;
  totalExpense: number;
  maintenanceCost: number;
  maintenance: number;
  fuelCost: number;
  fuel: number;
  emiCost: number;
  tollCost: number;
  otherCost: number;
}

export interface FleetAnalyticsResponse {
  fromDate: string;
  toDate: string;
  vehicleId: number | null;
  /** NaN/Infinity-free guard flag for any chart that renders numbers. */
  safe: true;
  kpis: AnalyticsKpis;
  weekly: AnalyticsWeeklyPoint[];
  /** Expense breakdown (Fuel / Maintenance / EMI / Toll / Other); sum == kpis.totalExpense. */
  costCenters: AnalyticsCostCenter[];
  vehicleStats: AnalyticsVehicleStat[];
  topPerformers: AnalyticsTopPerformer[];
  highestExpense: AnalyticsHighestExpense[];
}