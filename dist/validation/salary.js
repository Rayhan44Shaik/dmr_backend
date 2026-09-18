/**
 * Staff → Salary Register request validation.
 *
 * Security model:
 *  - The client can only ever supply the SALARY COMPONENTS (basicSalary,
 *    overtime, incentives, fuelAllowance, nightAllowance, leaveDeduction,
 *    advanceRecovery, loanEMI, latePenalty, otherDeductions). The derived
 *    figures the backend always owns — totalGross, totalDeductions, netSalary —
 *    are deliberately NOT part of any schema, so zod strips them from the
 *    request and the service can never see (or trust) a client-computed total.
 *  - status is never accepted from the client. Only "Pending" may be targeted
 *    through the dedicated status PATCH; the Pending → Paid transition happens
 *    exclusively inside the payment operation (POST /salaries/:id/pay).
 *  - paymentDate / paymentRef / paidAt are never accepted from the client —
 *    they are written by the payment operation.
 *  - money fields are strict finite non-negative numbers with at most two
 *    decimal places: z.number().finite() rejects NaN and ±Infinity, and the
 *    decimal refinement rejects malformed values like 0.123. No floating-point
 *    arithmetic ever happens on persisted money (see salaryCalculationService).
 *
 * Conventions mirror ../validation/payments.ts: zod + parseBody, trimmed
 * strings, explicit *Body/*Query interfaces because z.preprocess widens the
 * inferred output to unknown.
 */
import { z } from "zod";
import { parseBody } from "./operations.js";
import { PAYMENT_MODES } from "../types/payments.js";
const trimmed = (v) => (typeof v === "string" ? v.trim() : v);
const isDateString = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());
const monthString = z
    .preprocess(trimmed, z
    .string()
    .min(1, "month is required")
    .regex(/^\d{4}-\d{2}$/, "month must be in YYYY-MM format")
    .refine((v) => Number(v.slice(5)) >= 1 && Number(v.slice(5)) <= 12, "month must be a valid YYYY-MM value"));
const dateString = z.preprocess(trimmed, z
    .string()
    .min(1, "A date is required")
    .refine(isDateString, "Date must be a valid YYYY-MM-DD value"));
function moneyField(label) {
    return z.number({ invalid_type_error: `${label} must be a number` })
        .finite(`${label} must be finite (NaN / Infinity are not allowed)`)
        .nonnegative(`${label} must not be negative`)
        .refine((v) => Math.round(v * 100) / 100 === v, `${label} must have at most 2 decimal places`);
}
export const salaryCreateSchema = z.object({
    employeeId: z
        .number({
        required_error: "employeeId is required",
        invalid_type_error: "employeeId must be a number",
    })
        .int("employeeId must be an integer")
        .positive("employeeId must be a positive integer"),
    month: monthString,
    basicSalary: moneyField("basicSalary").optional(),
    overtime: moneyField("overtime").optional(),
    incentives: moneyField("incentives").optional(),
    fuelAllowance: moneyField("fuelAllowance").optional(),
    nightAllowance: moneyField("nightAllowance").optional(),
    leaveDeduction: moneyField("leaveDeduction").optional(),
    advanceRecovery: moneyField("advanceRecovery").optional(),
    loanEMI: moneyField("loanEMI").optional(),
    latePenalty: moneyField("latePenalty").optional(),
    otherDeductions: moneyField("otherDeductions").optional(),
});
export const salaryUpdateSchema = z.object({
    basicSalary: moneyField("basicSalary").optional(),
    overtime: moneyField("overtime").optional(),
    incentives: moneyField("incentives").optional(),
    fuelAllowance: moneyField("fuelAllowance").optional(),
    nightAllowance: moneyField("nightAllowance").optional(),
    leaveDeduction: moneyField("leaveDeduction").optional(),
    advanceRecovery: moneyField("advanceRecovery").optional(),
    loanEMI: moneyField("loanEMI").optional(),
    latePenalty: moneyField("latePenalty").optional(),
    otherDeductions: moneyField("otherDeductions").optional(),
});
export const salaryStatusPatchSchema = z.object({
    status: z.literal("Pending", {
        errorMap: () => ({
            message: "Only Pending is allowed here. Pending → Paid happens only through the payment operation.",
        }),
    }),
});
export const salarySubmitSchema = z.object({
    submittedBy: z.preprocess(trimmed, z.string().optional()),
});
export const salaryPaySchema = z.object({
    paymentDate: dateString,
    paymentMode: z.enum(PAYMENT_MODES),
    paidBy: z.preprocess(trimmed, z.string().optional()),
});
export const salaryGenerateSchema = z.object({
    month: monthString,
    department: z.preprocess(trimmed, z.string().optional()),
});
export const salaryListQuerySchema = z.object({
    month: monthString.optional(),
    department: z.preprocess(trimmed, z.string().optional()),
});
export const salaryMonthSchema = z.object({ month: monthString });
export const salaryBulkStatusSchema = z.object({
    ids: z.array(z.string().uuid()).min(1).max(200),
    status: z.enum(["Paid", "Pending"]),
    paymentDate: dateString.optional(),
    paymentMode: z.enum(PAYMENT_MODES).optional(),
}).superRefine((value, ctx) => {
    if (value.status === "Paid" && (!value.paymentDate || !value.paymentMode)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "paymentDate and paymentMode are required when marking salaries Paid" });
    }
});
export const salaryDeliverySchema = z.object({
    ids: z.array(z.string().uuid()).min(1).max(200),
    language: z.enum(["en", "te"]).optional().default("en"),
    subject: z.preprocess(trimmed, z.string().max(300).optional()),
    body: z.preprocess(trimmed, z.string().min(1).max(10000)),
});
export { parseBody };
//# sourceMappingURL=salary.js.map