/**
 * Accounts → Payments request validation.
 *
 * Amount is a strict finite positive number: `z.number().finite()` rejects NaN
 * and ±Infinity, `.positive()` rejects zero and negatives. Money is persisted
 * as NUMERIC — no floating-point arithmetic ever happens server-side.
 *
 * Text fields are trimmed; enums are trimmed before matching so stray
 * whitespace from a client never produces a phantom "invalid enum". Empty
 * strings in query params are treated as absent (so unset UI filters pass).
 *
 * NOTE: `z.preprocess` widens the inferred output to `unknown`, so each schema
 * ships an explicit `*Body` / `*Query` interface used to re-type the parsed
 * result at the call site.
 */
import { z } from "zod";
import { parseBody } from "./operations.js";
import type { PaymentMode, PaymentStatus, PaymentType } from "../types/payments.js";
export interface PaymentBody {
    paymentDate: string;
    paymentType: PaymentType;
    paidTo: string;
    amount: number;
    paymentMode: PaymentMode;
    referenceNo?: string;
    remarks?: string | null;
    category?: string;
    status?: PaymentStatus;
    createdBy?: string;
}
export declare const paymentBodySchema: z.ZodObject<{
    paymentDate: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, unknown>;
    paymentType: z.ZodEffects<z.ZodEnum<["Farmer Payment", "Fuel Payment", "Vehicle Maintenance", "Salary Payment", "EMI Payment", "FASTag Recharge", "Office Expense", "Tax Payment", "Other Expense"]>, "Farmer Payment" | "Fuel Payment" | "Vehicle Maintenance" | "Salary Payment" | "EMI Payment" | "FASTag Recharge" | "Office Expense" | "Tax Payment" | "Other Expense", unknown>;
    paidTo: z.ZodEffects<z.ZodString, string, unknown>;
    amount: z.ZodNumber;
    paymentMode: z.ZodEffects<z.ZodEnum<["Cash", "Bank Transfer", "UPI", "NEFT", "RTGS", "IMPS", "Cheque"]>, "Cash" | "Bank Transfer" | "UPI" | "NEFT" | "RTGS" | "IMPS" | "Cheque", unknown>;
    referenceNo: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
    remarks: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    category: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
    status: z.ZodOptional<z.ZodEffects<z.ZodEnum<["Draft", "Approved", "Paid", "Cancelled"]>, "Draft" | "Approved" | "Paid" | "Cancelled", unknown>>;
    createdBy: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
}, "strip", z.ZodTypeAny, {
    amount: number;
    paymentMode: "Cash" | "Bank Transfer" | "UPI" | "NEFT" | "RTGS" | "IMPS" | "Cheque";
    paymentDate: string;
    paymentType: "Farmer Payment" | "Fuel Payment" | "Vehicle Maintenance" | "Salary Payment" | "EMI Payment" | "FASTag Recharge" | "Office Expense" | "Tax Payment" | "Other Expense";
    paidTo: string;
    status?: "Draft" | "Approved" | "Paid" | "Cancelled" | undefined;
    remarks?: string | null | undefined;
    createdBy?: string | undefined;
    referenceNo?: string | undefined;
    category?: string | undefined;
}, {
    amount: number;
    status?: unknown;
    remarks?: unknown;
    createdBy?: unknown;
    paymentMode?: unknown;
    referenceNo?: unknown;
    paymentDate?: unknown;
    paymentType?: unknown;
    paidTo?: unknown;
    category?: unknown;
}>;
/**
 * Update body — every field optional. paymentNo is deliberately NOT part of
 * this schema: a client-supplied paymentNo is stripped by zod's default object
 * behaviour (unknown keys are removed), so a payment number can never be
 * changed or regenerated during an update. Audit timestamps (created_at) are
 * never touched; updated_at is refreshed by the DB trigger.
 */
export declare const paymentUpdateSchema: z.ZodObject<{
    paymentDate: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, unknown>>;
    paymentType: z.ZodOptional<z.ZodEffects<z.ZodEnum<["Farmer Payment", "Fuel Payment", "Vehicle Maintenance", "Salary Payment", "EMI Payment", "FASTag Recharge", "Office Expense", "Tax Payment", "Other Expense"]>, "Farmer Payment" | "Fuel Payment" | "Vehicle Maintenance" | "Salary Payment" | "EMI Payment" | "FASTag Recharge" | "Office Expense" | "Tax Payment" | "Other Expense", unknown>>;
    paidTo: z.ZodOptional<z.ZodEffects<z.ZodString, string, unknown>>;
    amount: z.ZodOptional<z.ZodNumber>;
    paymentMode: z.ZodOptional<z.ZodEffects<z.ZodEnum<["Cash", "Bank Transfer", "UPI", "NEFT", "RTGS", "IMPS", "Cheque"]>, "Cash" | "Bank Transfer" | "UPI" | "NEFT" | "RTGS" | "IMPS" | "Cheque", unknown>>;
    referenceNo: z.ZodOptional<z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>>;
    remarks: z.ZodOptional<z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>>;
    category: z.ZodOptional<z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>>;
    status: z.ZodOptional<z.ZodOptional<z.ZodEffects<z.ZodEnum<["Draft", "Approved", "Paid", "Cancelled"]>, "Draft" | "Approved" | "Paid" | "Cancelled", unknown>>>;
    createdBy: z.ZodOptional<z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>>;
}, "strip", z.ZodTypeAny, {
    status?: "Draft" | "Approved" | "Paid" | "Cancelled" | undefined;
    remarks?: string | null | undefined;
    createdBy?: string | undefined;
    amount?: number | undefined;
    paymentMode?: "Cash" | "Bank Transfer" | "UPI" | "NEFT" | "RTGS" | "IMPS" | "Cheque" | undefined;
    referenceNo?: string | undefined;
    paymentDate?: string | undefined;
    paymentType?: "Farmer Payment" | "Fuel Payment" | "Vehicle Maintenance" | "Salary Payment" | "EMI Payment" | "FASTag Recharge" | "Office Expense" | "Tax Payment" | "Other Expense" | undefined;
    paidTo?: string | undefined;
    category?: string | undefined;
}, {
    status?: unknown;
    remarks?: unknown;
    createdBy?: unknown;
    amount?: number | undefined;
    paymentMode?: unknown;
    referenceNo?: unknown;
    paymentDate?: unknown;
    paymentType?: unknown;
    paidTo?: unknown;
    category?: unknown;
}>;
export interface PaymentListQuery {
    fromDate?: string;
    toDate?: string;
    paymentType?: PaymentType;
    mode?: PaymentMode;
    status?: PaymentStatus;
    search?: string;
    page?: number;
    limit?: number;
    includeDeleted?: string;
}
export declare const paymentListQuerySchema: z.ZodObject<{
    fromDate: z.ZodEffects<z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>, string | undefined, unknown>;
    toDate: z.ZodEffects<z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>, string | undefined, unknown>;
    paymentType: z.ZodEffects<z.ZodOptional<z.ZodEnum<["Farmer Payment", "Fuel Payment", "Vehicle Maintenance", "Salary Payment", "EMI Payment", "FASTag Recharge", "Office Expense", "Tax Payment", "Other Expense"]>>, "Farmer Payment" | "Fuel Payment" | "Vehicle Maintenance" | "Salary Payment" | "EMI Payment" | "FASTag Recharge" | "Office Expense" | "Tax Payment" | "Other Expense" | undefined, unknown>;
    mode: z.ZodEffects<z.ZodOptional<z.ZodEnum<["Cash", "Bank Transfer", "UPI", "NEFT", "RTGS", "IMPS", "Cheque"]>>, "Cash" | "Bank Transfer" | "UPI" | "NEFT" | "RTGS" | "IMPS" | "Cheque" | undefined, unknown>;
    status: z.ZodEffects<z.ZodOptional<z.ZodEnum<["Draft", "Approved", "Paid", "Cancelled"]>>, "Draft" | "Approved" | "Paid" | "Cancelled" | undefined, unknown>;
    search: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
    page: z.ZodEffects<z.ZodOptional<z.ZodNumber>, number | undefined, unknown>;
    limit: z.ZodEffects<z.ZodOptional<z.ZodNumber>, number | undefined, unknown>;
    includeDeleted: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
}, "strip", z.ZodTypeAny, {
    status?: "Draft" | "Approved" | "Paid" | "Cancelled" | undefined;
    fromDate?: string | undefined;
    toDate?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    mode?: "Cash" | "Bank Transfer" | "UPI" | "NEFT" | "RTGS" | "IMPS" | "Cheque" | undefined;
    search?: string | undefined;
    includeDeleted?: string | undefined;
    paymentType?: "Farmer Payment" | "Fuel Payment" | "Vehicle Maintenance" | "Salary Payment" | "EMI Payment" | "FASTag Recharge" | "Office Expense" | "Tax Payment" | "Other Expense" | undefined;
}, {
    status?: unknown;
    fromDate?: unknown;
    toDate?: unknown;
    page?: unknown;
    limit?: unknown;
    mode?: unknown;
    search?: unknown;
    includeDeleted?: unknown;
    paymentType?: unknown;
}>;
export { parseBody };
