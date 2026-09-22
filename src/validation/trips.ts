import { z } from "zod";
import { AppError } from "../middleware/errorHandler.js";
import type { TripWizardStep } from "../utils/tripResume.js";
import { isValidDateOnly } from "../utils/dateValidation.js";
import {
  businessTodayDateOnly,
  resolveTripDateForNumbering,
  TRIP_DATE_MAX_FUTURE_DAYS,
  TRIP_DATE_MAX_PAST_DAYS,
} from "../utils/tripNumbering.js";

const boxDetailSchema = z.object({
  boxNo: z.coerce.number().int().positive().max(10_000),
  birds: z.coerce.number().int().nonnegative().max(1_000_000).optional(),
  weight: z.coerce.number().nonnegative().max(10_000_000).optional(),
});

const idSchema = z.coerce.number().int().positive();
const shortText = z.string().trim().max(200);
const crewNames = z.array(z.string().trim().min(1).max(120)).min(1).max(50)
  .refine((values) => new Set(values.map((value) => value.toLocaleLowerCase())).size === values.length, {
    message: "Crew members must not be duplicated",
  });
const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format")
  .refine((value) => isValidDateOnly(value), { message: "Date must be a real calendar day" });

const tripBusinessDateSchema = dateOnlySchema.superRefine((value, ctx) => {
  try {
    resolveTripDateForNumbering(value, { required: true });
  } catch (err) {
    const message =
      err instanceof AppError
        ? err.message
        : `Trip date must be within ${TRIP_DATE_MAX_PAST_DAYS} days past and ${TRIP_DATE_MAX_FUTURE_DAYS} days ahead of ${businessTodayDateOnly()}.`;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  }
});

/**
 * Rows that count toward Step 4 submit validation.
 * Pending `[ORDER]` assignment plan stubs (Shops N) are reference-only and
 * must never fail submit for missing bird type / zero birds.
 */
function isCountedDeliveryRow(d: Record<string, unknown>): boolean {
  if (d.autoCaptureTime || d.deliveredAt || d.deliveryTime) return true;
  const boxes = Array.isArray(d.selectedBoxIds) ? d.selectedBoxIds.length : 0;
  if (boxes > 0) return true;
  const remarks = String(d.remarks ?? "").trim();
  if (remarks.startsWith("[ORDER]")) return false;
  return Number(d.birds) > 0 || Number(d.weight) > 0;
}

// Used for autosave (very permissive)
const deliverySchema = z.object({
  id: z.coerce.number().int().optional(),
  serialNo: z.coerce.number().int().nullable().optional(),
  boxNo: z.coerce.number().int().nullable().optional(),
  shopId: z.coerce.number().int().nonnegative().nullable().optional(),
  shopName: shortText.optional(),
  subShopName: shortText.optional(),
  birdTypeId: z.coerce.number().int().nonnegative().nullable().optional(),
  birdType: shortText.optional(),
  birds: z.coerce.number().int().nonnegative("Bird count cannot be negative").max(1_000_000).optional(),
  weight: z.coerce.number().nonnegative("Weight cannot be negative").max(10_000_000).optional(),
  mortality: z.coerce.number().int().nonnegative("Mortality cannot be negative").max(1_000_000).optional(),
  mortKg: z.coerce.number().nonnegative("Mortality weight cannot be negative").max(10_000_000).nullable().optional(),
  rate: z.coerce.number().nonnegative().max(1_000_000).nullable().optional(),
  amount: z.coerce.number().nonnegative().max(1_000_000_000).optional(),
  remarks: z.string().trim().max(1000).optional(),
  deliveryMode: z.enum(["box", "weight"]).optional(),
  selectedBoxIds: z.array(z.coerce.number().int()).optional(),
  farmBirds: z.coerce.number().int().nullable().optional(),
  farmWeight: z.coerce.number().nullable().optional(),
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
  rowIndex: z.coerce.number().int().nonnegative(),
  litres: z.coerce.number().nonnegative().nullable().optional(),
  rate: z.coerce.number().nonnegative().nullable().optional(),
  meter: z.coerce.number().nonnegative().nullable().optional(),
  bunkName: z.string().nullable().optional(),
  bunkSource: z.enum(["MASTER", "OTHER"]).optional(),
  fuelBunkId: z.coerce.number().int().positive().nullable().optional(),
  bunkGps: z.string().nullable().optional(),
  gpsLat: z.coerce.number().min(-90).max(90).nullable().optional(),
  gpsLon: z.coerce.number().min(-180).max(180).nullable().optional(),
  gpsAccuracy: z.coerce.number().nonnegative().nullable().optional(),
  gpsCapturedAt: z.string().nullable().optional(),
  imageData: z.string().nullable().optional(),
  imageName: z.string().nullable().optional(),
  clientKey: z.string().max(120).nullable().optional(),
  submittedAt: z.string().nullable().optional(),
});

export const tripAutosaveSchema = z
  .object({
    tripDate: dateOnlySchema.optional(),
    tripNo: z.string().trim().max(50).optional(),
    status: z.enum(["Draft", "Pending", "Completed", "Deleted"]).optional(),
    updatedAt: z.string().optional(), 
    expectedUpdatedAt: z.string().optional(), 
    vehicleId: z.coerce.number().int().nullable().optional(),
    driverId: z.coerce.number().int().nullable().optional(),
    supervisorId: z.coerce.number().int().nullable().optional(),
    sourceFarmId: z.coerce.number().int().nullable().optional(),
    farmBirdTypeId: z.coerce.number().int().nullable().optional(),
    helpers: crewNames.optional(),
    loaders: crewNames.optional(),
    boxDetails: z.array(boxDetailSchema).optional(),
    deliveries: z.array(deliverySchema).optional(),
    dieselEntries: z.array(dieselEntrySchema).optional(),
  })
  .passthrough();

// Used for actual Step submission (Strict validation)
const stepValidators: Record<TripWizardStep, z.ZodType<unknown>> = {
  start: z
    .object({
      tripDate: tripBusinessDateSchema,
      // FIXED: Moved required_error inside z.coerce.number() instead of .int()
      vehicleId: z.coerce.number({ required_error: "Vehicle is required" }).int().positive(),
      driverId: z.coerce.number({ required_error: "Driver is required" }).int().positive(),
      supervisorId: z.coerce.number({ required_error: "Supervisor is required" }).int().positive(),
      helpers: crewNames,
      loaders: crewNames,
      // Starting Meter / Advance are OPTIONAL. Empty/blank/null must pass through
      // as null so the backend meter validator is skipped (and the value is
      // persisted as NULL). A non-null value is still checked as a number.
      openingMeter: z.preprocess(
        (v) => (typeof v === "string" && v.trim() === "" ? null : v),
        z.number().nonnegative().nullable().optional()
      ),
      advanceAmount: z.preprocess(
        (v) => (typeof v === "string" && v.trim() === "" ? null : v),
        z.number().nonnegative().nullable().optional()
      ),
      startTime: z.string().optional(),
    })
    .passthrough(),
  farm: z
    .object({
      sourceFarmId: idSchema,
      farmAddress: z
        .preprocess(
          (v) => (v == null ? "" : String(v)),
          z.string().trim().max(500).optional()
        )
        .optional(),
      destMeter: z.coerce.number().nonnegative(),
      // reached_time is never sent by the frontend (backend captures it) — but
      // tolerate a null in case a legacy client sends one.
      reachedTime: z.string().nullable().optional(),
      // Tolls may legitimately be 0. Negative values are normalized to 0.
      pickupTolls: z.preprocess(
        (v) => (v == null || v === "" ? undefined : Math.max(0, Number(v))),
        z.coerce.number().nonnegative().optional()
      ),
      // Avg Bird Weight is a Step 2 mandatory submit field (matches the UI).
      avgBirdWeight: z.coerce.number().positive(),
      farmBirdTypeId: idSchema,
      farmBirdCount: z.coerce.number().int().nonnegative().nullable().optional(),
      farmLoadWeight: z.coerce.number().nonnegative().nullable().optional(),
      // GPS — optional capture; ranges validated below when supplied.
      farmGpsLat: z.coerce.number().nullable().optional(),
      farmGpsLon: z.coerce.number().nullable().optional(),
      farmGpsAccuracy: z.coerce.number().nonnegative().nullable().optional(),
      farmGpsTime: z.string().nullable().optional(),
    })
    .passthrough()
    .refine(
      (data) => {
        if (data.farmGpsLat == null || data.farmGpsLon == null) return false;
        if (data.farmGpsLat < -90 || data.farmGpsLat > 90) return false;
        if (data.farmGpsLon < -180 || data.farmGpsLon > 180) return false;
        return data.farmGpsLat !== 0 || data.farmGpsLon !== 0;
      },
      { message: "Invalid GPS coordinates", path: ["farmGpsLat"] }
    ),
  pickup: z
    .object({
      // Totals are OPTIONAL from the client — the backend derives and persists
      // them from the submitted box rows (authoritative).
      dcWeight: z.coerce.number().positive().optional(),
      totalBirds: z.coerce.number().int().positive().optional(),
      boxes: z.coerce.number().int().positive().optional(),
      boxDetails: z.array(boxDetailSchema).min(1),
      dcPhotoKey: z.string().min(1, "DC Photo is required."),
      dcPhotoKey2: z.string().optional(),
    })
    .passthrough()
    .refine(
      (data) => {
        const photoCount = (data.dcPhotoKey ? 1 : 0) + (data.dcPhotoKey2 ? 1 : 0);
        return photoCount >= 1 && photoCount <= 2;
      },
      {
        message: "Step 3 requires between 1 and 2 photos.",
        path: ["dcPhotoKey"],
      }
    ),
  deliveries: z
    .object({
      // Permissive element schema: pending `[ORDER]` plan stubs may lack
      // birdTypeId / delivered birds. Counted rows are enforced in superRefine.
      deliveries: z.array(deliverySchema),
    })
    .passthrough()
    .superRefine((data, ctx) => {
      const rows = Array.isArray(data.deliveries) ? data.deliveries : [];
      const counted = rows.filter((d) => isCountedDeliveryRow(d as Record<string, unknown>));
      if (counted.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "At least one delivery is required",
          path: ["deliveries"],
        });
        return;
      }
      for (let i = 0; i < rows.length; i++) {
        const d = rows[i] as Record<string, unknown>;
        if (!isCountedDeliveryRow(d)) continue;
        if (!(Number(d.shopId) > 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Shop is required for a delivery",
            path: ["deliveries", i, "shopId"],
          });
        }
        if (!(Number(d.birdTypeId) > 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Bird type is required for a delivery",
            path: ["deliveries", i, "birdTypeId"],
          });
        }
        if (!(Number(d.birds) > 0) || !(Number(d.weight) > 0) || !(Number(d.mortality) >= 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "Every shop delivery must have delivered birds and delivered weight greater than zero before submitting.",
            path: ["deliveries", i],
          });
        }
      }
    }),
  expenses: z
    .object({
      closingMeter: z.coerce.number().nonnegative().optional(),
      endMeter: z.coerce.number().nonnegative().optional(),
      // Optional — the server stamps end_time / expenses_step_submitted_at on
      // final submit. The client deliberately does not send browser clocks.
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
