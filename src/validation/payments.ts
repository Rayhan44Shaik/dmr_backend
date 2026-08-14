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
import { PAYMENT_MODES, PAYMENT_STATUSES, PAYMENT_TYPES } from "../types/payments.js";
import type { PaymentMode, PaymentStatus, PaymentType } from "../types/payments.js";

const isDateString = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());

/** Trim a string before downstream validation (enums, dates, ids). */
const trimmed = (v: unknown) => (typeof v === "string" ? v.trim() : v);

/** Treat empty strings like absent values (UI filters often send ""). */
const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const trimmedEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(trimmed, z.enum(values));

const dateString = z.preprocess(
  trimmed,
  z
    .string()
    .min(1, "A date is required")
    .refine(isDateString, "Date must be a valid YYYY-MM-DD value")
);

const trimmedText = (label: string) =>
  z.preprocess(trimmed, z.string().min(1, `${label} is required`));

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

export const paymentBodySchema = z.object({
  paymentDate: dateString,
  paymentType: trimmedEnum(PAYMENT_TYPES),
  paidTo: trimmedText("paidTo"),
  amount: z
    .number({
      required_error: "amount is required",
      invalid_type_error: "amount must be a number",
    })
    .finite("amount must be finite")
    .positive("amount must be greater than zero"),
  paymentMode: trimmedEnum(PAYMENT_MODES),
  referenceNo: z.preprocess(trimmed, z.string().optional()),
  remarks: z.preprocess(trimmed, z.string().nullable().optional()),
  category: z.preprocess(trimmed, z.string().optional()),
  status: trimmedEnum(PAYMENT_STATUSES).optional(),
  createdBy: z.preprocess(trimmed, z.string().optional()),
});

/**
 * Update body — every field optional. paymentNo is deliberately NOT part of
 * this schema: a client-supplied paymentNo is stripped by zod's default object
 * behaviour (unknown keys are removed), so a payment number can never be
 * changed or regenerated during an update. Audit timestamps (created_at) are
 * never touched; updated_at is refreshed by the DB trigger.
 */
export const paymentUpdateSchema = paymentBodySchema.partial();

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

export const paymentListQuerySchema = z.object({
  fromDate: z
    .preprocess(
      emptyToUndefined,
      z.string().refine(isDateString, "Invalid fromDate — use YYYY-MM-DD").optional()
    ),
  toDate: z
    .preprocess(
      emptyToUndefined,
      z.string().refine(isDateString, "Invalid toDate — use YYYY-MM-DD").optional()
    ),
  paymentType: z.preprocess(emptyToUndefined, z.enum(PAYMENT_TYPES).optional()),
  mode: z.preprocess(emptyToUndefined, z.enum(PAYMENT_MODES).optional()),
  status: z.preprocess(emptyToUndefined, z.enum(PAYMENT_STATUSES).optional()),
  search: z.preprocess(emptyToUndefined, z.string().optional()),
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  limit: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  includeDeleted: z.preprocess(emptyToUndefined, z.string().optional()),
});

export { parseBody };