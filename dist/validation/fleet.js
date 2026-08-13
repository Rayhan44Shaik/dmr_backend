/** Fleet module request validation (Fleet → Entry / History). */
import { z } from "zod";
import { parseBody } from "./operations.js";
const isDateString = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());
export const fleetMaintenancePartSchema = z.object({
    name: z.string().min(1, "Part name is required"),
    specification: z.string().optional(),
    quantity: z.number().int().nonnegative().default(0),
    rate: z.number().nonnegative().default(0),
    amount: z.number().nonnegative().optional(),
});
export const fleetMaintenanceBodySchema = z.object({
    billNo: z.string().optional(),
    date: z
        .string()
        .min(1, "Date is required")
        .refine(isDateString, "Date must be a valid YYYY-MM-DD value"),
    vehicleId: z.number().int(),
    vehicleNo: z.string().nullable().optional(),
    driverId: z.number().int().nullable().optional(),
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
});
/** Update body — everything optional; removeDocumentIds lets the caller
 * explicitly remove existing documents during an update (never silently). */
export const fleetMaintenanceUpdateSchema = fleetMaintenanceBodySchema
    .partial()
    .extend({
    removeDocumentIds: z.array(z.number().int().nonnegative()).optional(),
});
export const fleetMaintenanceApproveSchema = z.object({
    approvedBy: z.string().optional(),
});
export const fleetMaintenanceRejectSchema = z.object({
    rejectedBy: z.string().optional(),
    reason: z.string().min(1, "Rejection reason is required"),
});
export { parseBody };
//# sourceMappingURL=fleet.js.map