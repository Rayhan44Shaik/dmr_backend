import { z } from "zod";
import { AppError } from "../middleware/errorHandler.js";
import type { TripWizardStep } from "../utils/tripResume.js";

const boxDetailSchema = z.object({
  boxNo: z.number().int().positive(),
  birds: z.number().int().nonnegative().optional(),
  weight: z.number().nonnegative().optional(),
});

const deliverySchema = z.object({
  id: z.number().int().optional(),
  serialNo: z.number().int().nullable().optional(),
  boxNo: z.number().int().nullable().optional(),
  shopId: z.number().int().nullable().optional(),
  shopName: z.string().optional(),
  birdTypeId: z.number().int().nullable().optional(),
  birdType: z.string().optional(),
  birds: z.number().int().nonnegative().optional(),
  weight: z.number().nonnegative().optional(),
  mortality: z.number().int().nonnegative().optional(),
  mortKg: z.number().nonnegative().nullable().optional(),
  rate: z.number().nonnegative().nullable().optional(),
  amount: z.number().nonnegative().optional(),
  remarks: z.string().optional(),
  deliveryMode: z.enum(["box", "weight"]).optional(),
  selectedBoxIds: z.array(z.number().int()).optional(),
  farmBirds: z.number().int().nullable().optional(),
  farmWeight: z.number().nullable().optional(),
  perBoxData: z.array(boxDetailSchema).optional(),
  autoCaptureTime: z.string().nullable().optional(),
});

const dieselEntrySchema = z.object({
  rowIndex: z.number().int().nonnegative(),
  litres: z.number().nonnegative().nullable().optional(),
  rate: z.number().nonnegative().nullable().optional(),
  meter: z.number().nonnegative().nullable().optional(),
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
    vehicleId: z.number().int().nullable().optional(),
    driverId: z.number().int().nullable().optional(),
    supervisorId: z.number().int().nullable().optional(),
    sourceFarmId: z.number().int().nullable().optional(),
    farmBirdTypeId: z.number().int().nullable().optional(),
    helpers: z.array(z.string()).optional(),
    loaders: z.array(z.string()).optional(),
    boxDetails: z.array(boxDetailSchema).optional(),
    deliveries: z.array(deliverySchema).optional(),
    dieselEntries: z.array(dieselEntrySchema).optional(),
  })
  .passthrough();

const stepValidators: Record<TripWizardStep, z.ZodType<unknown>> = {
  start: z
    .object({
      tripDate: z.string().min(1),
      vehicleId: z.number().int(),
      driverId: z.number().int(),
      supervisorId: z.number().int(),
      openingMeter: z.number().nonnegative(),
      advanceAmount: z.number().nonnegative().optional(),
      startTime: z.string().optional(),
    })
    .passthrough(),
  farm: z
    .object({
      sourceFarmId: z.number().int(),
      destMeter: z.number().nonnegative(),
      reachedTime: z.string().optional(),
      pickupTolls: z.number().nonnegative().optional(),
      farmBirdTypeId: z.number().int().optional(),
      farmBirdCount: z.number().int().positive().optional(),
      farmLoadWeight: z.number().positive().optional(),
      farmRate: z.number().nonnegative().optional(),
    })
    .passthrough(),
  pickup: z
    .object({
      dcWeight: z.number().positive(),
      totalBirds: z.number().int().positive(),
      boxes: z.number().int().positive(),
      boxDetails: z.array(boxDetailSchema).min(1),
    })
    .passthrough(),
  deliveries: z
    .object({
      deliveries: z.array(deliverySchema).min(1),
    })
    .passthrough(),
  expenses: z
    .object({
      closingMeter: z.number().nonnegative().optional(),
      endMeter: z.number().nonnegative().optional(),
      endTime: z.string().optional(),
    })
    .passthrough(),
};

export function parseTripAutosave(body: unknown) {
  const result = tripAutosaveSchema.safeParse(body);
  if (!result.success) {
    throw new AppError(400, "Invalid trip payload", result.error.flatten());
  }
  return result.data;
}

export function validateStepSubmit(step: TripWizardStep, body: unknown) {
  const schema = stepValidators[step];
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError(422, `Step "${step}" validation failed`, result.error.flatten());
  }
  return result.data as Record<string, unknown>;
}

/** Allowed trip status transitions for approval workflow */
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
