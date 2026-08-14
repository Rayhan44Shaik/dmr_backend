/** Operations module types */
export type OpsRecordStatus = "Draft" | "Pending Approval" | "Approved" | "Rejected" | "Deleted";
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
    tripNo: string;
    vehicleNo: string | null;
    farmName: string | null;
    birds: number;
    weight: number;
    rate: number;
    amount: number;
    mortality: number;
    remarks: string;
    status: OpsRecordStatus;
    deleted: boolean;
    deletedReason?: string | null;
    /** True when the parent trip is soft-deleted — the sale itself is NOT
     * deleted and remains a permanent historical accounting record. */
    tripDeleted: boolean;
    /** Whether this sale can currently be edited/deleted (Completed trip
     * within the 10-day window, or not yet Completed). Backend is still the
     * authority — this only lets the UI reflect state without recomputing it. */
    editable: boolean;
    /** ISO date the 10-day edit window closes (only meaningful once the trip
     * is Completed). */
    windowExpiresAt: string | null;
    approvedBy?: string | null;
    approvedAt?: string | null;
    rejectedBy?: string | null;
    rejectedAt?: string | null;
    rejectedReason?: string | null;
    createdBy?: string;
    createdAt?: string | null;
    updatedAt?: string | null;
}
export type RateEntryStatus = "Pending" | "Entered";
/** A Rate Entry–eligible trip (status = Completed, not deleted),
 * optionally joined with its rate record if one has been entered. */
export interface RateEntryTrip {
    tripId: number;
    tripNo: string;
    tripDate: string;
    tripStatus: string;
    vehicleId: number | null;
    vehicleNo: string | null;
    driverId: number | null;
    driverName: string | null;
    supervisorId: number | null;
    supervisorName: string | null;
    sourceFarmId: number | null;
    sourceFarm: string | null;
    totalBirds: number;
    totalWeight: number;
    totalShops: number;
    birdTypeId: number | null;
    birdType: string | null;
    rateStatus: RateEntryStatus;
    rateEntryId: number | null;
    rate: number | null;
    remarks: string | null;
    createdBy?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
}
export interface RateEntry {
    id: number;
    tripId: number;
    tripNo?: string;
    birdTypeId: number | null;
    birdType: string;
    rate: number;
    remarks: string;
    createdBy?: string;
    updatedBy?: string | null;
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
export type FuelSourceType = "TRIP" | "MANUAL";
export interface FuelExpense {
    id: string;
    billNo: string;
    billDate: string;
    sourceType: FuelSourceType;
    vehicleId: number | null;
    vehicleNo: string | null;
    driverId: number | null;
    driverName: string | null;
    supervisorId: number | null;
    supervisorName: string | null;
    tripId: number | null;
    tripNo?: string | null;
    tripFuelEntryIndex: number | null;
    currentMeter: number;
    fuelRate: number;
    liters: number;
    amount: number;
    pumpName: string;
    bunkAddress?: string | null;
    remarks?: string | null;
    status: OpsRecordStatus;
    imageData?: string | null;
    imageName?: string | null;
    imageMime?: string | null;
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
