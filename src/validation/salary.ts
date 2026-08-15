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
import type { PaymentMode } from "../types/payments.js";

const trimmed = (v: unknown) => (typeof v === "string" ? v.trim() : v);

const isDateString = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());

const monthString = z
  .preprocess(
    trimmed,
    z
      .string()
      .min(1, "month is required")
      .regex(/^\d{4}-\d{2}$/, "month must be in YYYY-MM format")
      .refine((v) => Number(v.slice(5)) >= 1 && Number(v.slice(5)) <= 12, "month must be a valid YYYY-MM value")
  );

const dateString = z.preprocess(
  trimmed,
  z
    .string()
    .min(1, "A date is required")
    .refine(isDateString, "Date must be a valid YYYY-MM-DD value")
);

function moneyField(label: string) {
  return z.number({ invalid_type_error: `${label} must be a number` })
    .finite(`${label} must be finite (NaN / Infinity are not allowed)`)
    .nonnegative(`${label} must not be negative`)
    .refine((v) => Math.round(v * 100) / 100 === v, `${label} must have at most 2 decimal places`);
}

// ---------------------------------------------------------------------------
// Create / upsert body (POST /salaries and PUT /salaries).
// ---------------------------------------------------------------------------
export interface SalaryCreateBody {
  employeeId: number;
  month: string;
  basicSalary?: number;
  overtime?: number;
  incentives?: number;
  fuelAllowance?: number;
  nightAllowance?: number;
  leaveDeduction?: number;
  advanceRecovery?: number;
  loanEMI?: number;
  latePenalty?: number;
  otherDeductions?: number;
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

// ---------------------------------------------------------------------------
// Update body (PUT /salaries/:id). Only the salary components are editable and
// only while the record is Pending; financial edits on a Paid record are
// rejected by the service.
// ---------------------------------------------------------------------------
export interface SalaryUpdateBody {
  basicSalary?: number;
  overtime?: number;
  incentives?: number;
  fuelAllowance?: number;
  nightAllowance?: number;
  leaveDeduction?: number;
  advanceRecovery?: number;
  loanEMI?: number;
  latePenalty?: number;
  otherDeductions?: number;
}

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

// ---------------------------------------------------------------------------
// Status patch (PATCH /salaries/:id/status). "Pending" is an idempotent no-op;
// any attempt to reach "Paid" (or anything else) is impossible here because the
// Pending → Paid transition is reserved for the dedicated payment operation.
// ---------------------------------------------------------------------------
export interface SalaryStatusPatchBody {
  status: "Pending";
}

export const salaryStatusPatchSchema = z.object({
  status: z.literal("Pending", {
    errorMap: () => ({
      message: "Only Pending is allowed here. Pending → Paid happens only through the payment operation.",
    }),
  }),
});

// ---------------------------------------------------------------------------
// Payment body (POST /salaries/:id/pay).
// ---------------------------------------------------------------------------
export interface SalaryPayBody {
  paymentDate: string;
  paymentMode: PaymentMode;
  paidBy?: string;
}

export const salaryPaySchema = z.object({
  paymentDate: dateString,
  paymentMode: z.enum(PAYMENT_MODES),
  paidBy: z.preprocess(trimmed, z.string().optional()),
});

// ---------------------------------------------------------------------------
// Generation body (POST /salaries/generate).
// ---------------------------------------------------------------------------
export interface SalaryGenerateBody {
  month: string;
  department?: string;
}

export const salaryGenerateSchema = z.object({
  month: monthString,
  department: z.preprocess(trimmed, z.string().optional()),
});

// ---------------------------------------------------------------------------
// List query (GET /salaries).
// ---------------------------------------------------------------------------
export interface SalaryListQuery {
  month?: string;
  department?: string;
}

export const salaryListQuerySchema = z.object({
  month: monthString.optional(),
  department: z.preprocess(trimmed, z.string().optional()),
});

export { parseBody };