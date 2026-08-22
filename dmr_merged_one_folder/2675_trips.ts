import { z } from "zod";
import { AppError } from "../middleware/errorHandler.js";
import type { TripWizardStep } from "../utils/tripResume.js";

/** Empty/blank → null. Numeric 0 is preserved (not coerced to null). */
function emptyToNullNumber(v: unknown): unknown {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") {
    return Number.isFinite(v) ? v : null;
  }
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : v;
  }
  return v;
}

const boxDetailSchema = z.object({
  boxNo: z.preprocess(emptyToNullNumber, z.number().int().positive()),
  birds: z.preprocess(emptyToNullNumber, z.number().int().nonnegative().optional()),
  weight: z.preprocess(emptyToNullNumber, z.number().nonnegative().optional()),
  avgWeight: z.preprocess(emptyToNullNumber, z.number().nonnegative().nullable().optional()),
});

// Used for autosave (very permissive)
const requiredPositiveId = (message: string) =>
  z.preprocess(
    emptyToNullNumber,
    z
      .number({ required_error: message, invalid_type_error: message })
      .int()
      .positive(message)
  );

const deliverySchema = z.object({
  id: z.coerce.number().int().optional(),
  serialNo: z.preprocess(emptyToNullNumber, z.number().int().nullable().optional()),
  boxNo: z.preprocess(emptyToNullNumber, z.number().int().nullable().optional()),
  shopId: z.preprocess(emptyToNullNumber, z.number().int().nullable().optional()),
  shopName: z.string().optional(),
  birdTypeId: z.preprocess(emptyToNullNumber, z.number().int().nullable().optional()),
  birdType: z.string().optional(),
  birds: z.preprocess(emptyToNullNumber, z.number().int().nonnegative("Bird count cannot be negative").optional()),
  weight: z.preprocess(emptyToNullNumber, z.number().nonnegative("Weight cannot be negative").optional()),
  mortality: z.preprocess(emptyToNullNumber, z.number().int().nonnegative("Mortality cannot be negative").optional()),
  mortKg: z.preprocess(emptyToNullNumber, z.number().nonnegative("Mortality weight cannot be negative").nullable().optional()),
  rate: z.preprocess(emptyToNullNumber, z.number().nonnegative().nullable().optional()),
  // Amount is computed server-side from weight × rate when omitted. Do not coerce
  // missing/undefined with z.coerce.number() — that becomes NaN ("Expected number, received nan").
  amount: z.preprocess(emptyToNullNumber, z.number().nonnegative().nullable().optional()),
  remarks: z.string().optional(),
  deliveryMode: z.enum(["box", "weight"]).optional(),
  selectedBoxIds: z.array(z.coerce.number().int()).optional(),
  farmBirds: z.preprocess(emptyToNullNumber, z.number().int().nullable().optional()),
  farmWeight: z.preprocess(emptyToNullNumber, z.number().nullable().optional()),
  perBoxData: z.array(boxDetailSchema).optional(),
  autoCaptureTime: z.string().nullable().optional(),
});

// Used by the Step 4 per-shop persistence endpoint (PUT /trips/:id/deliveries).
// Permissive like the autosave deliverySchema (Save Progress must never run
// final-submit validation) but still type/safety-checked: non-negative numbers,
// valid delivery mode, and a bounded array so a malicious payload cannot send
// thousands of rows. `clientKey` carries the frontend's stable idempotency key.
const deliverySaveSchema = z
  .object({
    deliveries: z
      .array(
        deliverySchema.extend({
          clientKey: z.string().max(120).nullable().optional(),
        })
      )
      .max(200),
  })
  .passthrough();

const dieselEntrySchema = z.object({
  id: z.coerce.number().int().optional(),
  rowIndex: z.coerce.number().int().nonnegative(),
  litres: z.coerce.number().nonnegative().nullable().optional(),
  rate: z.coerce.number().nonnegative().nullable().optional(),
  amount: z.coerce.number().nonnegative().nullable().optional(),
  meter: z.coerce.number().nonnegative().nullable().optional(),
  bunkName: z.string().nullable().optional(),
  bunkGps: z.string().nullable().optional(),
  gpsLat: z.coerce.number().nullable().optional(),
  gpsLon: z.coerce.number().nullable().optional(),
  gpsAccuracy: z.coerce.number().nonnegative().nullable().optional(),
  gpsCapturedAt: z.string().nullable().optional(),
  imageData: z.string().nullable().optional(),
  imageName: z.string().nullable().optional(),
  submitted: z.boolean().optional(),
  submittedAt: z.string().nullable().optional(),
  clientKey: z.string().max(120).nullable().optional(),
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
const stepValidators: Record<TripWizardStep, z.ZodType<unknown>> = {
  start: z
    .object({
      tripDate: z.string().min(1),
      vehicleId: z.coerce
        .number({ required_error: "Vehicle is required", invalid_type_error: "Vehicle is required" })
        .int()
        .positive("Vehicle is required"),
      driverId: z.coerce
        .number({ required_error: "Driver is required", invalid_type_error: "Driver is required" })
        .int()
        .positive("Driver is required"),
      supervisorId: z.coerce
        .number({ required_error: "Supervisor is required", invalid_type_error: "Supervisor is required" })
        .int()
        .positive("Supervisor is required"),
      helpers: z
        .array(z.string().trim().min(1))
        .min(1, "Please add at least one Helper."),
      loaders: z
        .array(z.string().trim().min(1))
        .min(1, "Please add at least one Loader."),
      // Empty/blank → NULL. Explicit 0 stays 0 (meter ledger decides if 0 is valid).
      openingMeter: z.preprocess(emptyToNullNumber, z.number().nonnegative().nullable().optional()),
      advanceAmount: z.preprocess(emptyToNullNumber, z.number().nonnegative().nullable().optional()),
      startTime: z.string().optional(),
    })
    .passthrough(),
  farm: z
    .object({
      sourceFarmId: z.coerce.number().int().positive("Farm is required"),
      destMeter: z.coerce.number().positive("Farm meter is required"),
      farmAddress: z.string().trim().min(1, "Farm address is required."),
      // reached_time is never sent by the frontend (backend captures it) — but
      // tolerate a null in case a legacy client sends one.
      reachedTime: z.string().nullable().optional(),
      // Tolls may legitimately be 0. Negative values are normalized to 0.
      pickupTolls: z.preprocess(
        (v) => (v == null || v === "" ? 0 : Math.max(0, Number(v))),
        z.coerce.number().nonnegative()
      ),
      avgBirdWeight: z.coerce.number().positive("Average Bird Weight is required"),
      farmGpsLat: z.coerce.number().nullable().optional(),
      farmGpsLon: z.coerce.number().nullable().optional(),
      farmGpsAccuracy: z.coerce.number().nonnegative().nullable().optional(),
      farmGpsTime: z.string().nullable().optional(),
    })
    .passthrough()
    .refine(
      (data) => {
        if (data.farmGpsLat != null && (data.farmGpsLat < -90 || data.farmGpsLat > 90)) return false;
        if (data.farmGpsLon != null && (data.farmGpsLon < -180 || data.farmGpsLon > 180)) return false;
        return true;
      },
      { message: "Invalid GPS coordinates", path: ["farmGpsLat"] }
    ),
  pickup: z
    .object({
      dcWeight: z.coerce.number().positive().optional(),
      totalBirds: z.coerce.number().int().positive().optional(),
      boxes: z.coerce.number().int().positive().optional(),
      boxDetails: z.array(boxDetailSchema).min(1),
      dcPhotoKey: z.string().optional(),
      dcPhotoKey2: z.string().optional(),
      dcPhotoData: z.string().optional(),
      dcPhotoData2: z.string().optional(),
    })
    .passthrough(),
  deliveries: z
    .object({
      deliveries: z.array(
        deliverySchema.extend({
          shopId: requiredPositiveId("Shop is required for a delivery"),
          birdTypeId: requiredPositiveId("Bird Type is required."),
          amount: z.preprocess(emptyToNullNumber, z.number().nonnegative().nullable().optional()),
        })
      ).min(1, "At least one delivery is required"),
    })
    .passthrough()
    .refine(
      (data) =>
        Array.isArray(data.deliveries) &&
        data.deliveries.every(
          (d: Record<string, unknown>) =>
            Number(d.birds) > 0 &&
            Number(d.weight) > 0 &&
            Number(d.mortality) >= 0
        ),
      {
        message:
          "Every shop delivery must have delivered birds and delivered weight greater than zero before submitting.",
        path: ["deliveries"],
      }
    ),
  expenses: z
    .object({
      closingMeter: z.coerce.number().nonnegative().optional(),
      endMeter: z.coerce.number().nonnegative().optional(),
      destinationTolls: z.coerce.number().nonnegative().optional(),
      deliveryTolls: z.coerce.number().nonnegative().optional(),
      endTime: z.string().optional(),
    })
    .passthrough()
    .refine((data) => data.closingMeter != null || data.endMeter != null, {
      message: "Either closingMeter or endMeter must be provided to finish the trip",
      path: ["closingMeter"],
    }),
};

export function parseTripAutosave(body: unknown) {
  const result = tripAutosaveSchema.safeParse(body);
  if (!result.success) {
    throw new AppError(400, "Invalid trip payload", result.error.flatten());
  }
  return result.data;
}

export function parseDeliverySave(body: unknown) {
  const result = deliverySaveSchema.safeParse(body);
  if (!result.success) {
    const flattened = result.error.flatten();
    const firstMessage = firstValidationMessage(result, "deliveries");
    throw new AppError(400, firstMessage ?? "Invalid delivery payload", flattened);
  }
  return result.data as { deliveries: Array<Record<string, unknown>> };
}

export function validateStepSubmit(step: TripWizardStep, body: unknown) {
  const schema = stepValidators[step];
  const result = schema.safeParse(body);
  if (!result.success) {
    // Surface the first specific field error (e.g. "DC Photo is required.")
    // so the client can show a useful message instead of a generic one.
    const flattened = result.error.flatten();
    const firstMessage = firstValidationMessage(result, step);
    throw new AppError(
      422,
      firstMessage ?? `Step "${step}" validation failed`,
      flattened
    );
  }
  return result.data as Record<string, unknown>;
}

function firstValidationMessage(
  result: z.SafeParseError<unknown>,
  step: TripWizardStep
): string | null {
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

const TRIP_STATUS_TRANSITIONS: Record<string, string[]> = {
  Draft: ["Pending", "Deleted"],
  Pending: ["Completed", "Draft", "Deleted"],
  Completed: ["Deleted"],
  Deleted: [],
};

export function assertTripStatusTransition(from: string, to: string) {
  const allowed = TRIP_STATUS_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new AppError(
      422,
      `Cannot change trip status from ${from} to ${to}`,
      { from, to, allowed }
    );
  }
}

export function assertTripReadyForCompletion(flags: {
  startStepSubmitted?: boolean;
  farmStepSubmitted?: boolean;
  pickupStepSubmitted?: boolean;
  deliveryStepSubmitted?: boolean;
  expensesStepSubmitted?: boolean;
}) {
  const missing: string[] = [];
  if (!flags.startStepSubmitted) missing.push("start");
  if (!flags.farmStepSubmitted) missing.push("farm");
  if (!flags.pickupStepSubmitted) missing.push("pickup");
  if (!flags.deliveryStepSubmitted) missing.push("deliveries");
  if (!flags.expensesStepSubmitted) missing.push("expenses");

  if (missing.length) {
    throw new AppError(422, "Trip wizard is incomplete", { missingSteps: missing });
  }
}