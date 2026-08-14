import { z } from "zod";
import { AppError } from "../middleware/errorHandler.js";

export const OPS_STATUSES = [
  "Draft",
  "Pending Approval",
  "Approved",
  "Rejected",
  "Deleted",
] as const;

/** PostgreSQL trip_status enum — source of truth */
export const TRIP_STATUSES = ["Draft", "Pending", "Completed", "Deleted"] as const;

export const opsStatusSchema = z.enum(OPS_STATUSES);
export const tripStatusSchema = z.enum(TRIP_STATUSES);

export const statusPatchSchema = z.object({
  status: z.string().min(1),
  approvedBy: z.string().optional(),
  rejectedBy: z.string().optional(),
  rejectedReason: z.string().optional(),
  reason: z.string().optional(),
});

export const shopRateBodySchema = z.object({
  shopId: z.number().int().nullable().optional(),
  shopName: z.string().optional(),
  birdTypeId: z.number().int().nullable().optional(),
  birdType: z.string().optional(),
  rate: z.number().nonnegative(),
  effectiveFrom: z.string().min(1),
  effectiveTo: z.string().nullable().optional(),
  remarks: z.string().optional(),
  status: opsStatusSchema.optional(),
  createdBy: z.string().optional(),
});

export const shopSaleBodySchema = z.object({
  saleNo: z.string().optional(),
  // Derived from the trip (trips.trip_date) — never read from the client.
  saleDate: z.string().optional(),
  shopId: z.number().int().positive().nullable().optional(),
  shopName: z.string().optional(),
  birdTypeId: z.number().int().positive().nullable().optional(),
  birdType: z.string().optional(),
  tripId: z.number().int().positive().nullable().optional(),
  birds: z.number().int().nonnegative().optional(),
  weight: z.number().nonnegative().optional(),
  rate: z.number().nonnegative().optional(),
  // amount is never read by the service (always server-computed from
  // weight × rate) — kept optional here only so a client that still sends
  // it doesn't fail validation; the value itself is always ignored.
  amount: z.number().nonnegative().optional(),
  mortality: z.number().int().nonnegative().optional(),
  remarks: z.string().optional(),
  status: opsStatusSchema.optional(),
  createdBy: z.string().optional(),
});

export const rateEntryBodySchema = z.object({
  tripId: z.number({ required_error: "tripId is required" }).int(),
  rate: z.number({ required_error: "rate is required" }).nonnegative(),
  birdTypeId: z.number().int().nullable().optional(),
  birdType: z.string().optional(),
  remarks: z.string().nullable().optional(),
  createdBy: z.string().optional(),
});

export const rateEntryUpdateSchema = z.object({
  rate: z.number().nonnegative().optional(),
  birdTypeId: z.number().int().nullable().optional(),
  birdType: z.string().optional(),
  remarks: z.string().nullable().optional(),
  updatedBy: z.string().optional(),
});

export const collectionBodySchema = z.object({
  collectionNo: z.string().optional(),
  collectionDate: z.string().min(1),
  shopId: z.number().int().nullable().optional(),
  shopName: z.string().optional(),
  saleId: z.number().int().nullable().optional(),
  tripId: z.number().int().nullable().optional(),
  amountDue: z.number().nonnegative().optional(),
  amountCollected: z.number().nonnegative().optional(),
  paymentMode: z.string().optional(),
  referenceNo: z.string().optional(),
  remarks: z.string().optional(),
  status: opsStatusSchema.optional(),
  createdBy: z.string().optional(),
});

export const fuelExpenseBodySchema = z.object({
  billNo: z.string().optional(),
  billDate: z.string().min(1),
  vehicleId: z.number().int().nullable().optional(),
  vehicleNo: z.string().nullable().optional(),
  driverId: z.number().int().nullable().optional(),
  driverName: z.string().nullable().optional(),
  supervisorId: z.number().int().nullable().optional(),
  supervisorName: z.string().nullable().optional(),
  tripId: z.number().int().nullable().optional(),
  currentMeter: z.number().nonnegative().optional(),
  fuelRate: z.number().nonnegative().optional(),
  liters: z.number().nonnegative().optional(),
  amount: z.number().nonnegative().optional(),
  pumpName: z.string().optional(),
  bunkAddress: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
  imageData: z.string().nullable().optional(),
  imageName: z.string().nullable().optional(),
  imageMime: z.string().nullable().optional(),
  createdBy: z.string().optional(),
});

export const fuelRejectSchema = z.object({
  rejectedBy: z.string().optional(),
  reason: z.string().min(1, "Rejection reason is required"),
});

export const fuelApproveSchema = z.object({
  approvedBy: z.string().optional(),
});

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError(400, "Validation failed", result.error.flatten());
  }
  return result.data;
}

export function assertOpsStatus(status: string): asserts status is (typeof OPS_STATUSES)[number] {
  if (!OPS_STATUSES.includes(status as (typeof OPS_STATUSES)[number])) {
    throw new AppError(400, `Invalid status. Use: ${OPS_STATUSES.join(" | ")}`);
  }
}

export function assertTripStatus(status: string): asserts status is (typeof TRIP_STATUSES)[number] {
  if (!TRIP_STATUSES.includes(status as (typeof TRIP_STATUSES)[number])) {
    throw new AppError(400, `Invalid trip status. Use: ${TRIP_STATUSES.join(" | ")}`);
  }
}

/** Status transition helpers for soft-delete / approval */
export function approvalFields(status: string, patch: {
  approvedBy?: string;
  rejectedBy?: string;
  rejectedReason?: string;
  reason?: string;
}) {
  if (status === "Approved") {
    return {
      approved_by: patch.approvedBy ?? "system",
      approved_at: new Date().toISOString(),
      rejected_by: null,
      rejected_at: null,
      rejected_reason: null,
    };
  }
  if (status === "Rejected") {
    return {
      rejected_by: patch.rejectedBy ?? patch.approvedBy ?? "system",
      rejected_at: new Date().toISOString(),
      rejected_reason: patch.rejectedReason ?? patch.reason ?? null,
    };
  }
  if (status === "Deleted") {
    return {
      deleted: true,
      deleted_reason: patch.reason ?? patch.rejectedReason ?? null,
    };
  }
  return {};
}
