import { query, withTransaction } from "../config/db.js";
import { createHash } from "node:crypto";
import { AppError } from "../middleware/errorHandler.js";
import { rethrowIfAppError } from "../utils/pgErrors.js";
import type {
  AdvanceLoan,
  AttendanceRecord,
  DutyAssignment,
  LeaveRequest,
  SalaryRecord,
} from "../types/models.js";
import { dateOnly, isoOrNull, num, numOrNull, str } from "../utils/coerce.js";
import { salaryCalculationService } from "./salaryCalculationService.js";
import { dutyPlannerService } from "./dutyPlannerService.js";
import { paymentsService } from "./paymentsService.js";
import { parseBody, salaryCreateSchema, salaryPaySchema, salarySubmitSchema, salaryUpdateSchema } from "../validation/salary.js";

function mapDuty(row: Record<string, unknown>): DutyAssignment {
  return {
    id: str(row.id),
    employeeId: num(row.employee_id),
    employeeName: str(row.employee_name),
    department: str(row.department),
    role: str(row.role),
    dutyType: str(row.duty_type) as DutyAssignment["dutyType"],
    date: dateOnly(row.duty_date) ?? "",
    vehicleId: numOrNull(row.vehicle_id),
    vehicleNo: row.vehicle_no == null ? null : str(row.vehicle_no),
  };
}

function mapLeave(row: Record<string, unknown>): LeaveRequest {
  return {
    id: str(row.id),
    employeeId: num(row.employee_id),
    employeeName: str(row.employee_name),
    type: str(row.leave_type) as LeaveRequest["type"],
    fromDate: dateOnly(row.from_date) ?? "",
    toDate: dateOnly(row.to_date) ?? "",
    days: num(row.days),
    status: str(row.status) as LeaveRequest["status"],
    reason: row.reason == null ? null : str(row.reason),
    rejectionReason: row.rejection_reason == null ? null : str(row.rejection_reason),
    createdAt: isoOrNull(row.created_at) ?? "",
    approvedBy: row.approved_by == null ? null : str(row.approved_by),
    approvedAt: isoOrNull(row.approved_at),
    employeeNo: row.employee_no == null ? null : num(row.employee_no),
    department: row.department == null ? null : str(row.department),
  };
}

function mapSalary(row: Record<string, unknown>): SalaryRecord {
  return {
    id: str(row.id),
    employeeId: num(row.employee_id),
    employeeName: str(row.employee_name),
    department: str(row.department),
    month: str(row.month),
    basicSalary: num(row.basic_salary),
    overtime: num(row.overtime),
    incentives: num(row.incentives),
    fuelAllowance: num(row.fuel_allowance),
    nightAllowance: num(row.night_allowance),
    totalGross: num(row.total_gross),
    leaveDeduction: num(row.leave_deduction),
    advanceRecovery: num(row.advance_recovery),
    loanEMI: num(row.loan_emi),
    latePenalty: num(row.late_penalty),
    otherDeductions: num(row.other_deductions),
    totalDeductions: num(row.total_deductions),
    netSalary: num(row.net_salary),
    status: str(row.status) as SalaryRecord["status"],
    paymentDate: dateOnly(row.payment_date),
    paymentRef: row.payment_ref == null ? null : str(row.payment_ref),
    paidAt: isoOrNull(row.paid_at),
    submittedAt: isoOrNull(row.submitted_at),
    submittedBy: row.submitted_by == null ? null : str(row.submitted_by),
    createdAt: isoOrNull(row.created_at) ?? "",
  };
}

function mapAdvance(row: Record<string, unknown>): AdvanceLoan {
  return {
    id: str(row.id),
    employeeId: num(row.employee_id),
    employeeName: str(row.employee_name),
    type: str(row.loan_type) as AdvanceLoan["type"],
    principal: num(row.principal),
    issuedDate: dateOnly(row.issued_date) ?? "",
    totalRepaid: num(row.total_repaid),
    monthlyDeduction: num(row.monthly_deduction),
    remainingBalance: num(row.remaining_balance),
    status: str(row.status) as AdvanceLoan["status"],
    interestRate: numOrNull(row.interest_rate),
    tenure: numOrNull(row.tenure_months),
  };
}

function mapAttendance(row: Record<string, unknown>): AttendanceRecord {
  return {
    employeeId: num(row.employee_id),
    employeeName: str(row.employee_name),
    department: str(row.department),
    month: str(row.month),
    dayMarks: (row.day_marks as Record<string, string>) ?? {},
    presentCount: num(row.present_count),
    absentCount: num(row.absent_count),
    leaveCount: num(row.leave_count),
    halfDayCount: num(row.half_day_count),
  };
}

// ---------------------------------------------------------------------------
// Salary lifecycle helpers.
//
// Lifecycle: Draft (Pending) -> Submitted (frozen) -> Paid (frozen).
// The 7 calendar-day correction window starts at paid_at; while it is open the
// ONLY lifecycle operation on a Paid row is Mark-Unpaid (Paid -> Pending).
// After expiry the record, and a payroll month in which every record is Paid
// with an expired window, are permanently locked. Every mutation below is
// additionally guarded at the DB level by the trg_salary_lifecycle trigger.
// ---------------------------------------------------------------------------

const SALARY_CORRECTION_DAYS = 7;

/** A payroll month is "closed" once it has records and every one of them is
 *  Paid with an expired correction window. A closed month rejects all
 *  mutations, so an older finalized payroll month can never be edited
 *  accidentally (or bypassed) regardless of frontend state. */
async function salaryMonthIsClosed(month: string): Promise<boolean> {
  const res = await query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status <> 'Paid') AS not_paid,
            COUNT(*) FILTER (WHERE paid_at IS NULL OR paid_at + INTERVAL '7 days' <= NOW()) AS expired
     FROM salary_records WHERE month = $1`,
    [month]
  );
  const row = res.rows[0];
  const total = num(row.total);
  if (!total) return false;
  return num(row.not_paid) === 0 && num(row.expired) === total;
}

/** true once paid_at's 7-calendar-day correction window has elapsed. */
function correctionWindowExpired(paidAt: string | null | undefined): boolean {
  if (!paidAt) return true;
  const ms = new Date(paidAt).getTime();
  if (!Number.isFinite(ms)) return true;
  return ms + SALARY_CORRECTION_DAYS * 86_400_000 < Date.now();
}

/** Whole calendar days remaining in the 7-day correction window (0 when
 *  expired, null when the record is not Paid / has no paid_at). */
function correctionWindowDaysRemaining(paidAt: string | null | undefined): number | null {
  if (!paidAt) return null;
  const ms = new Date(paidAt).getTime();
  if (!Number.isFinite(ms)) return null;
  const remaining = Math.ceil(
    (ms + SALARY_CORRECTION_DAYS * 86_400_000 - Date.now()) / 86_400_000
  );
  return remaining >= 0 ? remaining : 0;
}

/** Adds derived lifecycle flags so the UI can reflect the backend state
 *  (closed month, correction-window countdown) without recomputing it.
 *  `monthClosed` is evaluated once per distinct month, not per row. */
async function enrichSalaryLifecycle(
  records: SalaryRecord[]
): Promise<SalaryRecord[]> {
  const months = Array.from(new Set(records.map((r) => r.month)));
  const closed = new Set<string>();
  for (const m of months) {
    if (await salaryMonthIsClosed(m)) closed.add(m);
  }
  return records.map((r) => ({
    ...r,
    monthClosed: closed.has(r.month),
    correctionWindowDaysRemaining:
      r.status === "Paid" ? correctionWindowDaysRemaining(r.paidAt) : null,
  }));
}

export const staffService = {
  // ── Duty Planner ──────────────────────────────────────────────
  async listDuties(fromDate?: string, toDate?: string, department?: string) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (fromDate) {
      params.push(fromDate);
      clauses.push(`duty_date >= $${params.length}`);
    }
    if (toDate) {
      params.push(toDate);
      clauses.push(`duty_date <= $${params.length}`);
    }
    if (department) {
      params.push(department);
      clauses.push(`department = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await query(
      `SELECT * FROM duty_assignments ${where} ORDER BY duty_date, employee_name`,
      params
    );
    return result.rows.map(mapDuty);
  },

  async upsertDuty(body: Omit<DutyAssignment, "id"> & { id?: string }) {
    if (body.id) {
      const result = await query(
        `UPDATE duty_assignments SET
           employee_id=$2, employee_name=$3, department=$4, role=$5,
           duty_type=$6, duty_date=$7, vehicle_id=$8, vehicle_no=$9
         WHERE id=$1 RETURNING *`,
        [
          body.id,
          body.employeeId,
          body.employeeName,
          body.department ?? "",
          body.role ?? "",
          body.dutyType,
          body.date,
          body.vehicleId ?? null,
          body.vehicleNo ?? null,
        ]
      );
      if (!result.rowCount) throw new AppError(404, "Duty assignment not found");
      return mapDuty(result.rows[0]);
    }

    const result = await query(
      `INSERT INTO duty_assignments (
         employee_id, employee_name, department, role, duty_type, duty_date, vehicle_id, vehicle_no
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (employee_id, duty_date) DO UPDATE SET
         employee_name = EXCLUDED.employee_name,
         department = EXCLUDED.department,
         role = EXCLUDED.role,
         duty_type = EXCLUDED.duty_type,
         vehicle_id = EXCLUDED.vehicle_id,
         vehicle_no = EXCLUDED.vehicle_no
       RETURNING *`,
      [
        body.employeeId,
        body.employeeName,
        body.department ?? "",
        body.role ?? "",
        body.dutyType,
        body.date,
        body.vehicleId ?? null,
        body.vehicleNo ?? null,
      ]
    );
    return mapDuty(result.rows[0]);
  },

  async deleteDuty(id: string) {
    const result = await query(`DELETE FROM duty_assignments WHERE id = $1 RETURNING id`, [id]);
    if (!result.rowCount) throw new AppError(404, "Duty assignment not found");
    return { id, deleted: true };
  },

  // ── Leave ─────────────────────────────────────────────────────

  /** Inclusive calendar-day count for a [from, to] date range (from <= to). */
  inclusiveDays(from: string, to: string): number {
    const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
    return Math.floor(ms / 86_400_000) + 1;
  },

  /** Last day of a YYYY-MM month as a YYYY-MM-DD string. */
  lastDayOfMonth(month: string): string {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m, 0); // day 0 of the following month = last day of `m`
    const p = (n: number) => (n < 10 ? `0${n}` : String(n));
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },

  async listLeaves(filters: {
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
  } = {}) {
    const {
      status,
      month,
      employeeId,
      department,
      leaveType,
      fromDate,
      toDate,
      search,
      page = 1,
      limit = 50,
    } = filters;

    const clauses: string[] = [];
    const params: unknown[] = [];

    if (status && status !== "All") {
      params.push(status);
      clauses.push(`lr.status = $${params.length}`);
    }
    if (leaveType) {
      params.push(leaveType);
      clauses.push(`lr.leave_type = $${params.length}`);
    }
    if (employeeId) {
      params.push(employeeId);
      clauses.push(`lr.employee_id = $${params.length}`);
    }
    if (department) {
      params.push(department);
      clauses.push(`e.department = $${params.length}`);
    }
    if (fromDate) {
      params.push(fromDate);
      clauses.push(`lr.to_date >= $${params.length}`);
    }
    if (toDate) {
      params.push(toDate);
      clauses.push(`lr.from_date <= $${params.length}`);
    }
    if (month) {
      params.push(`${month}-01`);
      clauses.push(`lr.to_date >= $${params.length}`);
      params.push(this.lastDayOfMonth(month));
      clauses.push(`lr.from_date <= $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      clauses.push(`(lr.employee_name ILIKE $${params.length} OR lr.reason ILIKE $${params.length})`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const countRes = await query(
      `SELECT COUNT(*)::int AS total
         FROM leave_requests lr
         LEFT JOIN employees e ON e.id = lr.employee_id
         ${where}`,
      params
    );
    const total = num(countRes.rows[0]?.total);

    const offset = (page - 1) * limit;
    params.push(limit);
    params.push(offset);

    const result = await query(
      `SELECT lr.*, e.employee_no AS employee_no, e.department AS department
         FROM leave_requests lr
         LEFT JOIN employees e ON e.id = lr.employee_id
         ${where}
         ORDER BY lr.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return {
      items: result.rows.map(mapLeave),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  async createLeave(body: {
    employeeId: number;
    employeeName?: string;
    type: LeaveRequest["type"];
    fromDate: string;
    toDate: string;
    days?: number;
    reason?: string | null;
  }) {
    const id = await withTransaction(async (client) => {
      // Lock the employee so concurrent overlapping requests serialize.
      const emp = await client.query(
        `SELECT id, employee_no, employee_name, department, status FROM employees WHERE id = $1 FOR UPDATE`,
        [body.employeeId]
      );
      if (!emp.rows.length) throw new AppError(422, `Employee ${body.employeeId} does not exist.`);
      const employee = emp.rows[0];
      if (employee.status !== "Active") throw new AppError(422, "Inactive or suspended employees cannot request leave.");
      const overlap = await client.query(
        `SELECT id FROM leave_requests
         WHERE employee_id = $1 AND status IN ('Pending','Approved')
           AND from_date <= $3 AND to_date >= $2
         LIMIT 1`,
        [body.employeeId, body.fromDate, body.toDate]
      );
      if (overlap.rowCount) throw new AppError(409, "An overlapping pending or approved leave request already exists.");
      // Calendar days are always derived server-side; a client total is never trusted.
      const days = this.inclusiveDays(body.fromDate, body.toDate);
      const result = await client.query(
        `INSERT INTO leave_requests (
           employee_id, employee_name, leave_type, from_date, to_date, days, status, reason
         ) VALUES ($1,$2,$3,$4,$5,$6,'Pending',$7)
         RETURNING id`,
        [body.employeeId, str(employee.employee_name), body.type, body.fromDate, body.toDate, days, body.reason ?? null]
      );
      return str(result.rows[0].id);
    });
    return this.getLeaveById(id);
  },

  async getLeaveById(id: string) {
    const result = await query(
      `SELECT lr.*, e.employee_no AS employee_no, e.department AS department
         FROM leave_requests lr
         LEFT JOIN employees e ON e.id = lr.employee_id
         WHERE lr.id = $1`,
      [id]
    );
    if (!result.rows.length) throw new AppError(404, "Leave request not found");
    return mapLeave(result.rows[0]);
  },

  async updateLeaveStatus(
    id: string,
    status: LeaveRequest["status"],
    opts: { approvedBy?: string; rejectionReason?: string } = {}
  ) {
    await withTransaction(async (client) => {
      const current = await client.query("SELECT * FROM leave_requests WHERE id = $1 FOR UPDATE", [id]);
      if (!current.rowCount) throw new AppError(404, "Leave request not found");
      const row = current.rows[0];
      const from = str(dateOnly(row.from_date));
      const to = str(dateOnly(row.to_date));
      if (status === "Cancelled") {
        if (!['Pending', 'Approved'].includes(str(row.status))) throw new AppError(409, `A ${str(row.status).toLowerCase()} leave cannot be cancelled.`);
      } else if (row.status !== "Pending") {
        throw new AppError(409, `Only pending leave can be ${status.toLowerCase()}.`);
      }
      if (status === "Approved") {
        const duty = await client.query(
          "SELECT id FROM duty_assignments WHERE employee_id = $1 AND duty_date BETWEEN $2 AND $3 LIMIT 1",
          [row.employee_id, from, to]
        );
        if (duty.rowCount) throw new AppError(409, "Remove conflicting duty assignments before approving this leave.");
      }
      const result = await client.query(
        `UPDATE leave_requests SET status = $2::leave_status,
           approved_by = CASE WHEN $2::leave_status = 'Approved' THEN $3 ELSE approved_by END,
           approved_at = CASE WHEN $2::leave_status = 'Approved' THEN NOW() ELSE approved_at END,
           rejection_reason = CASE WHEN $2::leave_status = 'Rejected' THEN $4 ELSE rejection_reason END
         WHERE id = $1 AND status = $5 RETURNING id`,
        [id, status, opts.approvedBy ?? null, opts.rejectionReason ?? null, row.status]
      );
      if (!result.rowCount) throw new AppError(409, "Leave status changed concurrently. Refresh and try again.");
    });
    return this.getLeaveById(id);
  },

  async deleteLeave(id: string) {
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
      throw new AppError(400, `Invalid leave id: "${id}"`);
    }
    const found = await query(`SELECT status FROM leave_requests WHERE id = $1`, [id]);
    if (!found.rows.length) throw new AppError(404, "Leave request not found");

    const status = str(found.rows[0].status);
    if (status !== "Pending") throw new AppError(409, `${status} leave cannot be deleted.`);

    const del = await query(`DELETE FROM leave_requests WHERE id = $1 RETURNING id`, [id]);
    if (!del.rowCount) throw new AppError(404, "Leave request not found");
    return { id, deleted: true };
  },

  /** Authoritative employee-level leave report for a month.
   *  approvedLeaveDays counts DISTINCT approved calendar dates within the month
   *  (inclusive from_date..to_date), cross-month leave split per month — exactly
   *  the same calendar-day rule getAttendanceSummary uses, so the Leave Report
   *  can never disagree with Salary leaveDays. */
  async getLeaveReport(filters: { month: string; department?: string; employeeId?: number }) {
    const { month, department, employeeId } = filters;
    const monthStart = `${month}-01`;
    const monthEnd = this.lastDayOfMonth(month);

    const empWhere: string[] = [];
    const empParams: unknown[] = [];
    if (department) {
      empParams.push(department);
      empWhere.push(`department = $${empParams.length}`);
    }
    if (employeeId) {
      empParams.push(employeeId);
      empWhere.push(`id = $${empParams.length}`);
    }
    const empSql =
      empWhere.length
        ? `SELECT id, employee_no, employee_name, department FROM employees WHERE ${empWhere.join(" AND ")} ORDER BY employee_no`
        : `SELECT id, employee_no, employee_name, department FROM employees ORDER BY employee_no`;
    const empRes = await query(empSql, empParams);

    const leaves = await query(
      `SELECT employee_id, leave_type, from_date, to_date, status
         FROM leave_requests
         WHERE status IN ('Pending','Approved','Rejected')
           AND from_date <= $1 AND to_date >= $2`,
      [monthEnd, monthStart]
    );

    const STATUSES = ["Pending", "Approved", "Rejected"] as const;
    type DayIndex = {
      dates: Record<(typeof STATUSES)[number], Set<string>>;
      types: Record<(typeof STATUSES)[number], Set<string>>;
    };
    const idx = new Map<number, DayIndex>();
    for (const l of leaves.rows) {
      const id = num(l.employee_id);
      const status = str(l.status) as (typeof STATUSES)[number];
      if (!STATUSES.includes(status)) continue;
      const type = str(l.leave_type);
      let d = new Date((dateOnly(l.from_date) ?? "") + "T00:00:00Z");
      const dend = new Date((dateOnly(l.to_date) ?? "") + "T00:00:00Z");
      while (d <= dend) {
        const ds = d.toISOString().slice(0, 10);
        if (ds.startsWith(month)) {
          let rec = idx.get(id);
          if (!rec) {
            rec = { dates: { Pending: new Set(), Approved: new Set(), Rejected: new Set() }, types: { Pending: new Set(), Approved: new Set(), Rejected: new Set() } };
            idx.set(id, rec);
          }
          rec.dates[status].add(ds);
          rec.types[status].add(type);
        }
        d.setUTCDate(d.getUTCDate() + 1);
      }
    }

    return {
      month,
      items: empRes.rows.map((e) => {
        const id = num(e.id);
        const rec = idx.get(id);
        const approvedDates = rec ? Array.from(rec.dates.Approved).sort() : [];
        return {
          employeeId: id,
          employeeNo: num(e.employee_no),
          employeeName: str(e.employee_name),
          department: str(e.department),
          approvedLeaveDays: approvedDates.length,
          pendingLeaveDays: rec ? rec.dates.Pending.size : 0,
          rejectedLeaveDays: rec ? rec.dates.Rejected.size : 0,
          leaveDates: approvedDates,
          leaveTypes: rec ? Array.from(rec.types.Approved) : [],
        };
      }),
    };
  },

  // ── Salary ────────────────────────────────────────────────────

  /** Enrich salary rows with attendance figures derived from the authoritative
   *  Duty Planner data (duty_assignments + approved leave) at read time. These
   *  figures are never stored on the salary row — no duty data is duplicated. */
  async enrichAttendance(records: SalaryRecord[], months: string[]): Promise<SalaryRecord[]> {
    const attByMonth = new Map<string, Array<Record<string, unknown>>>();
    for (const m of months) {
      const summary = await dutyPlannerService.getAttendanceSummary(m);
      attByMonth.set(m, summary.rows as Array<Record<string, unknown>>);
    }
    return records.map((r) => {
      const rows = attByMonth.get(r.month) ?? [];
      const match = rows.find((x) => num(x.employeeId) === r.employeeId);
      if (!match) return r;
      return {
        ...r,
        workingDays: num(match.workingDays),
        presentDays: num(match.presentCount),
        leaveDays: num(match.leaveCount),
        weeklyOffDays: num(match.weeklyOffCount),
      };
    });
  },

  async listSalaries(month?: string, department?: string): Promise<SalaryRecord[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (month) {
      params.push(month);
      clauses.push(`month = $${params.length}`);
    }
    if (department) {
      params.push(department);
      clauses.push(`department = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await query(
      `SELECT * FROM salary_records ${where} ORDER BY employee_name`,
      params
    );
    const records = result.rows.map(mapSalary);
    const months = Array.from(new Set(records.map((r) => r.month)));
    return enrichSalaryLifecycle(await this.enrichAttendance(records, months));
  },

  async getEmployeeSalary(employeeId: number, month: string): Promise<SalaryRecord> {
    const emp = await query("SELECT id FROM employees WHERE id = $1", [employeeId]);
    if (!emp.rowCount) throw new AppError(404, "Employee not found");
    const result = await query(
      `SELECT * FROM salary_records WHERE employee_id = $1 AND month = $2`,
      [employeeId, month]
    );
    if (!result.rowCount) throw new AppError(404, "Salary record not found for this employee and month");
    const records = await this.enrichAttendance([mapSalary(result.rows[0])], [month]);
    return (await enrichSalaryLifecycle(records))[0];
  },

  /** Look up the DB employee (validates employeeId) and resolve the default
   *  basicSalary from the Employee Master when the client did not supply one. */
  async resolveEmployeeBase(employeeId: number): Promise<{ name: string; department: string; baseSalary: number }> {
    const result = await query(
      "SELECT id, employee_name, department, salary FROM employees WHERE id = $1",
      [employeeId]
    );
    if (!result.rowCount) throw new AppError(404, "Employee not found");
    const row = result.rows[0];
    return {
      name: str(row.employee_name),
      department: str(row.department),
      baseSalary: num(row.salary),
    };
  },

  async createSalary(body: unknown): Promise<SalaryRecord> {
const data = parseBody(salaryCreateSchema, body);
      if (await salaryMonthIsClosed(str(data.month))) {
      throw new AppError(409, "This payroll month is closed — new salary records cannot be created");
    }
    const emp = await this.resolveEmployeeBase(data.employeeId);

    const dup = await query(
      "SELECT id FROM salary_records WHERE employee_id = $1 AND month = $2",
      [data.employeeId, data.month]
    );
    if (dup.rowCount) {
      throw new AppError(409, "Salary record already exists for this employee and month");
    }

    const totals = salaryCalculationService.calculateTotals({
      basicSalary: data.basicSalary ?? emp.baseSalary,
      overtime: data.overtime ?? 0,
      incentives: data.incentives ?? 0,
      fuelAllowance: data.fuelAllowance ?? 0,
      nightAllowance: data.nightAllowance ?? 0,
      leaveDeduction: data.leaveDeduction ?? 0,
      advanceRecovery: data.advanceRecovery ?? 0,
      loanEMI: data.loanEMI ?? 0,
      latePenalty: data.latePenalty ?? 0,
      otherDeductions: data.otherDeductions ?? 0,
    });

    const result = await query(
      `INSERT INTO salary_records (
         employee_id, employee_name, department, month, basic_salary, overtime,
         incentives, fuel_allowance, night_allowance, total_gross, leave_deduction,
         advance_recovery, loan_emi, late_penalty, other_deductions, total_deductions,
         net_salary, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'Pending')
       RETURNING *`,
      [
        data.employeeId,
        emp.name,
        emp.department,
        data.month,
        data.basicSalary ?? emp.baseSalary,
        data.overtime ?? 0,
        data.incentives ?? 0,
        data.fuelAllowance ?? 0,
        data.nightAllowance ?? 0,
        totals.totalGross,
        data.leaveDeduction ?? 0,
        data.advanceRecovery ?? 0,
        data.loanEMI ?? 0,
        data.latePenalty ?? 0,
        data.otherDeductions ?? 0,
        totals.totalDeductions,
        totals.netSalary,
      ]
    );
    return mapSalary(result.rows[0]);
  },

  /** POST /salaries/:id/submit — Draft (Pending) → Submitted. Freezes the row:
   *  no normal editing afterwards. Only Draft records can be submitted, and a
   *  closed payroll month rejects submission. */
  async submitSalary(id: string, submittedBy = "user"): Promise<SalaryRecord> {
    const existing = await query("SELECT * FROM salary_records WHERE id = $1", [id]);
    if (!existing.rowCount) throw new AppError(404, "Salary record not found");
    const row = existing.rows[0];
    if (await salaryMonthIsClosed(str(row.month))) {
      throw new AppError(409, "This payroll month is closed and cannot be modified");
    }
    if (row.status === "Submitted") {
      throw new AppError(409, "Salary record is already submitted");
    }
    if (row.status === "Paid") {
      throw new AppError(409, "Paid salary records cannot be submitted");
    }
    if (row.status !== "Pending") {
      throw new AppError(409, "Salary record is not in a submittable (Pending) state");
    }
    const updated = await query(
      `UPDATE salary_records SET status = 'Submitted', submitted_at = NOW(), submitted_by = $2
       WHERE id = $1 AND status = 'Pending'
       RETURNING *`,
      [id, submittedBy]
    );
    if (!updated.rowCount) {
      throw new AppError(409, "Salary record could not be submitted (state changed unexpectedly)");
    }
    return mapSalary(updated.rows[0]);
  },

  /** PUT /salaries/:id — only Draft (Pending) records are editable; Submitted
   *  and Paid records are frozen. Totals are always recomputed on the backend
   *  from the supplied components. A closed payroll month rejects all edits. */
  async updateSalaryById(id: string, body: unknown): Promise<SalaryRecord> {
    const data = parseBody(salaryUpdateSchema, body);
    const existing = await query("SELECT * FROM salary_records WHERE id = $1", [id]);
    if (!existing.rowCount) throw new AppError(404, "Salary record not found");
    const row = existing.rows[0];
    if (await salaryMonthIsClosed(str(row.month))) {
      throw new AppError(409, "This payroll month is closed and cannot be modified");
    }
    if (row.status !== "Pending") {
      throw new AppError(
        409,
        row.status === "Paid"
          ? "Paid salary records cannot be edited"
          : "Submitted salary records are frozen and cannot be edited"
      );
    }

    const totals = salaryCalculationService.calculateTotals({
      basicSalary: data.basicSalary ?? num(row.basic_salary),
      overtime: data.overtime ?? num(row.overtime),
      incentives: data.incentives ?? num(row.incentives),
      fuelAllowance: data.fuelAllowance ?? num(row.fuel_allowance),
      nightAllowance: data.nightAllowance ?? num(row.night_allowance),
      leaveDeduction: data.leaveDeduction ?? num(row.leave_deduction),
      advanceRecovery: data.advanceRecovery ?? num(row.advance_recovery),
      loanEMI: data.loanEMI ?? num(row.loan_emi),
      latePenalty: data.latePenalty ?? num(row.late_penalty),
      otherDeductions: data.otherDeductions ?? num(row.other_deductions),
    });

    const result = await query(
      `UPDATE salary_records SET
         basic_salary = $2, overtime = $3, incentives = $4,
         fuel_allowance = $5, night_allowance = $6, total_gross = $7,
         leave_deduction = $8, advance_recovery = $9, loan_emi = $10,
         late_penalty = $11, other_deductions = $12, total_deductions = $13,
         net_salary = $14
       WHERE id = $1 AND status = 'Pending'
       RETURNING *`,
      [
        id,
        data.basicSalary ?? num(row.basic_salary),
        data.overtime ?? num(row.overtime),
        data.incentives ?? num(row.incentives),
        data.fuelAllowance ?? num(row.fuel_allowance),
        data.nightAllowance ?? num(row.night_allowance),
        totals.totalGross,
        data.leaveDeduction ?? num(row.leave_deduction),
        data.advanceRecovery ?? num(row.advance_recovery),
        data.loanEMI ?? num(row.loan_emi),
        data.latePenalty ?? num(row.late_penalty),
        data.otherDeductions ?? num(row.other_deductions),
        totals.totalDeductions,
        totals.netSalary,
      ]
    );
    if (!result.rowCount) throw new AppError(409, "Salary record is not in a Pending state and cannot be edited");
    const records = await this.enrichAttendance([mapSalary(result.rows[0])], [str(row.month)]);
    return records[0];
  },

  /**
   * Backward-compatible upsert (POST /salaries + PUT /salaries + seed script):
   * create when no row exists for (employee_id, month); update when the existing
   * row is Pending; reject financial edits on a Paid row. employeeName /
   * department / status / totalGross / netSalary supplied by the caller are
   * never trusted — name/department come from the Employee Master and ALL
   * totals are recomputed by the authoritative calculation engine.
   */
  async upsertSalary(body: unknown): Promise<SalaryRecord> {
    const data = parseBody(salaryCreateSchema, body);
    const existing = await query(
      "SELECT id, status, month FROM salary_records WHERE employee_id = $1 AND month = $2",
      [data.employeeId, data.month]
    );
    if (existing.rowCount) {
      const row = existing.rows[0];
      if (row.status === "Paid") {
        throw new AppError(409, "Paid salary records cannot be edited");
      }
      return this.updateSalaryById(str(row.id), body);
    }
    return this.createSalary(body);
  },

  /** Pending → Paid. The ONLY legal transition to Paid: creates the Accounts
   *  payment inside the same transaction, receives the payment number, locks
   *  the salary row, verifies it is Pending with no payment_ref, and writes the
   *  payment linkage. Any failure rolls everything back — payment and counter
   *  increment included — leaving the salary Pending. */
  async paySalary(id: string, body: unknown): Promise<SalaryRecord> {
    const data = parseBody(salaryPaySchema, body);

    return withTransaction(async (client) => {
      try {
        // Row lock serializes concurrent pay requests — the second one blocks
        // here until the first commits and then sees status = Paid → 409.
        const locked = await client.query(
          "SELECT * FROM salary_records WHERE id = $1 FOR UPDATE",
          [id]
        );
        if (!locked.rowCount) throw new AppError(404, "Salary record not found");
        const row = locked.rows[0];

        if (await salaryMonthIsClosed(str(row.month))) {
          throw new AppError(409, "This payroll month is closed and cannot be modified");
        }
        if (row.status !== "Pending" && row.status !== "Submitted") {
          throw new AppError(409, "Salary is not Pending or Submitted — it cannot be paid again");
        }
        if (row.payment_ref != null) {
          throw new AppError(409, "Duplicate payment — this salary already has a payment reference");
        }
        if (num(row.net_salary) <= 0) {
          throw new AppError(422, "Cannot pay a salary with zero or negative net amount");
        }

        // Create the Accounts Payment on the SAME transaction/connection so the
        // payment + its number-counter increment commit atomically with the
        // salary transition (or roll back together).
        const payment = await paymentsService.create(
          {
            paymentDate: data.paymentDate,
            paymentType: "Salary Payment",
            paidTo: str(row.employee_name),
            amount: num(row.net_salary),
            paymentMode: data.paymentMode,
            category: "Salary",
            status: "Paid",
            createdBy: data.paidBy ?? "system",
          },
          client
        );

        const updated = await client.query(
          `UPDATE salary_records SET
             status = 'Paid', payment_ref = $2, payment_date = $3, paid_at = NOW()
           WHERE id = $1 AND status IN ('Pending','Submitted') AND payment_ref IS NULL
           RETURNING *`,
          [id, payment.paymentNo, data.paymentDate]
        );
        if (!updated.rowCount) {
          // Concurrency safety net — the row changed under us despite the lock.
          throw new AppError(409, "Salary payment could not be applied");
        }
        const records = await this.enrichAttendance([mapSalary(updated.rows[0])], [str(row.month)]);
        return records[0];
      } catch (err) {
        // Roll back everything (payment + salary remain untouched).
        rethrowIfAppError(err);
        throw err;
      }
    });
  },

  /** PATCH /salaries/:id/status. Only target "Pending" is accepted by the route,
   *  but that single operation means different things depending on the current
   *  record state:
   *    - Pending   → Pending : idempotent no-op.
   *    - Submitted → Pending : un-submit (back to editable Draft) for correction.
   *    - Paid      → Pending : Mark-Unpaid — ONLY allowed inside the 7 calendar-day
   *                            correction window measured from paid_at. After the
   *                            window the record (and the whole month once all
   *                            records are paid) is permanently locked.
   *  Pending → Paid remains reserved for paySalary(). A closed payroll month
   *  rejects every transition. */
  async updateSalaryStatus(id: string): Promise<SalaryRecord> {
    const existing = await query("SELECT * FROM salary_records WHERE id = $1", [id]);
    if (!existing.rowCount) throw new AppError(404, "Salary record not found");
    const row = existing.rows[0];
    const month = str(row.month);
    if (await salaryMonthIsClosed(month)) {
      throw new AppError(409, "This payroll month is closed and cannot be modified");
    }

    if (row.status === "Pending") {
      const records = await this.enrichAttendance([mapSalary(row)], [month]);
      return records[0];
    }

    if (row.status === "Submitted") {
      const updated = await query(
        `UPDATE salary_records SET status = 'Pending', submitted_at = NULL, submitted_by = NULL
         WHERE id = $1 AND status = 'Submitted'
         RETURNING *`,
        [id]
      );
      if (!updated.rowCount) {
        throw new AppError(409, "Salary could not be moved back to draft (state changed unexpectedly)");
      }
      const records = await this.enrichAttendance([mapSalary(updated.rows[0])], [month]);
      return records[0];
    }

    // Paid → Pending (Mark-Unpaid): correction window only.
    if (row.status === "Paid") {
      if (correctionWindowExpired(row.paid_at == null ? null : String(row.paid_at))) {
        throw new AppError(
          409,
          "Correction window expired — paid salaries are permanently locked 7 calendar days after payment"
        );
      }
      const corrected = await withTransaction(async (client) => {
        const current = await client.query("SELECT * FROM salary_records WHERE id=$1 FOR UPDATE", [id]);
        const locked = current.rows[0];
        if (!locked || locked.status !== "Paid" || correctionWindowExpired(locked.paid_at == null ? null : String(locked.paid_at))) {
          throw new AppError(409, "Paid salary could not be reverted for correction (state changed unexpectedly)");
        }
        await client.query("UPDATE payments SET status='Cancelled',updated_at=NOW() WHERE payment_no=$1 AND payment_type='Salary Payment' AND status='Paid'", [locked.payment_ref]);
        const updated = await client.query(
          `UPDATE salary_records SET status='Pending',payment_ref=NULL,payment_date=NULL,paid_at=NULL
            WHERE id=$1 AND status='Paid' RETURNING *`, [id]
        );
        return mapSalary(updated.rows[0]);
      });
      const records = await this.enrichAttendance([corrected], [month]);
      return records[0];
    }

    throw new AppError(409, "Salary record is not in a supported lifecycle state and cannot be modified");
  },

  async deleteSalary(id: string): Promise<{ id: string; deleted: boolean }> {
    const existing = await query("SELECT status, month FROM salary_records WHERE id = $1", [id]);
    if (!existing.rowCount) throw new AppError(404, "Salary record not found");
    const row = existing.rows[0];
    if (await salaryMonthIsClosed(str(row.month))) {
      throw new AppError(409, "This payroll month is closed and cannot be modified");
    }
    if (row.status !== "Pending") {
      throw new AppError(
        409,
        str(row.status) === "Paid"
          ? "Paid salary records cannot be deleted"
          : "Submitted salary records cannot be deleted"
      );
    }
    const result = await query("DELETE FROM salary_records WHERE id = $1 AND status = 'Pending'", [id]);
    if (!result.rowCount) {
      throw new AppError(409, "Salary record is not in a Pending state and cannot be deleted");
    }
    return { id, deleted: true };
  },

  async salaryMonthSummary(month: string) {
    const result = await query(
      `SELECT COUNT(*)::int employees,
              COUNT(*) FILTER (WHERE status='Pending')::int pending,
              COUNT(*) FILTER (WHERE status='Submitted')::int submitted,
              COUNT(*) FILTER (WHERE status='Paid')::int paid
         FROM salary_records WHERE month=$1`, [month]
    );
    const row = result.rows[0];
    return { month, employees: num(row.employees), pending: num(row.pending), submitted: num(row.submitted), paid: num(row.paid), closed: await salaryMonthIsClosed(month) };
  },

  async submitSalaryMonth(month: string, submittedBy: string) {
    return withTransaction(async (client) => {
      const locked = await client.query("SELECT id,status FROM salary_records WHERE month=$1 ORDER BY id FOR UPDATE", [month]);
      if (!locked.rowCount) throw new AppError(404, "No salary records exist for this month");
      const paidCount = locked.rows.filter((row) => row.status === "Paid").length;
      const alreadySubmittedCount = locked.rows.filter((row) => row.status === "Submitted").length;
      const updated = await client.query(
        `UPDATE salary_records SET status='Submitted', submitted_at=NOW(), submitted_by=$2
          WHERE month=$1 AND status='Pending' RETURNING id`, [month, submittedBy]
      );
      return { month, submittedCount: updated.rowCount ?? 0, alreadySubmittedCount, paidCount, emailQueuedCount: 0, emailSentCount: 0, emailFailedCount: 0, emailSkippedCount: 0 };
    });
  },

  async bulkSalaryStatus(ids: string[], status: "Paid" | "Pending", input: { paymentDate?: string; paymentMode?: string; paidBy: string }) {
    return withTransaction(async (client) => {
      const locked = await client.query("SELECT * FROM salary_records WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE", [ids]);
      if (locked.rowCount !== ids.length) throw new AppError(404, "One or more salary records were not found");
      const updated: SalaryRecord[] = [];
      for (const row of locked.rows) {
        if (await salaryMonthIsClosed(str(row.month))) throw new AppError(409, `Payroll month ${row.month} is closed`);
        if (status === "Paid") {
          if (!input.paymentDate || !input.paymentMode) throw new AppError(400, "paymentDate and paymentMode are required");
          if (!["Pending", "Submitted"].includes(str(row.status)) || row.payment_ref != null) throw new AppError(409, `Salary ${row.id} cannot be paid from its current state`);
          if (num(row.net_salary) <= 0) throw new AppError(422, `Salary ${row.id} has no positive net amount`);
          const payment = await paymentsService.create({ paymentDate: input.paymentDate, paymentType: "Salary Payment", paidTo: str(row.employee_name), amount: num(row.net_salary), paymentMode: input.paymentMode, category: "Salary", status: "Paid", createdBy: input.paidBy }, client);
          const result = await client.query(`UPDATE salary_records SET status='Paid',payment_ref=$2,payment_date=$3,paid_at=NOW() WHERE id=$1 RETURNING *`, [row.id, payment.paymentNo, input.paymentDate]);
          updated.push(mapSalary(result.rows[0]));
        } else if (row.status === "Submitted") {
          const result = await client.query("UPDATE salary_records SET status='Pending',submitted_at=NULL,submitted_by=NULL WHERE id=$1 RETURNING *", [row.id]);
          updated.push(mapSalary(result.rows[0]));
        } else if (row.status === "Paid") {
          if (correctionWindowExpired(row.paid_at == null ? null : String(row.paid_at))) throw new AppError(409, `Salary ${row.id} correction window expired`);
          await client.query("UPDATE payments SET status='Cancelled',updated_at=NOW() WHERE payment_no=$1 AND payment_type='Salary Payment' AND status='Paid'", [row.payment_ref]);
          const result = await client.query("UPDATE salary_records SET status='Pending',payment_ref=NULL,payment_date=NULL,paid_at=NULL WHERE id=$1 RETURNING *", [row.id]);
          updated.push(mapSalary(result.rows[0]));
        } else {
          updated.push(mapSalary(row));
        }
      }
      return { updated, skipped: [] as Array<{ id: string; reason: string }> };
    });
  },

  async queuePayslipDelivery(channel: "email" | "whatsapp", ids: string[], payload: { language: string; subject?: string; body: string }, queuedBy: string) {
    return withTransaction(async (client) => {
      const rows = await client.query(
        `SELECT s.id,s.status,e.email,e.phone_number FROM salary_records s JOIN employees e ON e.id=s.employee_id
          WHERE s.id=ANY($1::uuid[]) ORDER BY s.id FOR UPDATE`, [ids]
      );
      if (rows.rowCount !== ids.length) throw new AppError(404, "One or more salary records were not found");
      let sent = 0, failed = 0;
      for (const row of rows.rows) {
        const recipient = channel === "email" ? str(row.email).trim() : str(row.phone_number).trim();
        if (!["Submitted", "Paid"].includes(str(row.status)) || !recipient) { failed++; continue; }
        const hash = createHash("sha256").update(JSON.stringify({ channel, recipient, language: payload.language, subject: payload.subject ?? "", body: payload.body })).digest("hex");
        const inserted = await client.query(
          `INSERT INTO salary_payslip_deliveries(salary_id,channel,recipient,language,subject,message_body,payload_hash,queued_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(salary_id,channel,payload_hash) DO NOTHING RETURNING id`,
          [row.id, channel, recipient, payload.language, payload.subject ?? null, payload.body, hash, queuedBy]
        );
        if (inserted.rowCount) sent++; else sent++; // idempotent retry counts the already queued request as accepted
      }
      return { sent, failed };
    });
  },

  async getSalaryById(id: string) {
    const result = await query("SELECT * FROM salary_records WHERE id=$1", [id]);
    if (!result.rowCount) throw new AppError(404, "Salary record not found");
    return mapSalary(result.rows[0]);
  },

  /** Applicable active advances for a salary month, keyed by employee. Only
   *  advances active by the last day of the salary month with a positive
   *  monthly deduction are considered. Recovery is capped at remaining_balance
   *  (never negative, never exceeding the balance). */
  async activeAdvanceRecovery(month: string): Promise<Map<number, { advanceRecovery: number; loanEMI: number }>> {
    // Use the first day of the month and an exclusive upper bound for the
    // following month. Constructing `${month}-31` is invalid for February and
    // the months with 30 days (for example, 2026-09-31).
    const monthStart = `${month}-01`;
    const result = await query(
      `SELECT employee_id, loan_type, monthly_deduction, remaining_balance
       FROM advance_loans
       WHERE status = 'Active' AND monthly_deduction > 0
         AND issued_date < ($1::date + INTERVAL '1 month')`,
      [monthStart]
    );
    const byEmp = new Map<number, { advanceRecovery: number; loanEMI: number }>();
    for (const row of result.rows) {
      const employeeId = num(row.employee_id);
      const entry = byEmp.get(employeeId) ?? { advanceRecovery: 0, loanEMI: 0 };
      const amount = Math.min(num(row.monthly_deduction), num(row.remaining_balance));
      if (amount > 0) {
        if (str(row.loan_type) === "Advance") entry.advanceRecovery += amount;
        else entry.loanEMI += amount;
      }
      byEmp.set(employeeId, entry);
    }
    return byEmp;
  },

  /** Bulk generation. Creates salary rows only for employees that do not yet
   *  have a record for the month (UNIQUE(employee_id, month) is the final DB
   *  guard — the INSERT also uses ON CONFLICT DO NOTHING so re-runs are safe
   *  and idempotent). Runs transactionally; a failure rolls back the whole
   *  batch so no partial month is ever produced. */
  async generateForMonth(month: string, department?: string): Promise<{
    month: string;
    department: string | null;
    requested: number;
    generated: number;
    skippedExisting: number;
  }> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new AppError(400, "month must be a valid YYYY-MM value");
    }
    if (await salaryMonthIsClosed(month)) {
      throw new AppError(409, "This payroll month is closed — salary regeneration is not allowed");
    }

    const empClauses = ["status IN ('Active','Inactive','Suspended')"];
    const empParams: unknown[] = [];
    if (department) {
      empParams.push(department);
      empClauses.push(`department = $${empParams.length}`);
    }
    const employees = await query(
      `SELECT * FROM employees WHERE ${empClauses.join(" AND ")} ORDER BY id`,
      empParams
    );

    const existingRows = await query(
      "SELECT employee_id FROM salary_records WHERE month = $1",
      [month]
    );
    const existingSet = new Set(existingRows.rows.map((r) => num(r.employee_id)));

    const recovery = await this.activeAdvanceRecovery(month);

    let generated = 0;
    await withTransaction(async (client) => {
      for (const emp of employees.rows) {
        const employeeId = num(emp.id);
        if (existingSet.has(employeeId)) continue;
        const rec = recovery.get(employeeId) ?? { advanceRecovery: 0, loanEMI: 0 };

        const totals = salaryCalculationService.calculateTotals({
          basicSalary: num(emp.salary),
          overtime: 0,
          incentives: 0,
          fuelAllowance: 0,
          nightAllowance: 0,
          leaveDeduction: 0,
          advanceRecovery: rec.advanceRecovery,
          loanEMI: rec.loanEMI,
          latePenalty: 0,
          otherDeductions: 0,
        });

        const inserted = await client.query(
          `INSERT INTO salary_records (
             employee_id, employee_name, department, month, basic_salary, overtime,
             incentives, fuel_allowance, night_allowance, total_gross, leave_deduction,
             advance_recovery, loan_emi, late_penalty, other_deductions, total_deductions,
             net_salary, status
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'Pending')
           ON CONFLICT (employee_id, month) DO NOTHING`,
          [
            employeeId,
            str(emp.employee_name),
            str(emp.department),
            month,
            num(emp.salary),
            0, 0, 0, 0,
            totals.totalGross,
            0,
            rec.advanceRecovery,
            rec.loanEMI,
            0, 0,
            totals.totalDeductions,
            totals.netSalary,
          ]
        );
        generated += inserted.rowCount ?? 0;
      }
    });

    return {
      month,
      department: department ?? null,
      requested: employees.rows.length,
      generated,
      skippedExisting: employees.rows.length - generated,
    };
  },

  // ── Advance / Loan ────────────────────────────────────────────
  async listAdvances(type?: string, status?: string) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (type) {
      params.push(type);
      clauses.push(`loan_type = $${params.length}`);
    }
    if (status && status !== "All") {
      params.push(status);
      clauses.push(`status = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await query(
      `SELECT * FROM advance_loans ${where} ORDER BY issued_date DESC`,
      params
    );
    return result.rows.map(mapAdvance);
  },

  async createAdvance(body: Omit<AdvanceLoan, "id">) {
    const result = await query(
      `INSERT INTO advance_loans (
         employee_id, employee_name, loan_type, principal, issued_date,
         total_repaid, monthly_deduction, remaining_balance, status,
         interest_rate, tenure_months
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        body.employeeId,
        body.employeeName,
        body.type,
        body.principal,
        body.issuedDate,
        body.totalRepaid ?? 0,
        body.monthlyDeduction ?? 0,
        body.remainingBalance ?? body.principal,
        body.status ?? "Active",
        body.interestRate ?? null,
        body.tenure ?? null,
      ]
    );
    return mapAdvance(result.rows[0]);
  },

  // ── Attendance ────────────────────────────────────────────────
  async listAttendance(month?: string, department?: string) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (month) {
      params.push(month);
      clauses.push(`month = $${params.length}`);
    }
    if (department) {
      params.push(department);
      clauses.push(`department = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await query(
      `SELECT * FROM attendance_records ${where} ORDER BY employee_name`,
      params
    );
    return result.rows.map(mapAttendance);
  },

  async upsertAttendance(body: AttendanceRecord) {
    const result = await query(
      `INSERT INTO attendance_records (
         employee_id, employee_name, department, month, day_marks,
         present_count, absent_count, leave_count, half_day_count
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)
       ON CONFLICT (employee_id, month) DO UPDATE SET
         employee_name = EXCLUDED.employee_name,
         department = EXCLUDED.department,
         day_marks = EXCLUDED.day_marks,
         present_count = EXCLUDED.present_count,
         absent_count = EXCLUDED.absent_count,
         leave_count = EXCLUDED.leave_count,
         half_day_count = EXCLUDED.half_day_count
       RETURNING *`,
      [
        body.employeeId,
        body.employeeName,
        body.department ?? "",
        body.month,
        JSON.stringify(body.dayMarks ?? {}),
        body.presentCount ?? 0,
        body.absentCount ?? 0,
        body.leaveCount ?? 0,
        body.halfDayCount ?? 0,
      ]
    );
    return mapAttendance(result.rows[0]);
  },
};
