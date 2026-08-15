/** Operations module types */

export type OpsRecordStatus =
  | "Draft"
  | "Pending Approval"
  | "Approved"
  | "Rejected"
  | "Deleted";

export type TripStatus = "Draft" | "Pending" | "Completed" | "Deleted";

export interface OpsStatusPatch {
  status: OpsRecordStatus | TripStatus;
  approvedBy?: string;
  rejectedBy?: string;
  rejectedReason?: string;
  reason?: string;
}

export interface OperationsDashboard {
  totalTrips: number;
  totalWeight: number;
  totalSales: number;
  totalCollections: number;
  pendingCollections: number;
  fuelExpenses: number;
  todaysTrips: number;
  weeklyTrips: number;
  monthlyTrips: number;
}

export interface ShopRate {
  id: number;
  shopId: number | null;
  shopName: string;
  birdTypeId: number | null;
  birdType: string;
  rate: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  remarks: string;
  status: OpsRecordStatus;
  deleted: boolean;
  deletedReason?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  rejectedReason?: string | null;
  createdBy?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ShopSale {
  id: number;
  saleNo: string;
  saleDate: string;
  shopId: number | null;
  shopName: string;
  birdTypeId: number | null;
  birdType: string;
  tripId: number | null;
  birds: number;
  weight: number;
  rate: number;
  amount: number;
  mortality: number;
  remarks: string;
  status: OpsRecordStatus;
  deleted: boolean;
  deletedReason?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  rejectedReason?: string | null;
  createdBy?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface Collection {
  id: number;
  collectionNo: string;
  collectionDate: string;
  shopId: number | null;
  shopName: string;
  saleId: number | null;
  tripId: number | null;
  amountDue: number;
  amountCollected: number;
  paymentMode: string;
  referenceNo: string;
  remarks: string;
  status: OpsRecordStatus;
  deleted: boolean;
  deletedReason?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  rejectedReason?: string | null;
  createdBy?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  /** computed */
  balance?: number;
}

export interface FuelExpense {
  id: string;
  billNo: string;
  billDate: string;
  vehicleId: number | null;
  vehicleNo: string | null;
  driverId: number | null;
  driverName: string | null;
  supervisorId: number | null;
  supervisorName: string | null;
  tripId: number | null;
  currentMeter: number;
  fuelRate: number;
  liters: number;
  amount: number;
  pumpName: string;
  remarks?: string | null;
  status: OpsRecordStatus;
  imageData?: string | null;
  deleted: boolean;
  deletedReason?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  rejectedReason?: string | null;
  createdBy?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface RunningBalanceRow {
  shopId: number | null;
  shopName: string;
  totalSales: number;
  totalCollected: number;
  pendingAmount: number;
  runningBalance: number;
}

// ---------------------------------------------------------------------------
// Rate Entry
//
// Authoritative data path (PostgreSQL only — no duplicate tables):
//   trips (rate_completed = lock flag, rate_locked_at/by = audit)
//     └─ trip_deliveries.rate / trip_deliveries.amount
//
// "Market rate" reference data is READ-ONLY and is derived from:
//   • shop_rates (master rate records, if any)
//   • previously rate-LOCKED trips' trip_deliveries (actual realized rates)
// ---------------------------------------------------------------------------

export interface RateEntryMarketRate {
  shopId: number | null;
  shopName: string;
  birdTypeId: number | null;
  birdType: string;
  /** Last known master rate from shop_rates, if any. */
  masterRate: number | null;
  /** Last rate realized on a rate-locked trip. */
  lastTripRate: number | null;
  lastTripDate: string | null;
  lastTripNo: string | null;
  /** Average realized rate across recent locked trips. */
  avgTripRate: number | null;
  tripRateSamples: number;
}

export interface RateEntryDelivery {
  id: number;
  serialNo: number | null;
  boxNo: number | null;
  shopId: number | null;
  shopName: string;
  birdTypeId: number | null;
  birdType: string;
  birds: number;
  weight: number;
  mortality: number;
  mortKg: number | null;
  rate: number | null;
  amount: number;
  remarks: string;
  deliveryMode: "box" | "weight";
  /** Read-only market/reference information for the Rate Entry modal. */
  marketRate: RateEntryMarketRate | null;
}

export interface RateEntryTrip {
  id: number;
  tripNo: string;
  tripDate: string;
  status: TripStatus;
  vehicleNo: string | null;
  driverName: string | null;
  supervisorName: string | null;
  sourceFarm: string | null;
  totalBirds: number;
  totalWeight: number;
  totalShops: number;
  /** Lock flag — mirrors trips.rate_completed. */
  rateLocked: boolean;
  rateLockedAt: string | null;
  rateLockedBy: string | null;
  /** Number of deliveries with a non-null rate. */
  ratesEntered: number;
  /** Total deliveries on the trip. */
  deliveriesCount: number;
  /** Sum of delivery.amount for deliveries that have a rate. */
  totalAmount: number;
  deliveries: RateEntryDelivery[];
}
