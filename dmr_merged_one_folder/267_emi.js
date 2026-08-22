/** Fleet → EMI request validation. */
import { z } from "zod";
import { parseBody } from "./operations.js";
const isDateString = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());
/**
 * Create body — mirrors the existing EMI data model the page already uses:
 * every field visible in the EMI table is derived server-side from
 * loanAmount / totalEMIs / startDate (plus the vehicle master's emi_day), so
 * the caller never sends derived values. Vehicle + finance facts are the only
 * required inputs, matching the Vehicle Master fields the page reads today.
 */
export const emiCreateSchema = z.object({
    vehicleId: z.number().int(),
    financeCompany: z.string().min(1, "Finance company is required").max(200),
    loanAmount: z.number().nonnegative("Loan amount must not be negative"),
    totalEMIs: z.number().int().positive("Total EMIs must be a positive integer"),
    startDate: z
        .string()
        .min(1, "Start date is required")
        .refine(isDateString, "Start date must be a valid YYYY-MM-DD value"),
    /** Optional — when absent the service derives endDate = startDate + totalEMIs months. */
    endDate: z
        .string()
        .refine(isDateString, "End date must be a valid YYYY-MM-DD value")
        .optional(),
    /** Optional — when absent the service derives emiAmount = round(loanAmount / totalEMIs). */
    emiAmount: z.number().nonnegative().optional(),
    createdBy: z.string().optional(),
});
/** Update body — everything optional; vehicle reassignment is not supported
 * (the EMI record is keyed to its vehicle). */
export const emiUpdateSchema = emiCreateSchema
    .omit({ vehicleId: true })
    .partial();
/** Payment body — marking the next pending installment as paid. */
export const emiPaySchema = z.object({
    paidBy: z.string().optional(),
});
export { parseBody };
//# sourceMappingURL=emi.js.map