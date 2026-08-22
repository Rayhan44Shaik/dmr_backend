// Fleet Analytics — strongly typed contract for the backend-authoritative
// GET /api/fleet/analytics response. The browser renders these values directly;
// it never recomputes accounting totals.
export interface AnalyticsKpis {
  totalTrips: number;
  totalDistance: number;
  averageMileage: number;
  totalFuelLitres: number;
  fuelCost: number;
  maintenanceCost: number;
  emiDue: number;
  tollCost: number;
  otherCost: number;
  totalExpense: number;
  costPerKm: number;
}

export interface AnalyticsWeeklyPoint {
  week: string;
  weekLabel: string;
  fuel: number;
  distance: number;
  mileage: number;
}

export interface AnalyticsCostCenter {
  name: 'Fuel' | 'Maintenance' | 'EMI' | 'Toll' | 'Other';
  amount: number;
  percentage: number;
  value: number;
}

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
  mileage: number;
}

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
  safe: true;
  kpis: AnalyticsKpis;
  weekly: AnalyticsWeeklyPoint[];
  costCenters: AnalyticsCostCenter[];
  vehicleStats: AnalyticsVehicleStat[];
  topPerformers: AnalyticsTopPerformer[];
  highestExpense: AnalyticsHighestExpense[];
}