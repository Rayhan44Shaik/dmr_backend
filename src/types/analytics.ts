/** Fleet Analytics module types — read-only aggregation over existing Fleet data. */

export interface AnalyticsKpis {
  totalDistance: number;
  /** Distance / fuel litres; 0 when distance or litres is 0 (never NaN/Infinity). */
  averageMileage: number;
  totalFuelLitres: number;
  /** Sum of the four cost centres — equals costCenters total, exactly. */
  totalExpense: number;
  costPerKm: number;
  fuelCost: number;
  maintenanceCost: number;
  tollCost: number;
  otherCost: number;
}

export interface AnalyticsWeeklyPoint {
  /** Existing page label, e.g. "W33" (ISO week of the Sunday bucket start). */
  week: string;
  weekLabel: string;
  litres: number;
}

export interface AnalyticsWeeklyMileagePoint extends AnalyticsWeeklyPoint {
  distance: number;
  mileage: number;
}

export interface AnalyticsCostCenter {
  name: "Fuel" | "Maintenance" | "Toll" | "Other";
  amount: number;
  /** percent of total expense; 0 when total outlay is 0. */
  percentage: number;
  /** Drop-in alias of amount for the existing donut ({ name, value }). */
  value: number;
}

/**
 * Per-vehicle mileage metrics. `id`/`dist`/`fuel`/`vehicleNumber` aliases are
 * provided so the existing TopPerformersTable can consume rows unchanged.
 */
export interface AnalyticsTopPerformer {
  vehicleId: number;
  id: number;
  vehicleNo: string;
  vehicleNumber: string;
  mileage: number;
  distance: number;
  dist: number;
  fuelLitres: number;
  fuel: number;
}

/**
 * Per-vehicle expense metrics. `id`/`totalExpense`/`maintenance`/`fuel`
 * aliases mirror HighestExpenseTable's expected shape.
 */
export interface AnalyticsHighestExpense {
  vehicleId: number;
  id: number;
  vehicleNo: string;
  vehicleNumber: string;
  totalCost: number;
  totalExpense: number;
  maintenanceCost: number;
  maintenance: number;
  fuelCost: number;
  fuel: number;
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
  weeklyFuelConsumption: AnalyticsWeeklyPoint[];
  weeklyMileage: AnalyticsWeeklyMileagePoint[];
  costCenters: AnalyticsCostCenter[];
  topPerformers: AnalyticsTopPerformer[];
  highestExpense: AnalyticsHighestExpense[];
}