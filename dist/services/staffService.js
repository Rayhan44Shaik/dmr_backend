import { query } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { dateOnly, isoOrNull, num, numOrNull, str } from "../utils/coerce.js";
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
        month: str(row.month),
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
        return result.rows.map(mapSalary);
    },
    async upsertSalary(body) {
        const gross = body.totalGross ??
            num(body.basicSalary) +
                num(body.overtime) +
                num(body.incentives) +
                num(body.fuelAllowance) +
                num(body.nightAllowance);
        const deductions = body.totalDeductions ??
            num(body.leaveDeduction) +
                num(body.advanceRecovery) +
                num(body.loanEMI) +
                num(body.latePenalty) +
                num(body.otherDeductions);
        const net = body.netSalary ?? gross - deductions;
        const result = await query(`INSERT INTO salary_records (
         employee_id, employee_name, department, month, basic_salary, overtime,
         incentives, fuel_allowance, night_allowance, total_gross, leave_deduction,
         advance_recovery, loan_emi, late_penalty, other_deductions, total_deductions,
         net_salary, status, payment_date
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (employee_id, month) DO UPDATE SET
         employee_name = EXCLUDED.employee_name,
         department = EXCLUDED.department,
         basic_salary = EXCLUDED.basic_salary,
         overtime = EXCLUDED.overtime,
         incentives = EXCLUDED.incentives,
         fuel_allowance = EXCLUDED.fuel_allowance,
         night_allowance = EXCLUDED.night_allowance,
         total_gross = EXCLUDED.total_gross,
         leave_deduction = EXCLUDED.leave_deduction,
         advance_recovery = EXCLUDED.advance_recovery,
         loan_emi = EXCLUDED.loan_emi,
         late_penalty = EXCLUDED.late_penalty,
         other_deductions = EXCLUDED.other_deductions,
         total_deductions = EXCLUDED.total_deductions,
         net_salary = EXCLUDED.net_salary,
         status = EXCLUDED.status,
         payment_date = EXCLUDED.payment_date
       RETURNING *`, [
            body.employeeId,
            body.employeeName,
            body.department ?? "",
            body.month,
            body.basicSalary ?? 0,
            body.overtime ?? 0,
            body.incentives ?? 0,
            body.fuelAllowance ?? 0,
            body.nightAllowance ?? 0,
            gross,
            body.leaveDeduction ?? 0,
            body.advanceRecovery ?? 0,
            body.loanEMI ?? 0,
            body.latePenalty ?? 0,
            body.otherDeductions ?? 0,
            deductions,
            net,
            body.status ?? "Pending",
            body.paymentDate || null,
        ]);
        return mapSalary(result.rows[0]);
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