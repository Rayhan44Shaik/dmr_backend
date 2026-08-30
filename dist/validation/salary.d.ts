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
import type { PaymentMode } from "../types/payments.js";
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
export declare const salaryCreateSchema: z.ZodObject<{
    employeeId: z.ZodNumber;
    month: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, unknown>;
    basicSalary: z.ZodOptional<z.ZodEffects<z.ZodNumber, number, number>>;
    overtime: z.ZodOptional<z.ZodEffects<z.ZodNumber, number, number>>;
    incentives: z.ZodOptional<z.ZodEffects<z.ZodNumber, number, number>>;
    fuelAllowance: z.ZodOptional<z.ZodEffects<z.ZodNumber, number, number>>;
    nightAllowance: z.ZodOptional<z.ZodEffects<z.ZodNumber, number, number>>;
    leaveDeduction: z.ZodOptional<z.ZodEffects<z.ZodNumber, number, number>>;
    advanceRecovery: z.ZodOptional<z.ZodEffects<z.ZodNumber, number, number>>;
    loanEMI: z.ZodOptional<z.ZodEffects<z.ZodNumber, number, number>>;
    latePenalty: z.ZodOptional<z.ZodEffects<z.ZodNumber, number, number>>;
    otherDeductions: z.ZodOptional<z.ZodEffects<z.ZodNumber, number, number>>;
}, "strip", z.ZodTypeAny, {
    month: string;
    employeeId: number;
    basicSalary?: number | undefined;
    overtime?: number | undefined;
    incentives?: number | undefined;
    fuelAllowance?: number | undefined;
    nightAllowance?: number | undefined;
    leaveDeduction?: number | undefined;
    advanceRecovery?: number | undefined;
    loanEMI?: number | undefined;
    latePenalty?: number | undefined;
    otherDeductions?: number | undefined;
}, {
    employeeId: number;
    month?: unknown;
    basicSalary?: number | undefined;
    overtime?: number | undefined;
    incentives?: number | undefined;
    fuelAllowance?: number | undefined;
    nightAllowance?: number | undefined;
    leaveDeduction?: number | undefined;
    advanceRecovery?: number | undefined;
    loanEMI?: number | undefined;
    latePenalty?: number | undefined;
    otherDeductions?: number | undefined;
}>;
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
export declare const salaryUpdateSchema: z.ZodObject<{
    basicSalary: z.ZodOptional<z.ZodEffects<z.ZodNumber, number, number>>;
    overtime: z.ZodOptional<z.ZodEffects<z.ZodNumber, number, number>>;
    incentives: z.ZodOptional<z.ZodEffects<z.ZodNumber, number, number>>;
    fuelAllowance: z.ZodOptional<z.ZodEffects<z.ZodNumber, number, number>>;
    nightAllowance: z.ZodOptional<z.ZodEffects<z.ZodNumber, number, number>>;
    leaveDeduction: z.ZodOptional<z.ZodEffects<z.ZodNumber, number, number>>;
    advanceRecovery: z.ZodOptional<z.ZodEffects<z.ZodNumber, number, number>>;
    loanEMI: z.ZodOptional<z.ZodEffects<z.ZodNumber, number, number>>;
    latePenalty: z.ZodOptional<z.ZodEffects<z.ZodNumber, number, number>>;
    otherDeductions: z.ZodOptional<z.ZodEffects<z.ZodNumber, number, number>>;
}, "strip", z.ZodTypeAny, {
    basicSalary?: number | undefined;
    overtime?: number | undefined;
    incentives?: number | undefined;
    fuelAllowance?: number | undefined;
    nightAllowance?: number | undefined;
    leaveDeduction?: number | undefined;
    advanceRecovery?: number | undefined;
    loanEMI?: number | undefined;
    latePenalty?: number | undefined;
    otherDeductions?: number | undefined;
}, {
    basicSalary?: number | undefined;
    overtime?: number | undefined;
    incentives?: number | undefined;
    fuelAllowance?: number | undefined;
    nightAllowance?: number | undefined;
    leaveDeduction?: number | undefined;
    advanceRecovery?: number | undefined;
    loanEMI?: number | undefined;
    latePenalty?: number | undefined;
    otherDeductions?: number | undefined;
}>;
export interface SalaryStatusPatchBody {
    status: "Pending";
}
export declare const salaryStatusPatchSchema: z.ZodObject<{
    status: z.ZodLiteral<"Pending">;
}, "strip", z.ZodTypeAny, {
    status: "Pending";
}, {
    status: "Pending";
}>;
export interface SalarySubmitBody {
    submittedBy?: string;
}
export declare const salarySubmitSchema: z.ZodObject<{
    submittedBy: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
}, "strip", z.ZodTypeAny, {
    submittedBy?: string | undefined;
}, {
    submittedBy?: unknown;
}>;
export interface SalaryPayBody {
    paymentDate: string;
    paymentMode: PaymentMode;
    paidBy?: string;
}
export declare const salaryPaySchema: z.ZodObject<{
    paymentDate: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, unknown>;
    paymentMode: z.ZodEnum<["Cash", "Bank Transfer", "UPI", "NEFT", "RTGS", "IMPS", "Cheque"]>;
    paidBy: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
}, "strip", z.ZodTypeAny, {
    paymentMode: "Cash" | "Bank Transfer" | "UPI" | "NEFT" | "RTGS" | "IMPS" | "Cheque";
    paymentDate: string;
    paidBy?: string | undefined;
}, {
    paymentMode: "Cash" | "Bank Transfer" | "UPI" | "NEFT" | "RTGS" | "IMPS" | "Cheque";
    paymentDate?: unknown;
    paidBy?: unknown;
}>;
export interface SalaryGenerateBody {
    month: string;
    department?: string;
}
export declare const salaryGenerateSchema: z.ZodObject<{
    month: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, unknown>;
    department: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
}, "strip", z.ZodTypeAny, {
    month: string;
    department?: string | undefined;
}, {
    department?: unknown;
    month?: unknown;
}>;
export interface SalaryBulkStatusBody {
    ids: string[];
    status: "Paid" | "Pending";
    paymentDate?: string;
    paymentMode?: PaymentMode;
    paidBy?: string;
}
export declare const salaryBulkStatusSchema: z.ZodObject<{
    ids: z.ZodArray<z.ZodString, "many">;
    status: z.ZodEnum<["Paid", "Pending"]>;
    paymentDate: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, unknown>>;
    paymentMode: z.ZodOptional<z.ZodEnum<["Cash", "Bank Transfer", "UPI", "NEFT", "RTGS", "IMPS", "Cheque"]>>;
    paidBy: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
}, "strip", z.ZodTypeAny, {
    status: "Pending" | "Paid";
    ids: string[];
    paymentMode?: "Cash" | "Bank Transfer" | "UPI" | "NEFT" | "RTGS" | "IMPS" | "Cheque" | undefined;
    paymentDate?: string | undefined;
    paidBy?: string | undefined;
}, {
    status: "Pending" | "Paid";
    ids: string[];
    paymentMode?: "Cash" | "Bank Transfer" | "UPI" | "NEFT" | "RTGS" | "IMPS" | "Cheque" | undefined;
    paymentDate?: unknown;
    paidBy?: unknown;
}>;
export interface SalaryListQuery {
    month?: string;
    department?: string;
}
export declare const salaryListQuerySchema: z.ZodObject<{
    month: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, unknown>>;
    department: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
}, "strip", z.ZodTypeAny, {
    department?: string | undefined;
    month?: string | undefined;
}, {
    department?: unknown;
    month?: unknown;
}>;
export { parseBody };
