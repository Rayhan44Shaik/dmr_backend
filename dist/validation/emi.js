/** Fleet → EMI request validation. */
import { z } from "zod";
import { parseBody } from "./operations.js";
import { isValidDateOnly } from "../utils/dateValidation.js";
/**
 * Create body — mirrors the existing EMI data model the page already uses:
 * every field visible in the EMI table is derived server-side from
 * loanAmount / totalEMIs / startDate (plus the vehicle master's emi_day), so
 * the caller never sends derived values. Vehicle + finance facts are the only
 * required inputs, matching the Vehicle Master fields the page reads today.
 */
export const emiCreateSchema = z.object({
    vehicleId: z.number().int().positive(),
    financeCompany: z.string().trim().min(1, "Finance company is required").max(200),
    loanAmount: z.number().positive("Loan amount must be greater than zero").max(999_999_999_999.99),
    totalEMIs: z.number().int().positive("Total EMIs must be a positive integer").max(1_200),
    startDate: z
        .string()
        .min(1, "Start date is required")
        .refine(isValidDateOnly, "Start date must be a valid YYYY-MM-DD value"),
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
    idempotencyKey: z.string().uuid("A valid idempotency key is required"),
});
export { parseBody };
//# sourceMappingURL=emi.js.map