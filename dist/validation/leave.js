/**
 * Staff → Leave request validation.
 *
 * Security model:
 *  - leave status is never accepted from the client on create — a request is
 *    always created Pending; the Pending → Approved / Pending → Rejected
 *    transition happens only through PATCH /leaves/:id/status.
 *  - The derived `days` is optional on create; when omitted the service
 *    computes it from the inclusive calendar-day range so it can never diverge
 *    from the authoritative calendar-day logic used by attendance/salary.
 *  - `type` is restricted to the PostgreSQL leave_type enum.
 *  - Query filters (GET /leaves and GET /leaves/report) are coerced here;
 *    PostgreSQL does the filtering (no client-side table scan).
 *
 * Conventions mirror ../validation/salary.ts: zod + parseBody.
 */
import { z } from "zod";
import { parseBody } from "./operations.js";
const trimmed = (v) => (typeof v === "string" ? v.trim() : v);
const isDateString = (v) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v))
        return false;
    const parsed = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
};
const dateString = z.preprocess(trimmed, z
    .string()
    .min(1, "A date is required")
    .refine(isDateString, "Date must be a valid YYYY-MM-DD value"));
const monthString = z.preprocess(trimmed, z
    .string()
    .min(1, "month is required")
    .regex(/^\d{4}-\d{2}$/, "month must be in YYYY-MM format")
    .refine((v) => Number(v.slice(5)) >= 1 && Number(v.slice(5)) <= 12, "month must be a valid YYYY-MM value"));
const intString = (label) => z.preprocess((v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v), z.number({ invalid_type_error: `${label} must be a number` }).int(`${label} must be an integer`).positive(`${label} must be positive`));
const optionalInt = (label) => z.preprocess((v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v), z.number({ invalid_type_error: `${label} must be a number` }).int(`${label} must be an integer`).positive(`${label} must be positive`).optional());
export const leaveCreateSchema = z
    .object({
    employeeId: z
        .number({
        required_error: "employeeId is required",
        invalid_type_error: "employeeId must be a number",
    })
        .int("employeeId must be an integer")
        .positive("employeeId must be a positive integer"),
    type: z.enum(["Casual", "Sick", "Emergency", "Annual"], {
        errorMap: () => ({ message: "type must be one of Casual | Sick | Emergency | Annual" }),
    }),
    fromDate: dateString,
    toDate: dateString,
    days: z
        .number({ invalid_type_error: "days must be a number" })
        .finite("days must be finite")
        .positive("days must be greater than 0")
        .optional(),
    reason: z.preprocess(trimmed, z.string().optional()),
})
    .refine((v) => v.toDate >= v.fromDate, {
    message: "toDate must be on or after fromDate",
    path: ["toDate"],
});
export const leaveStatusSchema = z.object({
    status: z.enum(["Approved", "Rejected", "Cancelled"], {
        errorMap: () => ({ message: "status must be one of Approved | Rejected | Cancelled" }),
    }),
    rejectionReason: z.preprocess(trimmed, z.string().optional()),
}).strict().superRefine((value, ctx) => {
    if (value.status === "Rejected" && !value.rejectionReason) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["rejectionReason"], message: "rejectionReason is required when rejecting leave" });
    }
});
export const leaveListQuerySchema = z.object({
    status: z.preprocess(trimmed, z.enum(["All", "Pending", "Approved", "Rejected", "Cancelled"]).optional()),
    month: monthString.optional(),
    employeeId: optionalInt("employeeId"),
    department: z.preprocess(trimmed, z.string().optional()),
    leaveType: z.preprocess(trimmed, z.enum(["Casual", "Sick", "Emergency", "Annual"]).optional()),
    fromDate: dateString.optional(),
    toDate: dateString.optional(),
    search: z.preprocess(trimmed, z.string().optional()),
    page: intString("page").optional().default(1),
    limit: z.preprocess((v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v), z.number().int("limit must be an integer").min(1, "limit must be at least 1").max(500, "limit must be at most 500").optional().default(50)),
});
export const leaveReportQuerySchema = z.object({
    month: monthString,
    department: z.preprocess(trimmed, z.string().optional()),
    employeeId: optionalInt("employeeId"),
});
export { parseBody };
//# sourceMappingURL=leave.js.map