import { z } from "zod";
import { AppError } from "../middleware/errorHandler.js";
const boxDetailSchema = z.object({
    boxNo: z.coerce.number().int().positive(),
    birds: z.coerce.number().int().nonnegative().optional(),
    weight: z.coerce.number().nonnegative().optional(),
});
// Used for autosave (very permissive)
const deliverySchema = z.object({
    id: z.coerce.number().int().optional(),
    serialNo: z.coerce.number().int().nullable().optional(),
    boxNo: z.coerce.number().int().nullable().optional(),
    shopId: z.coerce.number().int().nullable().optional(),
    shopName: z.string().optional(),
    birdTypeId: z.coerce.number().int().nullable().optional(),
    birdType: z.string().optional(),
    birds: z.coerce.number().int().nonnegative().optional(),
    weight: z.coerce.number().nonnegative().optional(),
    mortality: z.coerce.number().int().nonnegative().optional(),
    mortKg: z.coerce.number().nonnegative().nullable().optional(),
    rate: z.coerce.number().nonnegative().nullable().optional(),
    amount: z.coerce.number().nonnegative().optional(),
    remarks: z.string().optional(),
    deliveryMode: z.enum(["box", "weight"]).optional(),
    selectedBoxIds: z.array(z.coerce.number().int()).optional(),
    farmBirds: z.coerce.number().int().nullable().optional(),
    farmWeight: z.coerce.number().nullable().optional(),
    perBoxData: z.array(boxDetailSchema).optional(),
    autoCaptureTime: z.string().nullable().optional(),
});
const dieselEntrySchema = z.object({
    rowIndex: z.coerce.number().int().nonnegative(),
    litres: z.coerce.number().nonnegative().nullable().optional(),
    rate: z.coerce.number().nonnegative().nullable().optional(),
    meter: z.coerce.number().nonnegative().nullable().optional(),
    bunkName: z.string().nullable().optional(),
    bunkGps: z.string().nullable().optional(),
    imageData: z.string().nullable().optional(),
    imageName: z.string().nullable().optional(),
});
export const tripAutosaveSchema = z
    .object({
    tripDate: z.string().optional(),
    tripNo: z.string().optional(),
    status: z.enum(["Draft", "Pending", "Completed", "Deleted"]).optional(),
    updatedAt: z.string().optional(),
    expectedUpdatedAt: z.string().optional(),
    vehicleId: z.coerce.number().int().nullable().optional(),
    driverId: z.coerce.number().int().nullable().optional(),
    supervisorId: z.coerce.number().int().nullable().optional(),
    sourceFarmId: z.coerce.number().int().nullable().optional(),
    farmBirdTypeId: z.coerce.number().int().nullable().optional(),
    helpers: z.array(z.string()).optional(),
    loaders: z.array(z.string()).optional(),
    boxDetails: z.array(boxDetailSchema).optional(),
    deliveries: z.array(deliverySchema).optional(),
    dieselEntries: z.array(dieselEntrySchema).optional(),
})
    .passthrough();
// Used for actual Step submission (Strict validation)
const stepValidators = {
    start: z
        .object({
        tripDate: z.string().min(1),
        // FIXED: Moved required_error inside z.coerce.number() instead of .int()
        vehicleId: z.coerce.number({ required_error: "Vehicle is required" }).int(),
        driverId: z.coerce.number({ required_error: "Driver is required" }).int(),
        supervisorId: z.coerce.number({ required_error: "Supervisor is required" }).int(),
        openingMeter: z.coerce.number({ required_error: "Opening meter is required" }).nonnegative(),
        advanceAmount: z.coerce.number().nonnegative().optional(),
        startTime: z.string().optional(),
    })
        .passthrough(),
    farm: z
        .object({
        sourceFarmId: z.coerce.number().int(),
        destMeter: z.coerce.number().nonnegative(),
        reachedTime: z.string().optional(),
        pickupTolls: z.coerce.number().nonnegative().optional(),
        farmBirdTypeId: z.coerce.number().int().optional(),
        farmBirdCount: z.coerce.number().int().positive().optional(),
        farmLoadWeight: z.coerce.number().positive().optional(),
        farmRate: z.coerce.number().nonnegative().optional(),
    })
        .passthrough(),
    pickup: z
        .object({
        dcWeight: z.coerce.number().positive(),
        totalBirds: z.coerce.number().int().positive(),
        boxes: z.coerce.number().int().positive(),
        boxDetails: z.array(boxDetailSchema).min(1),
        dcPhotoKey: z.string().min(1, "DC Photo is required."),
    })
        .passthrough(),
    deliveries: z
        .object({
        deliveries: z.array(deliverySchema.extend({
            // FIXED: Moved required_error inside z.coerce.number()
            shopId: z.coerce.number({ required_error: "Shop is required for a delivery" }).int(),
            amount: z.coerce.number({ required_error: "Amount is required" }).nonnegative(),
        })).min(1, "At least one delivery is required"),
    })
        .passthrough(),
    expenses: z
        .object({
        closingMeter: z.coerce.number().nonnegative().optional(),
        endMeter: z.coerce.number().nonnegative().optional(),
        endTime: z.string({ required_error: "End time is required" }),
    })
        .passthrough()
        .refine((data) => data.closingMeter != null || data.endMeter != null, {
        message: "Either closingMeter or endMeter must be provided to finish the trip",
        path: ["closingMeter"],
    }),
};
export function parseTripAutosave(body) {
    const result = tripAutosaveSchema.safeParse(body);
    if (!result.success) {
        throw new AppError(400, "Invalid trip payload", result.error.flatten());
    }
    return result.data;
}
export function validateStepSubmit(step, body) {
    const schema = stepValidators[step];
    const result = schema.safeParse(body);
    if (!result.success) {
        // Surface the first specific field error (e.g. "DC Photo is required.")
        // so the client can show a useful message instead of a generic one.
        const flattened = result.error.flatten();
        const firstMessage = firstValidationMessage(result, step);
        throw new AppError(422, firstMessage ?? `Step "${step}" validation failed`, flattened);
    }
    return result.data;
}
function firstValidationMessage(result, step) {
    for (const fieldErrors of Object.values(result.error.flatten().fieldErrors)) {
        if (Array.isArray(fieldErrors) && fieldErrors.length > 0) {
            return fieldErrors[0];
        }
    }
    const firstIssue = result.error.issues[0];
    if (firstIssue) {
        return firstIssue.message;
    }
    return `Step "${step}" includes invalid data.`;
}
const TRIP_STATUS_TRANSITIONS = {
    Draft: ["Pending", "Deleted"],
    Pending: ["Completed", "Draft", "Deleted"],
    Completed: ["Deleted"],
    Deleted: [],
};
export function assertTripStatusTransition(from, to) {
    const allowed = TRIP_STATUS_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
        throw new AppError(422, `Cannot change trip status from ${from} to ${to}`, { from, to, allowed });
    }
}
export function assertTripReadyForCompletion(flags) {
    const missing = [];
    if (!flags.startStepSubmitted)
        missing.push("start");
    if (!flags.farmStepSubmitted)
        missing.push("farm");
    if (!flags.pickupStepSubmitted)
        missing.push("pickup");
    if (!flags.deliveryStepSubmitted)
        missing.push("deliveries");
    if (!flags.expensesStepSubmitted)
        missing.push("expenses");
    if (missing.length) {
        throw new AppError(422, "Trip wizard is incomplete", { missingSteps: missing });
    }
}
//# sourceMappingURL=trips.js.map