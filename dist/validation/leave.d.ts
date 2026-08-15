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
    fromDate: string;
    toDate: string;
    type: "Casual" | "Sick" | "Emergency" | "Annual";
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
    fromDate: string;
    toDate: string;
    type: "Casual" | "Sick" | "Emergency" | "Annual";
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
    status: "Pending" | "Approved" | "Rejected";
    approvedBy?: string;
    rejectionReason?: string;
}
export declare const leaveStatusSchema: z.ZodObject<{
    status: z.ZodEnum<["Pending", "Approved", "Rejected"]>;
    approvedBy: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
    rejectionReason: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
}, "strip", z.ZodTypeAny, {
    status: "Pending" | "Approved" | "Rejected";
    approvedBy?: string | undefined;
    rejectionReason?: string | undefined;
}, {
    status: "Pending" | "Approved" | "Rejected";
    approvedBy?: unknown;
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
    status: z.ZodEffects<z.ZodOptional<z.ZodEnum<["All", "Pending", "Approved", "Rejected"]>>, "Pending" | "Approved" | "Rejected" | "All" | undefined, unknown>;
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
    status?: "Pending" | "Approved" | "Rejected" | "All" | undefined;
    department?: string | undefined;
    fromDate?: string | undefined;
    toDate?: string | undefined;
    month?: string | undefined;
    search?: string | undefined;
    employeeId?: number | undefined;
    leaveType?: "Casual" | "Sick" | "Emergency" | "Annual" | undefined;
}, {
    status?: unknown;
    department?: unknown;
    fromDate?: unknown;
    toDate?: unknown;
    page?: unknown;
    limit?: unknown;
    month?: unknown;
    search?: unknown;
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
    department?: unknown;
    month?: unknown;
    employeeId?: unknown;
}>;
export { parseBody };
