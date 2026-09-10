/** Fleet → EMI request validation. */
import { z } from "zod";
import { parseBody } from "./operations.js";
/**
 * Create body — mirrors the existing EMI data model the page already uses:
 * every field visible in the EMI table is derived server-side from
 * loanAmount / totalEMIs / startDate (plus the vehicle master's emi_day), so
 * the caller never sends derived values. Vehicle + finance facts are the only
 * required inputs, matching the Vehicle Master fields the page reads today.
 */
export declare const emiCreateSchema: z.ZodObject<{
    vehicleId: z.ZodNumber;
    financeCompany: z.ZodString;
    loanAmount: z.ZodNumber;
    totalEMIs: z.ZodNumber;
    startDate: z.ZodEffects<z.ZodString, string, string>;
    createdBy: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    totalEMIs: number;
    vehicleId: number;
    financeCompany: string;
    loanAmount: number;
    startDate: string;
    createdBy?: string | undefined;
}, {
    totalEMIs: number;
    vehicleId: number;
    financeCompany: string;
    loanAmount: number;
    startDate: string;
    createdBy?: string | undefined;
}>;
/** Update body — everything optional; vehicle reassignment is not supported
 * (the EMI record is keyed to its vehicle). */
export declare const emiUpdateSchema: z.ZodObject<{
    totalEMIs: z.ZodOptional<z.ZodNumber>;
    createdBy: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    financeCompany: z.ZodOptional<z.ZodString>;
    loanAmount: z.ZodOptional<z.ZodNumber>;
    startDate: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
}, "strip", z.ZodTypeAny, {
    totalEMIs?: number | undefined;
    createdBy?: string | undefined;
    financeCompany?: string | undefined;
    loanAmount?: number | undefined;
    startDate?: string | undefined;
}, {
    totalEMIs?: number | undefined;
    createdBy?: string | undefined;
    financeCompany?: string | undefined;
    loanAmount?: number | undefined;
    startDate?: string | undefined;
}>;
/** Payment body — marking the next pending installment as paid. */
export declare const emiPaySchema: z.ZodObject<{
    paidBy: z.ZodOptional<z.ZodString>;
    idempotencyKey: z.ZodString;
}, "strip", z.ZodTypeAny, {
    idempotencyKey: string;
    paidBy?: string | undefined;
}, {
    idempotencyKey: string;
    paidBy?: string | undefined;
}>;
export { parseBody };
