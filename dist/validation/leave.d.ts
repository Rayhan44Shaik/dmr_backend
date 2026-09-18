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
export interface LeaveCreateBody {
    employeeId: number;
    type: "Casual" | "Sick" | "Emergency" | "Annual";
    fromDate: string;
    toDate: string;
    days?: number;
    reason?: string;
}
export declare const leaveCreateSchema: z.ZodEffects<z.ZodObject<{
    employeeId: z.ZodNumber;
    type: z.ZodEnum<["Casual", "Sick", "Emergency", "Annual"]>;
    fromDate: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, unknown>;
    toDate: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, unknown>;
    days: z.ZodOptional<z.ZodNumber>;
    reason: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
}, "strip", z.ZodTypeAny, {
    type: "Casual" | "Sick" | "Emergency" | "Annual";
    fromDate: string;
    toDate: string;
    employeeId: number;
    reason?: string | undefined;
    days?: number | undefined;
}, {
    type: "Casual" | "Sick" | "Emergency" | "Annual";
    employeeId: number;
    fromDate?: unknown;
    toDate?: unknown;
    reason?: unknown;
    days?: number | undefined;
}>, {
    type: "Casual" | "Sick" | "Emergency" | "Annual";
    fromDate: string;
    toDate: string;
    employeeId: number;
    reason?: string | undefined;
    days?: number | undefined;
}, {
    type: "Casual" | "Sick" | "Emergency" | "Annual";
    employeeId: number;
    fromDate?: unknown;
    toDate?: unknown;
    reason?: unknown;
    days?: number | undefined;
}>;
export interface LeaveStatusBody {
    status: "Approved" | "Rejected" | "Cancelled";
    rejectionReason?: string;
}
export declare const leaveStatusSchema: z.ZodEffects<z.ZodObject<{
    status: z.ZodEnum<["Approved", "Rejected", "Cancelled"]>;
    rejectionReason: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
}, "strict", z.ZodTypeAny, {
    status: "Approved" | "Rejected" | "Cancelled";
    rejectionReason?: string | undefined;
}, {
    status: "Approved" | "Rejected" | "Cancelled";
    rejectionReason?: unknown;
}>, {
    status: "Approved" | "Rejected" | "Cancelled";
    rejectionReason?: string | undefined;
}, {
    status: "Approved" | "Rejected" | "Cancelled";
    rejectionReason?: unknown;
}>;
export interface LeaveListQuery {
    status?: string;
    month?: string;
    employeeId?: number;
    department?: string;
    leaveType?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
    page?: number;
    limit?: number;
}
export declare const leaveListQuerySchema: z.ZodObject<{
    status: z.ZodEffects<z.ZodOptional<z.ZodEnum<["All", "Pending", "Approved", "Rejected", "Cancelled"]>>, "Pending" | "Approved" | "Rejected" | "Cancelled" | "All" | undefined, unknown>;
    month: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, unknown>>;
    employeeId: z.ZodEffects<z.ZodOptional<z.ZodNumber>, number | undefined, unknown>;
    department: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
    leaveType: z.ZodEffects<z.ZodOptional<z.ZodEnum<["Casual", "Sick", "Emergency", "Annual"]>>, "Casual" | "Sick" | "Emergency" | "Annual" | undefined, unknown>;
    fromDate: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, unknown>>;
    toDate: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, unknown>>;
    search: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
    page: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodNumber, number, unknown>>>;
    limit: z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodNumber>>, number, unknown>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    status?: "Pending" | "Approved" | "Rejected" | "Cancelled" | "All" | undefined;
    month?: string | undefined;
    department?: string | undefined;
    fromDate?: string | undefined;
    toDate?: string | undefined;
    search?: string | undefined;
    employeeId?: number | undefined;
    leaveType?: "Casual" | "Sick" | "Emergency" | "Annual" | undefined;
}, {
    status?: unknown;
    month?: unknown;
    department?: unknown;
    fromDate?: unknown;
    toDate?: unknown;
    page?: unknown;
    search?: unknown;
    limit?: unknown;
    employeeId?: unknown;
    leaveType?: unknown;
}>;
export interface LeaveReportQuery {
    month: string;
    department?: string;
    employeeId?: number;
}
export declare const leaveReportQuerySchema: z.ZodObject<{
    month: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, unknown>;
    department: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
    employeeId: z.ZodEffects<z.ZodOptional<z.ZodNumber>, number | undefined, unknown>;
}, "strip", z.ZodTypeAny, {
    month: string;
    department?: string | undefined;
    employeeId?: number | undefined;
}, {
    month?: unknown;
    department?: unknown;
    employeeId?: unknown;
}>;
export { parseBody };
