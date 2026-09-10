/** Fleet module request validation (Fleet → Entry / History). */
import { z } from "zod";
import { parseBody } from "./operations.js";
import { isValidDateOnly } from "../utils/dateValidation.js";

export const fleetMaintenancePartSchema = z.object({
  name: z.string().min(1, "Part name is required"),
  specification: z.string().optional(),
  quantity: z.number().int().nonnegative().default(0),
  rate: z.number().nonnegative().default(0),
  amount: z.number().nonnegative().optional(),
});

export const fleetMaintenanceBodySchema = z.object({
  date: z
    .string()
    .min(1, "Date is required")
    .refine(isValidDateOnly, "Date must be a valid YYYY-MM-DD value"),
  vehicleId: z.number().int().positive(),
  vehicleNo: z.string().nullable().optional(),
  driverId: z.number().int().positive().nullable().optional(),
  driverName: z.string().nullable().optional(),
  currentKM: z.number().nonnegative(),
  nextServiceKM: z.number().nonnegative().nullable().optional(),
  maintenanceType: z.union([z.string().min(1), z.array(z.string())]),
  serviceType: z.string().min(1, "Service type is required"),
  garage: z.string().optional(),
  mechanic: z.string().optional(),
  parts: z.array(fleetMaintenancePartSchema).optional(),
  totalCost: z.number().nonnegative().optional(),
  remarks: z.string().nullable().optional(),
  createdBy: z.string().optional(),
  idempotencyKey: z.string().uuid().optional(),
});

/** Update body — everything optional; removeDocumentIds lets the caller
 * explicitly remove existing documents during an update (never silently). */
export const fleetMaintenanceUpdateSchema = fleetMaintenanceBodySchema
  .partial()
  .extend({
    removeDocumentIds: z.array(z.number().int().positive()).max(5).optional(),
  });

export const fleetMaintenanceApproveSchema = z.object({
  approvedBy: z.string().optional(),
});

export const fleetMaintenanceRejectSchema = z.object({
  rejectedBy: z.string().optional(),
  reason: z.string().min(1, "Rejection reason is required"),
});

export { parseBody };
