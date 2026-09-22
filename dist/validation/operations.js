import { z } from "zod";
import { AppError } from "../middleware/errorHandler.js";
export const OPS_STATUSES = [
    "Draft",
    "Pending Approval",
    "Approved",
    "Rejected",
    "Deleted",
];
/** PostgreSQL trip_status enum â€” source of truth */
export const TRIP_STATUSES = ["Draft", "Pending", "Completed", "Deleted"];
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
/**
 * Shop Sales rate-edit range. Rate Entry's own "Save & Lock" flow gets a
 * trip into Shop Sales, but locking is NOT rate immutability â€” within the
 * 10-day Shop Sales edit window (tripDeliverySync.ts assertTripEditable),
 * the shop-wise rate may still be corrected, subject to this same
 * â‚¹50â€“â‚¹300 range the Rate Entry UI has always used. After the window
 * closes, assertTripEditable already rejects every field, rate included.
 */
export const MIN_SHOP_SALE_RATE = 50;
export const MAX_SHOP_SALE_RATE = 300;
export function assertShopSaleRateInRange(rate) {
    if (rate < MIN_SHOP_SALE_RATE || rate > MAX_SHOP_SALE_RATE) {
        throw new AppError(400, `Rate must be between â‚¹${MIN_SHOP_SALE_RATE} and â‚¹${MAX_SHOP_SALE_RATE} (got â‚¹${rate}).`);
    }
}
export const shopSaleBodySchema = z.object({
    saleNo: z.string().optional(),
    // Derived from the trip (trips.trip_date) â€” never read from the client.
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
    // weight Ã— rate) â€” kept optional here only so a client that still sends
    // it doesn't fail validation; the value itself is always ignored.
    amount: z.number().nonnegative().optional(),
    mortality: z.number().int().nonnegative().optional(),
    remarks: z.string().optional(),
    status: opsStatusSchema.optional(),
    createdBy: z.string().optional(),
});
/** One shop-wise rate line, applied to an existing trip_deliveries row. */
export const rateEntryDeliverySchema = z.object({
    id: z.number({ required_error: "delivery id is required" }).int().positive(),
    rate: z.number({ required_error: "rate is required" }).positive("rate must be greater than 0"),
});
export const rateEntryBodySchema = z.object({
    tripId: z.number({ required_error: "tripId is required" }).int(),
    rate: z.number({ required_error: "rate is required" }).nonnegative(),
    birdTypeId: z.number().int().nullable().optional(),
    birdType: z.string().optional(),
    remarks: z.string().nullable().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
    // Shop-wise rates for this trip's deliveries (trip_deliveries rows). Not
    // required on every save â€” a trip can be saved incrementally â€” but every
    // line supplied must reference a real, active delivery on the trip and
    // carry a positive rate; duplicates are rejected.
    deliveries: z
        .array(rateEntryDeliverySchema)
        .optional()
        .superRefine((rows, ctx) => {
        if (!rows)
            return;
        const seen = new Set();
        for (const row of rows) {
            if (seen.has(row.id)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Duplicate rate entry for delivery ${row.id}`,
                });
            }
            seen.add(row.id);
        }
    }),
});
export const rateEntryUpdateSchema = z.object({
    rate: z.number().nonnegative().optional(),
    birdTypeId: z.number().int().nullable().optional(),
    birdType: z.string().optional(),
    remarks: z.string().nullable().optional(),
    updatedBy: z.string().optional(),
    deliveries: z.array(rateEntryDeliverySchema).optional(),
});
export const rateEntryLockSchema = z.object({
    lockedBy: z.string().optional(),
});
/**
 * Rate Entry payload.
 *
 * Each row targets an existing `trip_deliveries.id`. Only `rate` is accepted —
 * amount is ALWAYS derived server-side as ROUND(weight * rate, 2).
 */
export const rateEntryItemSchema = z.object({
    deliveryId: z.number().int().positive(),
    rate: z
        .number()
        .min(MIN_SHOP_SALE_RATE, `Rate must be between ₹${MIN_SHOP_SALE_RATE} and ₹${MAX_SHOP_SALE_RATE}`)
        .max(MAX_SHOP_SALE_RATE, `Rate must be between ₹${MIN_SHOP_SALE_RATE} and ₹${MAX_SHOP_SALE_RATE}`),
});
export const rateEntrySaveSchema = z.object({
    /** Partial list — only deliveries included are updated. */
    rates: z.array(rateEntryItemSchema).min(1),
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
    gpsLat: z.number().min(-90).max(90).nullable().optional(),
    gpsLon: z.number().min(-180).max(180).nullable().optional(),
    gpsAccuracy: z.number().nonnegative().nullable().optional(),
    gpsCapturedAt: z.string().datetime().nullable().optional(),
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
export function parseBody(schema, body) {
    const result = schema.safeParse(body);
    if (!result.success) {
        throw new AppError(400, "Validation failed", result.error.flatten());
    }
    return result.data;
}
export function assertOpsStatus(status) {
    if (!OPS_STATUSES.includes(status)) {
        throw new AppError(400, `Invalid status. Use: ${OPS_STATUSES.join(" | ")}`);
    }
}
export function assertTripStatus(status) {
    if (!TRIP_STATUSES.includes(status)) {
        throw new AppError(400, `Invalid trip status. Use: ${TRIP_STATUSES.join(" | ")}`);
    }
}
/** Status transition helpers for soft-delete / approval */
export function approvalFields(status, patch) {
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
//# sourceMappingURL=operations.js.map