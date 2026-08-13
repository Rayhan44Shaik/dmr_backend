import { z } from "zod";
export declare const OPS_STATUSES: readonly ["Draft", "Pending Approval", "Approved", "Rejected", "Deleted"];
/** PostgreSQL trip_status enum — source of truth */
export declare const TRIP_STATUSES: readonly ["Draft", "Pending", "Completed", "Deleted"];
export declare const opsStatusSchema: z.ZodEnum<["Draft", "Pending Approval", "Approved", "Rejected", "Deleted"]>;
export declare const tripStatusSchema: z.ZodEnum<["Draft", "Pending", "Completed", "Deleted"]>;
export declare const statusPatchSchema: z.ZodObject<{
    status: z.ZodString;
    approvedBy: z.ZodOptional<z.ZodString>;
    rejectedBy: z.ZodOptional<z.ZodString>;
    rejectedReason: z.ZodOptional<z.ZodString>;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: string;
    approvedBy?: string | undefined;
    rejectedBy?: string | undefined;
    rejectedReason?: string | undefined;
    reason?: string | undefined;
}, {
    status: string;
    approvedBy?: string | undefined;
    rejectedBy?: string | undefined;
    rejectedReason?: string | undefined;
    reason?: string | undefined;
}>;
export declare const shopRateBodySchema: z.ZodObject<{
    shopId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    shopName: z.ZodOptional<z.ZodString>;
    birdTypeId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    birdType: z.ZodOptional<z.ZodString>;
    rate: z.ZodNumber;
    effectiveFrom: z.ZodString;
    effectiveTo: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    remarks: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["Draft", "Pending Approval", "Approved", "Rejected", "Deleted"]>>;
    createdBy: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    rate: number;
    effectiveFrom: string;
    shopName?: string | undefined;
    status?: "Draft" | "Deleted" | "Approved" | "Rejected" | "Pending Approval" | undefined;
    birdType?: string | undefined;
    shopId?: number | null | undefined;
    birdTypeId?: number | null | undefined;
    effectiveTo?: string | null | undefined;
    remarks?: string | undefined;
    createdBy?: string | undefined;
}, {
    rate: number;
    effectiveFrom: string;
    shopName?: string | undefined;
    status?: "Draft" | "Deleted" | "Approved" | "Rejected" | "Pending Approval" | undefined;
    birdType?: string | undefined;
    shopId?: number | null | undefined;
    birdTypeId?: number | null | undefined;
    effectiveTo?: string | null | undefined;
    remarks?: string | undefined;
    createdBy?: string | undefined;
}>;
export declare const shopSaleBodySchema: z.ZodObject<{
    saleNo: z.ZodOptional<z.ZodString>;
    saleDate: z.ZodString;
    shopId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    shopName: z.ZodOptional<z.ZodString>;
    birdTypeId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    birdType: z.ZodOptional<z.ZodString>;
    tripId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    birds: z.ZodOptional<z.ZodNumber>;
    weight: z.ZodOptional<z.ZodNumber>;
    rate: z.ZodOptional<z.ZodNumber>;
    amount: z.ZodOptional<z.ZodNumber>;
    mortality: z.ZodOptional<z.ZodNumber>;
    remarks: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["Draft", "Pending Approval", "Approved", "Rejected", "Deleted"]>>;
    createdBy: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    saleDate: string;
    weight?: number | undefined;
    shopName?: string | undefined;
    status?: "Draft" | "Deleted" | "Approved" | "Rejected" | "Pending Approval" | undefined;
    birdType?: string | undefined;
    tripId?: number | null | undefined;
    shopId?: number | null | undefined;
    birdTypeId?: number | null | undefined;
    rate?: number | undefined;
    remarks?: string | undefined;
    createdBy?: string | undefined;
    saleNo?: string | undefined;
    birds?: number | undefined;
    amount?: number | undefined;
    mortality?: number | undefined;
}, {
    saleDate: string;
    weight?: number | undefined;
    shopName?: string | undefined;
    status?: "Draft" | "Deleted" | "Approved" | "Rejected" | "Pending Approval" | undefined;
    birdType?: string | undefined;
    tripId?: number | null | undefined;
    shopId?: number | null | undefined;
    birdTypeId?: number | null | undefined;
    rate?: number | undefined;
    remarks?: string | undefined;
    createdBy?: string | undefined;
    saleNo?: string | undefined;
    birds?: number | undefined;
    amount?: number | undefined;
    mortality?: number | undefined;
}>;
export declare const collectionBodySchema: z.ZodObject<{
    collectionNo: z.ZodOptional<z.ZodString>;
    collectionDate: z.ZodString;
    shopId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    shopName: z.ZodOptional<z.ZodString>;
    saleId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    tripId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    amountDue: z.ZodOptional<z.ZodNumber>;
    amountCollected: z.ZodOptional<z.ZodNumber>;
    paymentMode: z.ZodOptional<z.ZodString>;
    referenceNo: z.ZodOptional<z.ZodString>;
    remarks: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["Draft", "Pending Approval", "Approved", "Rejected", "Deleted"]>>;
    createdBy: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    collectionDate: string;
    shopName?: string | undefined;
    status?: "Draft" | "Deleted" | "Approved" | "Rejected" | "Pending Approval" | undefined;
    tripId?: number | null | undefined;
    shopId?: number | null | undefined;
    remarks?: string | undefined;
    createdBy?: string | undefined;
    collectionNo?: string | undefined;
    saleId?: number | null | undefined;
    amountDue?: number | undefined;
    amountCollected?: number | undefined;
    paymentMode?: string | undefined;
    referenceNo?: string | undefined;
}, {
    collectionDate: string;
    shopName?: string | undefined;
    status?: "Draft" | "Deleted" | "Approved" | "Rejected" | "Pending Approval" | undefined;
    tripId?: number | null | undefined;
    shopId?: number | null | undefined;
    remarks?: string | undefined;
    createdBy?: string | undefined;
    collectionNo?: string | undefined;
    saleId?: number | null | undefined;
    amountDue?: number | undefined;
    amountCollected?: number | undefined;
    paymentMode?: string | undefined;
    referenceNo?: string | undefined;
}>;
export declare const fuelExpenseBodySchema: z.ZodObject<{
    billNo: z.ZodOptional<z.ZodString>;
    billDate: z.ZodString;
    vehicleId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    vehicleNo: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    driverId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    driverName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    supervisorId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    supervisorName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    tripId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    currentMeter: z.ZodOptional<z.ZodNumber>;
    fuelRate: z.ZodOptional<z.ZodNumber>;
    liters: z.ZodOptional<z.ZodNumber>;
    amount: z.ZodOptional<z.ZodNumber>;
    pumpName: z.ZodOptional<z.ZodString>;
    bunkAddress: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    remarks: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    imageData: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    imageName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    imageMime: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdBy: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    billDate: string;
    supervisorName?: string | null | undefined;
    vehicleNo?: string | null | undefined;
    tripId?: number | null | undefined;
    vehicleId?: number | null | undefined;
    driverId?: number | null | undefined;
    supervisorId?: number | null | undefined;
    remarks?: string | null | undefined;
    createdBy?: string | undefined;
    amount?: number | undefined;
    billNo?: string | undefined;
    driverName?: string | null | undefined;
    currentMeter?: number | undefined;
    fuelRate?: number | undefined;
    liters?: number | undefined;
    pumpName?: string | undefined;
    bunkAddress?: string | null | undefined;
    imageData?: string | null | undefined;
    imageName?: string | null | undefined;
    imageMime?: string | null | undefined;
}, {
    billDate: string;
    supervisorName?: string | null | undefined;
    vehicleNo?: string | null | undefined;
    tripId?: number | null | undefined;
    vehicleId?: number | null | undefined;
    driverId?: number | null | undefined;
    supervisorId?: number | null | undefined;
    remarks?: string | null | undefined;
    createdBy?: string | undefined;
    amount?: number | undefined;
    billNo?: string | undefined;
    driverName?: string | null | undefined;
    currentMeter?: number | undefined;
    fuelRate?: number | undefined;
    liters?: number | undefined;
    pumpName?: string | undefined;
    bunkAddress?: string | null | undefined;
    imageData?: string | null | undefined;
    imageName?: string | null | undefined;
    imageMime?: string | null | undefined;
}>;
export declare const fuelRejectSchema: z.ZodObject<{
    rejectedBy: z.ZodOptional<z.ZodString>;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
    rejectedBy?: string | undefined;
}, {
    reason: string;
    rejectedBy?: string | undefined;
}>;
export declare const fuelApproveSchema: z.ZodObject<{
    approvedBy: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    approvedBy?: string | undefined;
}, {
    approvedBy?: string | undefined;
}>;
export declare function parseBody<T>(schema: z.ZodType<T>, body: unknown): T;
export declare function assertOpsStatus(status: string): asserts status is (typeof OPS_STATUSES)[number];
export declare function assertTripStatus(status: string): asserts status is (typeof TRIP_STATUSES)[number];
/** Status transition helpers for soft-delete / approval */
export declare function approvalFields(status: string, patch: {
    approvedBy?: string;
    rejectedBy?: string;
    rejectedReason?: string;
    reason?: string;
}): {
    approved_by: string;
    approved_at: string;
    rejected_by: null;
    rejected_at: null;
    rejected_reason: null;
    deleted?: undefined;
    deleted_reason?: undefined;
} | {
    rejected_by: string;
    rejected_at: string;
    rejected_reason: string | null;
    approved_by?: undefined;
    approved_at?: undefined;
    deleted?: undefined;
    deleted_reason?: undefined;
} | {
    deleted: boolean;
    deleted_reason: string | null;
    approved_by?: undefined;
    approved_at?: undefined;
    rejected_by?: undefined;
    rejected_at?: undefined;
    rejected_reason?: undefined;
} | {
    approved_by?: undefined;
    approved_at?: undefined;
    rejected_by?: undefined;
    rejected_at?: undefined;
    rejected_reason?: undefined;
    deleted?: undefined;
    deleted_reason?: undefined;
};
