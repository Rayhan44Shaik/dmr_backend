import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { rethrowIfAppError } from "../utils/pgErrors.js";
import { dateOnly, isoOrNull, num, numOrNull, str } from "../utils/coerce.js";
import { salaryCalculationService } from "./salaryCalculationService.js";
import { dutyPlannerService } from "./dutyPlannerService.js";
import { paymentsService } from "./paymentsService.js";
import { parseBody, salaryCreateSchema, salaryPaySchema, salaryUpdateSchema } from "../validation/salary.js";
function mapDuty(row) {
    return {
        id: str(row.id),
        employeeId: num(row.employee_id),
        employeeName: str(row.employee_name),
        department: str(row.department),
        role: str(row.role),
        dutyType: str(row.duty_type),
        date: dateOnly(row.duty_date) ?? "",
        vehicleId: numOrNull(row.vehicle_id),
        vehicleNo: row.vehicle_no == null ? null : str(row.vehicle_no),
    };
}
function mapLeave(row) {
    return {
        id: str(row.id),
        employeeId: num(row.employee_id),
        employeeName: str(row.employee_name),
        type: str(row.leave_type),
        fromDate: dateOnly(row.from_date) ?? "",
        toDate: dateOnly(row.to_date) ?? "",
        days: num(row.days),
        status: str(row.status),
        reason: row.reason == null ? null : str(row.reason),
        rejectionReason: row.rejection_reason == null ? null : str(row.rejection_reason),
        createdAt: isoOrNull(row.created_at) ?? "",
        approvedBy: row.approved_by == null ? null : str(row.approved_by),
        approvedAt: isoOrNull(row.approved_at),
    };
}
function mapSalary(row) {
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
        status: str(row.status),
        paymentDate: dateOnly(row.payment_date),
        paymentRef: row.payment_ref == null ? null : str(row.payment_ref),
        paidAt: isoOrNull(row.paid_at),
        createdAt: isoOrNull(row.created_at) ?? "",
    };
}
function mapAdvance(row) {
    return {
        id: str(row.id),
        employeeId: num(row.employee_id),
        employeeName: str(row.employee_name),
        type: str(row.loan_type),
        principal: num(row.principal),
        issuedDate: dateOnly(row.issued_date) ?? "",
        totalRepaid: num(row.total_repaid),
        monthlyDeduction: num(row.monthly_deduction),
        remainingBalance: num(row.remaining_balance),
        status: str(row.status),
        interestRate: numOrNull(row.interest_rate),
        tenure: numOrNull(row.tenure_months),
    };
}
function mapAttendance(row) {
    return {
        employeeId: num(row.employee_id),
        employeeName: str(row.employee_name),
        department: str(row.department),
        month: str(row.month),
        dayMarks: row.day_marks ?? {},
        presentCount: num(row.present_count),
        absentCount: num(row.absent_count),
        leaveCount: num(row.leave_count),
        halfDayCount: num(row.half_day_count),
    };
}
export const staffService = {
    // ── Duty Planner ──────────────────────────────────────────────
    async listDuties(fromDate, toDate, department) {
        const clauses = [];
        const params = [];
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
        const result = await query(`SELECT * FROM duty_assignments ${where} ORDER BY duty_date, employee_name`, params);
        return result.rows.map(mapDuty);
    },
    async upsertDuty(body) {
        if (body.id) {
            const result = await query(`UPDATE duty_assignments SET
           employee_id=$2, employee_name=$3, department=$4, role=$5,
           duty_type=$6, duty_date=$7, vehicle_id=$8, vehicle_no=$9
         WHERE id=$1 RETURNING *`, [
                body.id,
                body.employeeId,
                body.employeeName,
                body.department ?? "",
                body.role ?? "",
                body.dutyType,
                body.date,
                body.vehicleId ?? null,
                body.vehicleNo ?? null,
            ]);
            if (!result.rowCount)
                throw new AppError(404, "Duty assignment not found");
            return mapDuty(result.rows[0]);
        }
        const result = await query(`INSERT INTO duty_assignments (
         employee_id, employee_name, department, role, duty_type, duty_date, vehicle_id, vehicle_no
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (employee_id, duty_date) DO UPDATE SET
         employee_name = EXCLUDED.employee_name,
         department = EXCLUDED.department,
         role = EXCLUDED.role,
         duty_type = EXCLUDED.duty_type,
         vehicle_id = EXCLUDED.vehicle_id,
         vehicle_no = EXCLUDED.vehicle_no
       RETURNING *`, [
            body.employeeId,
            body.employeeName,
            body.department ?? "",
            body.role ?? "",
            body.dutyType,
            body.date,
            body.vehicleId ?? null,
            body.vehicleNo ?? null,
        ]);
        return mapDuty(result.rows[0]);
    },
    async deleteDuty(id) {
        const result = await query(`DELETE FROM duty_assignments WHERE id = $1 RETURNING id`, [id]);
        if (!result.rowCount)
            throw new AppError(404, "Duty assignment not found");
        return { id, deleted: true };
    },
    // ── Leave ─────────────────────────────────────────────────────
    async listLeaves(status) {
        const result = status && status !== "All"
            ? await query(`SELECT * FROM leave_requests WHERE status = $1 ORDER BY created_at DESC`, [status])
            : await query(`SELECT * FROM leave_requests ORDER BY created_at DESC`);
        return result.rows.map(mapLeave);
    },
    async createLeave(body) {
        const result = await query(`INSERT INTO leave_requests (
         employee_id, employee_name, leave_type, from_date, to_date, days, status, reason
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [
            body.employeeId,
            body.employeeName,
            body.type,
            body.fromDate,
            body.toDate,
            body.days,
            body.status ?? "Pending",
            body.reason ?? null,
        ]);
        return mapLeave(result.rows[0]);
    },
    async updateLeaveStatus(id, status, opts = {}) {
        const result = await query(`UPDATE leave_requests SET
         status = $2,
         approved_by = CASE WHEN $2 = 'Approved' THEN $3 ELSE approved_by END,
         approved_at = CASE WHEN $2 = 'Approved' THEN NOW() ELSE approved_at END,
         rejection_reason = CASE WHEN $2 = 'Rejected' THEN $4 ELSE rejection_reason END
       WHERE id = $1 RETURNING *`, [id, status, opts.approvedBy ?? null, opts.rejectionReason ?? null]);
        if (!result.rowCount)
            throw new AppError(404, "Leave request not found");
        return mapLeave(result.rows[0]);
    },
    // ── Salary ────────────────────────────────────────────────────
    /** Enrich salary rows with attendance figures derived from the authoritative
     *  Duty Planner data (duty_assignments + approved leave) at read time. These
     *  figures are never stored on the salary row — no duty data is duplicated. */
    async enrichAttendance(records, months) {
        const attByMonth = new Map();
        for (const m of months) {
            const summary = await dutyPlannerService.getAttendanceSummary(m);
            attByMonth.set(m, summary.rows);
        }
        return records.map((r) => {
            const rows = attByMonth.get(r.month) ?? [];
            const match = rows.find((x) => num(x.employeeId) === r.employeeId);
            if (!match)
                return r;
            return {
                ...r,
                workingDays: num(match.workingDays),
                presentDays: num(match.presentCount),
                leaveDays: num(match.leaveCount),
                weeklyOffDays: num(match.weeklyOffCount),
            };
        });
    },
    async listSalaries(month, department) {
        const clauses = [];
        const params = [];
        if (month) {
            params.push(month);
            clauses.push(`month = $${params.length}`);
        }
        if (department) {
            params.push(department);
            clauses.push(`department = $${params.length}`);
        }
        const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
        const result = await query(`SELECT * FROM salary_records ${where} ORDER BY employee_name`, params);
        const records = result.rows.map(mapSalary);
        const months = Array.from(new Set(records.map((r) => r.month)));
        return this.enrichAttendance(records, months);
    },
    async getEmployeeSalary(employeeId, month) {
        const emp = await query("SELECT id FROM employees WHERE id = $1", [employeeId]);
        if (!emp.rowCount)
            throw new AppError(404, "Employee not found");
        const result = await query(`SELECT * FROM salary_records WHERE employee_id = $1 AND month = $2`, [employeeId, month]);
        if (!result.rowCount)
            throw new AppError(404, "Salary record not found for this employee and month");
        const records = await this.enrichAttendance([mapSalary(result.rows[0])], [month]);
        return records[0];
    },
    /** Look up the DB employee (validates employeeId) and resolve the default
     *  basicSalary from the Employee Master when the client did not supply one. */
    async resolveEmployeeBase(employeeId) {
        const result = await query("SELECT id, employee_name, department, salary FROM employees WHERE id = $1", [employeeId]);
        if (!result.rowCount)
            throw new AppError(404, "Employee not found");
        const row = result.rows[0];
        return {
            name: str(row.employee_name),
            department: str(row.department),
            baseSalary: num(row.salary),
        };
    },
    async createSalary(body) {
        const data = parseBody(salaryCreateSchema, body);
        const emp = await this.resolveEmployeeBase(data.employeeId);
        const dup = await query("SELECT id FROM salary_records WHERE employee_id = $1 AND month = $2", [data.employeeId, data.month]);
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
        const result = await query(`INSERT INTO salary_records (
         employee_id, employee_name, department, month, basic_salary, overtime,
         incentives, fuel_allowance, night_allowance, total_gross, leave_deduction,
         advance_recovery, loan_emi, late_penalty, other_deductions, total_deductions,
         net_salary, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'Pending')
       RETURNING *`, [
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
        ]);
        return mapSalary(result.rows[0]);
    },
    /** PUT /salaries/:id — only Pending records are editable; totals are always
     *  recomputed on the backend from the supplied components. */
    async updateSalaryById(id, body) {
        const data = parseBody(salaryUpdateSchema, body);
        const existing = await query("SELECT * FROM salary_records WHERE id = $1", [id]);
        if (!existing.rowCount)
            throw new AppError(404, "Salary record not found");
        const row = existing.rows[0];
        if (row.status === "Paid") {
            throw new AppError(409, "Paid salary records cannot be edited");
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
        const result = await query(`UPDATE salary_records SET
         basic_salary = $2, overtime = $3, incentives = $4,
         fuel_allowance = $5, night_allowance = $6, total_gross = $7,
         leave_deduction = $8, advance_recovery = $9, loan_emi = $10,
         late_penalty = $11, other_deductions = $12, total_deductions = $13,
         net_salary = $14
       WHERE id = $1 AND status = 'Pending'
       RETURNING *`, [
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
        ]);
        if (!result.rowCount)
            throw new AppError(409, "Salary record is not in a Pending state and cannot be edited");
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
    async upsertSalary(body) {
        const data = parseBody(salaryCreateSchema, body);
        const existing = await query("SELECT id, status, month FROM salary_records WHERE employee_id = $1 AND month = $2", [data.employeeId, data.month]);
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
    async paySalary(id, body) {
        const data = parseBody(salaryPaySchema, body);
        return withTransaction(async (client) => {
            try {
                // Row lock serializes concurrent pay requests — the second one blocks
                // here until the first commits and then sees status = Paid → 409.
                const locked = await client.query("SELECT * FROM salary_records WHERE id = $1 FOR UPDATE", [id]);
                if (!locked.rowCount)
                    throw new AppError(404, "Salary record not found");
                const row = locked.rows[0];
                if (row.status !== "Pending") {
                    throw new AppError(409, "Salary is not Pending — it cannot be paid again");
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
                const payment = await paymentsService.create({
                    paymentDate: data.paymentDate,
                    paymentType: "Salary Payment",
                    paidTo: str(row.employee_name),
                    amount: num(row.net_salary),
                    paymentMode: data.paymentMode,
                    category: "Salary",
                    status: "Paid",
                    createdBy: data.paidBy ?? "system",
                }, client);
                const updated = await client.query(`UPDATE salary_records SET
             status = 'Paid', payment_ref = $2, payment_date = $3, paid_at = NOW()
           WHERE id = $1 AND status = 'Pending' AND payment_ref IS NULL
           RETURNING *`, [id, payment.paymentNo, data.paymentDate]);
                if (!updated.rowCount) {
                    // Concurrency safety net — the row changed under us despite the lock.
                    throw new AppError(409, "Salary payment could not be applied");
                }
                const records = await this.enrichAttendance([mapSalary(updated.rows[0])], [str(row.month)]);
                return records[0];
            }
            catch (err) {
                // Roll back everything (payment + salary remain untouched).
                rethrowIfAppError(err);
                throw err;
            }
        });
    },
    /** PATCH /salaries/:id/status. Only target "Pending" is possible (validated
     *  in the route); this is an idempotent no-op that never reaches "Paid" —
     *  Pending → Paid is reserved for paySalary(). */
    async updateSalaryStatus(id) {
        const existing = await query("SELECT * FROM salary_records WHERE id = $1", [id]);
        if (!existing.rowCount)
            throw new AppError(404, "Salary record not found");
        const row = existing.rows[0];
        if (row.status === "Paid") {
            throw new AppError(409, "Paid salary cannot be moved back to Pending");
        }
        const records = await this.enrichAttendance([mapSalary(row)], [str(row.month)]);
        return records[0];
    },
    async deleteSalary(id) {
        const existing = await query("SELECT status FROM salary_records WHERE id = $1", [id]);
        if (!existing.rowCount)
            throw new AppError(404, "Salary record not found");
        if (existing.rows[0].status === "Paid") {
            throw new AppError(409, "Paid salary records cannot be deleted");
        }
        await query("DELETE FROM salary_records WHERE id = $1 AND status = 'Pending'", [id]);
        return { id, deleted: true };
    },
    /** Applicable active advances for a salary month, keyed by employee. Only
     *  advances active by the last day of the salary month with a positive
     *  monthly deduction are considered. Recovery is capped at remaining_balance
     *  (never negative, never exceeding the balance). */
    async activeAdvanceRecovery(month) {
        const monthEnd = `${month}-31`;
        const result = await query(`SELECT employee_id, loan_type, monthly_deduction, remaining_balance
       FROM advance_loans
       WHERE status = 'Active' AND monthly_deduction > 0 AND issued_date <= $1::date`, [monthEnd]);
        const byEmp = new Map();
        for (const row of result.rows) {
            const employeeId = num(row.employee_id);
            const entry = byEmp.get(employeeId) ?? { advanceRecovery: 0, loanEMI: 0 };
            const amount = Math.min(num(row.monthly_deduction), num(row.remaining_balance));
            if (amount > 0) {
                if (str(row.loan_type) === "Advance")
                    entry.advanceRecovery += amount;
                else
                    entry.loanEMI += amount;
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
    async generateForMonth(month, department) {
        if (!/^\d{4}-\d{2}$/.test(month)) {
            throw new AppError(400, "month must be in YYYY-MM format");
        }
        const empClauses = ["status IN ('Active','Inactive','Suspended')"];
        const empParams = [];
        if (department) {
            empParams.push(department);
            empClauses.push(`department = $${empParams.length}`);
        }
        const employees = await query(`SELECT * FROM employees WHERE ${empClauses.join(" AND ")} ORDER BY id`, empParams);
        const existingRows = await query("SELECT employee_id FROM salary_records WHERE month = $1", [month]);
        const existingSet = new Set(existingRows.rows.map((r) => num(r.employee_id)));
        const recovery = await this.activeAdvanceRecovery(month);
        let generated = 0;
        await withTransaction(async (client) => {
            for (const emp of employees.rows) {
                const employeeId = num(emp.id);
                if (existingSet.has(employeeId))
                    continue;
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
                const inserted = await client.query(`INSERT INTO salary_records (
             employee_id, employee_name, department, month, basic_salary, overtime,
             incentives, fuel_allowance, night_allowance, total_gross, leave_deduction,
             advance_recovery, loan_emi, late_penalty, other_deductions, total_deductions,
             net_salary, status
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'Pending')
           ON CONFLICT (employee_id, month) DO NOTHING`, [
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
                ]);
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
    async listAdvances(type, status) {
        const clauses = [];
        const params = [];
        if (type) {
            params.push(type);
            clauses.push(`loan_type = $${params.length}`);
        }
        if (status && status !== "All") {
            params.push(status);
            clauses.push(`status = $${params.length}`);
        }
        const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
        const result = await query(`SELECT * FROM advance_loans ${where} ORDER BY issued_date DESC`, params);
        return result.rows.map(mapAdvance);
    },
    async createAdvance(body) {
        const result = await query(`INSERT INTO advance_loans (
         employee_id, employee_name, loan_type, principal, issued_date,
         total_repaid, monthly_deduction, remaining_balance, status,
         interest_rate, tenure_months
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [
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
        ]);
        return mapAdvance(result.rows[0]);
    },
    // ── Attendance ────────────────────────────────────────────────
    async listAttendance(month, department) {
        const clauses = [];
        const params = [];
        if (month) {
            params.push(month);
            clauses.push(`month = $${params.length}`);
        }
        if (department) {
            params.push(department);
            clauses.push(`department = $${params.length}`);
        }
        const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
        const result = await query(`SELECT * FROM attendance_records ${where} ORDER BY employee_name`, params);
        return result.rows.map(mapAttendance);
    },
    async upsertAttendance(body) {
        const result = await query(`INSERT INTO attendance_records (
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
       RETURNING *`, [
            body.employeeId,
            body.employeeName,
            body.department ?? "",
            body.month,
            JSON.stringify(body.dayMarks ?? {}),
            body.presentCount ?? 0,
            body.absentCount ?? 0,
            body.leaveCount ?? 0,
            body.halfDayCount ?? 0,
        ]);
        return mapAttendance(result.rows[0]);
    },
};
//# sourceMappingURL=staffService.js.map