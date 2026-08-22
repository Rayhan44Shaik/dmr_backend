// src/modules/staff/services/leaveService.ts
// Leave — PostgreSQL backed via the staff leave API. Same shared Axios helpers
// as the other staff modules. No localStorage persistence, no synthetic records.

import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  handleApiError,
} from "../../../api";
import type {
  LeaveListFilters,
  LeaveListResult,
  LeaveReport,
  LeaveReportFilters,
  LeaveRequest,
} from "../types/staffDashboard";

const LEAVE_PATH = "/staff/leaves";

// ---------------------------------------------------------------------------
// Coercion helpers (backend rows -> typed frontend values)
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  return value == null ? "" : String(value);
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function maybeStr(value: unknown): string | undefined {
  if (value == null) return undefined;
  const s = String(value);
  return s.length ? s : undefined;
}

function mapLeave(raw: Record<string, unknown>): LeaveRequest {
  return {
    id: str(raw.id),
    employeeId: num(raw.employeeId ?? raw.employee_id),
    employeeName: str(raw.employeeName ?? raw.employee_name),
    type: str(raw.type ?? raw.leave_type) as LeaveRequest["type"],
    fromDate: str(raw.fromDate ?? raw.from_date),
    toDate: str(raw.toDate ?? raw.to_date),
    days: num(raw.days),
    status: str(raw.status) as LeaveRequest["status"],
    reason: maybeStr(raw.reason),
    rejectionReason: maybeStr(raw.rejectionReason ?? raw.rejection_reason),
    createdAt: str(raw.createdAt ?? raw.created_at),
    approvedBy: maybeStr(raw.approvedBy ?? raw.approved_by),
    approvedAt: maybeStr(raw.approvedAt ?? raw.approved_at),
    employeeNo: raw.employeeNo == null && raw.employee_no == null
      ? undefined
      : num(raw.employeeNo ?? raw.employee_no),
    department: maybeStr(raw.department),
  };
}

function mapReportItem(raw: Record<string, unknown>): LeaveReport["items"][number] {
  return {
    employeeId: num(raw.employeeId),
    employeeNo: num(raw.employeeNo ?? raw.employee_no),
    employeeName: str(raw.employeeName ?? raw.employee_name),
    department: str(raw.department),
    approvedLeaveDays: num(raw.approvedLeaveDays ?? raw.approved_leave_days),
    pendingLeaveDays: num(raw.pendingLeaveDays ?? raw.pending_leave_days),
    rejectedLeaveDays: num(raw.rejectedLeaveDays ?? raw.rejected_leave_days),
    leaveDates: Array.isArray(raw.leaveDates ?? raw.leave_dates)
      ? ((raw.leaveDates ?? raw.leave_dates) as unknown[]).map(str)
      : [],
    leaveTypes: Array.isArray(raw.leaveTypes ?? raw.leave_types)
      ? ((raw.leaveTypes ?? raw.leave_types) as unknown[]).map(str)
      : [],
  };
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/** GET /api/staff/leaves — filtered + paginated list. */
export async function listLeaves(
  filters: LeaveListFilters = {}
): Promise<LeaveListResult> {
  const params: Record<string, unknown> = {
    page: filters.page ?? 1,
    limit: filters.limit ?? 50,
  };
  if (filters.status) params.status = filters.status;
  if (filters.month) params.month = filters.month;
  if (filters.employeeId != null) params.employeeId = filters.employeeId;
  if (filters.department) params.department = filters.department;
  if (filters.leaveType) params.leaveType = filters.leaveType;
  if (filters.fromDate) params.fromDate = filters.fromDate;
  if (filters.toDate) params.toDate = filters.toDate;
  if (filters.search) params.search = filters.search;

  const { data } = await apiGet<Record<string, unknown>>(LEAVE_PATH, { params });
  return {
    items: Array.isArray(data?.items) ? (data.items as Record<string, unknown>[]).map(mapLeave) : [],
    total: num(data?.total),
    page: num(data?.page) || 1,
    limit: num(data?.limit) || 50,
    totalPages: num(data?.totalPages) || 0,
  };
}

/** POST /api/staff/leaves — create a leave request (status is always Pending). */
export async function createLeave(input: {
  employeeId: number;
  type: LeaveRequest["type"];
  fromDate: string;
  toDate: string;
  days?: number;
  reason?: string;
}): Promise<LeaveRequest> {
  const { data } = await apiPost<Record<string, unknown>>(LEAVE_PATH, input);
  return mapLeave(data);
}

/** PATCH /api/staff/leaves/:id/status — approve / reject. */
export async function updateLeaveStatus(
  id: string,
  status: LeaveRequest["status"],
  opts: { approvedBy?: string; rejectionReason?: string } = {}
): Promise<LeaveRequest> {
  const { data } = await apiPatch<Record<string, unknown>>(
    `${LEAVE_PATH}/${id}/status`,
    { status, ...(opts.approvedBy ? { approvedBy: opts.approvedBy } : {}), ...(opts.rejectionReason ? { rejectionReason: opts.rejectionReason } : {}) }
  );
  return mapLeave(data);
}

/** DELETE /api/staff/leaves/:id — only Pending leave can be deleted. */
export async function deleteLeave(id: string): Promise<{ id: string; deleted: boolean }> {
  const { data } = await apiDelete<Record<string, unknown>>(`${LEAVE_PATH}/${id}`);
  return { id: str(data.id), deleted: Boolean(data.deleted) };
}

/** GET /api/staff/leaves/report — authoritative employee-level leave report. */
export async function getLeaveReport(
  filters: LeaveReportFilters
): Promise<LeaveReport> {
  const params: Record<string, unknown> = { month: filters.month };
  if (filters.department) params.department = filters.department;
  if (filters.employeeId != null) params.employeeId = filters.employeeId;
  const { data } = await apiGet<Record<string, unknown>>(`${LEAVE_PATH}/report`, { params });
  return {
    month: str(data?.month),
    items: Array.isArray(data?.items) ? (data.items as Record<string, unknown>[]).map(mapReportItem) : [],
  };
}

export { handleApiError };
