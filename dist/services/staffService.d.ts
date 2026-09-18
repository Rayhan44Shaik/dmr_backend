import type { AdvanceLoan, AttendanceRecord, DutyAssignment, LeaveRequest, SalaryRecord } from "../types/models.js";
export declare const staffService: {
    listDuties(fromDate?: string, toDate?: string, department?: string): Promise<DutyAssignment[]>;
    upsertDuty(body: Omit<DutyAssignment, "id"> & {
        id?: string;
    }): Promise<DutyAssignment>;
    deleteDuty(id: string): Promise<{
        id: string;
        deleted: boolean;
    }>;
    /** Inclusive calendar-day count for a [from, to] date range (from <= to). */
    inclusiveDays(from: string, to: string): number;
    /** Last day of a YYYY-MM month as a YYYY-MM-DD string. */
    lastDayOfMonth(month: string): string;
    listLeaves(filters?: {
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
    }): Promise<{
        items: LeaveRequest[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    createLeave(body: {
        employeeId: number;
        employeeName?: string;
        type: LeaveRequest["type"];
        fromDate: string;
        toDate: string;
        days?: number;
        reason?: string | null;
    }): Promise<LeaveRequest>;
    getLeaveById(id: string): Promise<LeaveRequest>;
    updateLeaveStatus(id: string, status: LeaveRequest["status"], opts?: {
        approvedBy?: string;
        rejectionReason?: string;
    }): Promise<LeaveRequest>;
    deleteLeave(id: string): Promise<{
        id: string;
        deleted: boolean;
    }>;
    /** Authoritative employee-level leave report for a month.
     *  approvedLeaveDays counts DISTINCT approved calendar dates within the month
     *  (inclusive from_date..to_date), cross-month leave split per month — exactly
     *  the same calendar-day rule getAttendanceSummary uses, so the Leave Report
     *  can never disagree with Salary leaveDays. */
    getLeaveReport(filters: {
        month: string;
        department?: string;
        employeeId?: number;
    }): Promise<{
        month: string;
        items: {
            employeeId: number;
            employeeNo: number;
            employeeName: string;
            department: string;
            approvedLeaveDays: number;
            pendingLeaveDays: number;
            rejectedLeaveDays: number;
            leaveDates: string[];
            leaveTypes: string[];
        }[];
    }>;
    /** Enrich salary rows with attendance figures derived from the authoritative
     *  Duty Planner data (duty_assignments + approved leave) at read time. These
     *  figures are never stored on the salary row — no duty data is duplicated. */
    enrichAttendance(records: SalaryRecord[], months: string[]): Promise<SalaryRecord[]>;
    listSalaries(month?: string, department?: string): Promise<SalaryRecord[]>;
    getEmployeeSalary(employeeId: number, month: string): Promise<SalaryRecord>;
    /** Look up the DB employee (validates employeeId) and resolve the default
     *  basicSalary from the Employee Master when the client did not supply one. */
    resolveEmployeeBase(employeeId: number): Promise<{
        name: string;
        department: string;
        baseSalary: number;
    }>;
    createSalary(body: unknown): Promise<SalaryRecord>;
    /** POST /salaries/:id/submit — Draft (Pending) → Submitted. Freezes the row:
     *  no normal editing afterwards. Only Draft records can be submitted, and a
     *  closed payroll month rejects submission. */
    submitSalary(id: string, submittedBy?: string): Promise<SalaryRecord>;
    /** PUT /salaries/:id — only Draft (Pending) records are editable; Submitted
     *  and Paid records are frozen. Totals are always recomputed on the backend
     *  from the supplied components. A closed payroll month rejects all edits. */
    updateSalaryById(id: string, body: unknown): Promise<SalaryRecord>;
    /**
     * Backward-compatible upsert (POST /salaries + PUT /salaries + seed script):
     * create when no row exists for (employee_id, month); update when the existing
     * row is Pending; reject financial edits on a Paid row. employeeName /
     * department / status / totalGross / netSalary supplied by the caller are
     * never trusted — name/department come from the Employee Master and ALL
     * totals are recomputed by the authoritative calculation engine.
     */
    upsertSalary(body: unknown): Promise<SalaryRecord>;
    /** Pending → Paid. The ONLY legal transition to Paid: creates the Accounts
     *  payment inside the same transaction, receives the payment number, locks
     *  the salary row, verifies it is Pending with no payment_ref, and writes the
     *  payment linkage. Any failure rolls everything back — payment and counter
     *  increment included — leaving the salary Pending. */
    paySalary(id: string, body: unknown): Promise<SalaryRecord>;
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
    updateSalaryStatus(id: string): Promise<SalaryRecord>;
    deleteSalary(id: string): Promise<{
        id: string;
        deleted: boolean;
    }>;
    salaryMonthSummary(month: string): Promise<{
        month: string;
        employees: number;
        pending: number;
        submitted: number;
        paid: number;
        closed: boolean;
    }>;
    submitSalaryMonth(month: string, submittedBy: string): Promise<{
        month: string;
        submittedCount: number;
        alreadySubmittedCount: number;
        paidCount: number;
        emailQueuedCount: number;
        emailSentCount: number;
        emailFailedCount: number;
        emailSkippedCount: number;
    }>;
    bulkSalaryStatus(ids: string[], status: "Paid" | "Pending", input: {
        paymentDate?: string;
        paymentMode?: string;
        paidBy: string;
    }): Promise<{
        updated: SalaryRecord[];
        skipped: Array<{
            id: string;
            reason: string;
        }>;
    }>;
    queuePayslipDelivery(channel: "email" | "whatsapp", ids: string[], payload: {
        language: string;
        subject?: string;
        body: string;
    }, queuedBy: string): Promise<{
        sent: number;
        failed: number;
    }>;
    getSalaryById(id: string): Promise<SalaryRecord>;
    /** Applicable active advances for a salary month, keyed by employee. Only
     *  advances active by the last day of the salary month with a positive
     *  monthly deduction are considered. Recovery is capped at remaining_balance
     *  (never negative, never exceeding the balance). */
    activeAdvanceRecovery(month: string): Promise<Map<number, {
        advanceRecovery: number;
        loanEMI: number;
    }>>;
    /** Bulk generation. Creates salary rows only for employees that do not yet
     *  have a record for the month (UNIQUE(employee_id, month) is the final DB
     *  guard — the INSERT also uses ON CONFLICT DO NOTHING so re-runs are safe
     *  and idempotent). Runs transactionally; a failure rolls back the whole
     *  batch so no partial month is ever produced. */
    generateForMonth(month: string, department?: string): Promise<{
        month: string;
        department: string | null;
        requested: number;
        generated: number;
        skippedExisting: number;
    }>;
    listAdvances(type?: string, status?: string): Promise<AdvanceLoan[]>;
    createAdvance(body: Omit<AdvanceLoan, "id">): Promise<AdvanceLoan>;
    listAttendance(month?: string, department?: string): Promise<AttendanceRecord[]>;
    upsertAttendance(body: AttendanceRecord): Promise<AttendanceRecord>;
};
