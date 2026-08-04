/** Operations module types */

export type OpsRecordStatus =
  | "Draft"
  | "Pending Approval"
  | "Approved"
  | "Rejected"
  | "Deleted";

export type TripStatus =
  | "Draft"
  | "Pending"
  | "Pending Approval"
  | "Approved"
  | "Completed"
  | "Cancelled"
  | "Rejected"
  | "Deleted";

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
