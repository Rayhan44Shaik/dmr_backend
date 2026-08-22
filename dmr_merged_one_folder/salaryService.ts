// src/modules/staff/services/salaryService.ts
// Salary Register — PostgreSQL backed via the staff salary API. Uses the same
// shared Axios helpers as the other modules. No localStorage persistence, no
// synthetic records, no client-side totals.

import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  handleApiError,
} from "../../../api";
import type { SalaryRecord } from "../types/staffDashboard";

const SALARY_PATH = "/staff/salaries";

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

function maybeNum(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function maybeStr(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value);
  return s.length ? s : null;
}

function mapSalary(raw: Record<string, unknown>): SalaryRecord {
  return {
    id: str(raw.id),
    employeeId: num(raw.employeeId ?? raw.employee_id),
    employeeName: str(raw.employeeName ?? raw.employee_name),
    department: str(raw.department),
    role: maybeStr(raw.role) ?? undefined,
    month: str(raw.month),
    basicSalary: num(raw.basicSalary ?? raw.basic_salary),
    overtime: num(raw.overtime),
    incentives: num(raw.incentives),
    fuelAllowance: num(raw.fuelAllowance ?? raw.fuel_allowance),
    nightAllowance: num(raw.nightAllowance ?? raw.night_allowance),
    totalGross: num(raw.totalGross ?? raw.total_gross),
    leaveDeduction: num(raw.leaveDeduction ?? raw.leave_deduction),
    advanceRecovery: num(raw.advanceRecovery ?? raw.advance_recovery),
    loanEMI: num(raw.loanEMI ?? raw.loan_emi),
    latePenalty: num(raw.latePenalty ?? raw.late_penalty),
    otherDeductions: num(raw.otherDeductions ?? raw.other_deductions),
    totalDeductions: num(raw.totalDeductions ?? raw.total_deductions),
    netSalary: num(raw.netSalary ?? raw.net_salary),
    status: str(raw.status) as SalaryRecord["status"],
    paymentDate: maybeStr(raw.paymentDate ?? raw.payment_date),
    paymentRef: maybeStr(raw.paymentRef ?? raw.payment_ref),
    paidAt: maybeStr(raw.paidAt ?? raw.paid_at),
    submittedAt: maybeStr(raw.submittedAt ?? raw.submitted_at),
    submittedBy: maybeStr(raw.submittedBy ?? raw.submitted_by),
    createdAt: str(raw.createdAt ?? raw.created_at),
    workingDays: maybeNum(raw.workingDays ?? raw.working_days),
    presentDays: maybeNum(raw.presentDays ?? raw.present_days),
    leaveDays: maybeNum(raw.leaveDays ?? raw.leave_days),
    weeklyOffDays: maybeNum(raw.weeklyOffDays ?? raw.weekly_off_days),
    monthClosed: Boolean(raw.monthClosed),
    correctionWindowDaysRemaining:
      raw.correctionWindowDaysRemaining == null
        ? null
        : num(raw.correctionWindowDaysRemaining),
  };
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/** GET /api/staff/salaries?month=YYYY-MM&department= */
export async function listSalaries(
  month: string,
  department?: string
): Promise<SalaryRecord[]> {
  const { data } = await apiGet<Record<string, unknown>[]>(SALARY_PATH, {
    params: { month, ...(department ? { department } : {}) },
  });
  return Array.isArray(data) ? data.map(mapSalary) : [];
}

/** POST /api/staff/salaries/generate — bulk generate a month (idempotent). */
export async function generateSalaries(
  month: string,
  department?: string
): Promise<{ month: string; requested: number; generated: number; skippedExisting: number }> {
  const { data } = await apiPost<Record<string, unknown>>(
    `${SALARY_PATH}/generate`,
    { month, ...(department ? { department } : {}) }
  );
  return {
    month: str(data.month),
    requested: num(data.requested),
    generated: num(data.generated),
    skippedExisting: num(data.skippedExisting ?? data.skipped_existing),
  };
}

/** POST /api/staff/salaries/:id/submit — Pending → Submitted (freeze). */
export async function submitSalary(id: string, submittedBy = "user"): Promise<SalaryRecord> {
  const { data } = await apiPost<Record<string, unknown>>(
    `${SALARY_PATH}/${id}/submit`,
    { submittedBy }
  );
  return mapSalary(data);
}

/** POST /api/staff/salaries/:id/pay — Pending/Submitted → Paid + Accounts payment. */
export async function paySalary(
  id: string,
  input: { paymentDate: string; paymentMode: string; paidBy?: string }
): Promise<SalaryRecord> {
  const { data } = await apiPost<Record<string, unknown>>(
    `${SALARY_PATH}/${id}/pay`,
    {
      paymentDate: input.paymentDate,
      paymentMode: input.paymentMode,
      paidBy: input.paidBy ?? "user",
    }
  );
  return mapSalary(data);
}

/** PATCH /api/staff/salaries/:id/status — Submitted→Pending (un-submit) or
 *  Paid→Pending (Mark-Unpaid) within the correction window. */
export async function updateSalaryStatus(id: string): Promise<SalaryRecord> {
  const { data } = await apiPatch<Record<string, unknown>>(
    `${SALARY_PATH}/${id}/status`,
    { status: "Pending" }
  );
  return mapSalary(data);
}

/** POST /api/staff/salaries/bulk-status — atomic multi-record Mark Paid /
 *  Mark Unpaid. The backend pre-validates EVERY row and aborts the whole
 *  batch (409) before any write when one record cannot be updated. */
export async function bulkUpdateSalaryStatus(
  ids: string[],
  input: {
    status: "Paid" | "Pending";
    paymentDate?: string;
    paymentMode?: string;
    paidBy?: string;
  }
): Promise<{ updated: SalaryRecord[]; skipped: { id: string; reason: string }[] }> {
  const { data } = await apiPost<Record<string, unknown>>(
    `${SALARY_PATH}/bulk-status`,
    {
      ids,
      status: input.status,
      ...(input.paymentDate ? { paymentDate: input.paymentDate } : {}),
      ...(input.paymentMode ? { paymentMode: input.paymentMode } : {}),
      paidBy: input.paidBy ?? "user",
    }
  );
  const raw = (data ?? {}) as Record<string, unknown>;
  const updated = Array.isArray(raw.updated)
    ? (raw.updated as Record<string, unknown>[]).map(mapSalary)
    : [];
  const skipped = Array.isArray(raw.skipped)
    ? (raw.skipped as Array<{ id: string; reason: string }>)
    : [];
  return { updated, skipped };
}

/** PUT /api/staff/salaries/:id — edit only Pending records; totals recomputed
 *  by the backend from the supplied components. */
export async function updateSalary(
  id: string,
  components: Record<string, number>
): Promise<SalaryRecord> {
  const { data } = await apiPut<Record<string, unknown>>(
    `${SALARY_PATH}/${id}`,
    components
  );
  return mapSalary(data);
}

/** DELETE /api/staff/salaries/:id — delete only Pending records. */
export async function deleteSalary(id: string): Promise<void> {
  await apiDelete(`${SALARY_PATH}/${id}`);
}

/** GET /api/staff/attendance/summary?month= — authoritative Duty/Attendance
 *  summary for the cross-check. */
export async function getAttendanceSummary(month: string): Promise<
  Array<{
    employeeId: number;
    employeeName: string;
    department: string;
    presentCount: number;
    leaveCount: number;
    weeklyOffCount: number;
    workingDays: number;
  }>
> {
  const { data } = await apiGet<Record<string, unknown>>(
    "/staff/attendance/summary",
    { params: { month } }
  );
  const rows = Array.isArray((data as Record<string, unknown>)?.rows)
    ? ((data as Record<string, unknown>).rows as Record<string, unknown>[])
    : [];
  return rows.map((r) => ({
    employeeId: num(r.employeeId),
    employeeName: str(r.employeeName),
    department: str(r.department),
    presentCount: num(r.presentCount ?? r.present_count),
    leaveCount: num(r.leaveCount ?? r.leave_count),
    weeklyOffCount: num(r.weeklyOffCount ?? r.weekly_off_count),
    workingDays: num(r.workingDays ?? r.working_days),
  }));
}

export { handleApiError };
