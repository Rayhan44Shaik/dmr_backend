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
    tripDeleted: boolean;
    editable: boolean;
    windowExpiresAt: string | null;
    approvedBy?: string | null;
    approvedAt?: string | null;
    rejectedBy?: string | null;
    rejectedAt?: string | null;
    rejectedReason?: string | null;
    createdBy?: string;
    createdAt?: string | null;
    updatedAt?: string | null;
    rateCompleted?: boolean;
    rateLockedAt?: string | null;
    rateLockedBy?: string | null;
    correctionWindowExpired?: boolean;
    correctionWindowClosesAt?: string | null;
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
export interface RateEntryMarketRate {
    shopId: number | null;
    shopName: string;
    birdTypeId: number | null;
    birdType: string;
    masterRate: number | null;
    lastTripRate: number | null;
    lastTripDate: string | null;
    lastTripNo: string | null;
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
    rateLocked: boolean;
    rateLockedAt: string | null;
    rateLockedBy: string | null;
    ratesEntered: number;
    deliveriesCount: number;
    totalAmount: number;
    deliveries: RateEntryDelivery[];
}
