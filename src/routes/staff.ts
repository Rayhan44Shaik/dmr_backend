import { Router, type Request } from "express";
import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import { staffService } from "../services/staffService.js";
import { dutyPlannerService } from "../services/dutyPlannerService.js";
import { staffPerformanceService } from "../services/staffPerformanceService.js";
import {
  parseBody,
  salaryGenerateSchema,
  salaryListQuerySchema,
  salaryStatusPatchSchema,
  salarySubmitSchema,
} from "../validation/salary.js";
import type {
  SalaryGenerateBody,
  SalaryListQuery,
} from "../validation/salary.js";
import {
  leaveCreateSchema,
  leaveListQuerySchema,
  leaveReportQuerySchema,
  leaveStatusSchema,
} from "../validation/leave.js";
import { staffBoundary } from "../middleware/staffBoundary.js";
import { authUser } from "../middleware/auth.js";
import type {
  LeaveCreateBody,
  LeaveListQuery,
  LeaveReportQuery,
  LeaveStatusBody,
} from "../validation/leave.js";

export const staffRouter = Router();
staffRouter.use(staffBoundary);

function performanceParams(req: Request, key: "driverId" | "supervisorId") {
  const rawId = req.query[key];
  return {
    fromDate: typeof req.query.fromDate === "string" ? req.query.fromDate : "",
    toDate: typeof req.query.toDate === "string" ? req.query.toDate : "",
    search: typeof req.query.search === "string" ? req.query.search.slice(0, 200) : undefined,
    personId: typeof rawId === "string" && rawId !== "" ? Number(rawId) : undefined,
  };
}

staffRouter.get("/performance/drivers", asyncHandler(async (req, res) => {
  res.json(await staffPerformanceService.drivers(performanceParams(req, "driverId")));
}));

staffRouter.get("/performance/supervisors", asyncHandler(async (req, res) => {
  res.json(await staffPerformanceService.supervisors(performanceParams(req, "supervisorId")));
}));

// Duty Planner
staffRouter.get(
  "/duties",
  asyncHandler(async (req, res) => {
    res.json(
      await staffService.listDuties(
        typeof req.query.fromDate === "string" ? req.query.fromDate : undefined,
        typeof req.query.toDate === "string" ? req.query.toDate : undefined,
        typeof req.query.department === "string" ? req.query.department : undefined
      )
    );
  })
);

staffRouter.post(
  "/duties",
  asyncHandler(async (req, res) => {
    res.status(201).json(await staffService.upsertDuty(req.body));
  })
);

staffRouter.put(
  "/duties/:id",
  asyncHandler(async (req, res) => {
    res.json(await staffService.upsertDuty({ ...req.body, id: req.params.id }));
  })
);

staffRouter.delete(
  "/duties/:id",
  asyncHandler(async (req, res) => {
    res.json(await staffService.deleteDuty(req.params.id));
  })
);

// Leave
staffRouter.get(
  "/leaves/report",
  asyncHandler(async (req, res) => {
    const query = parseBody(leaveReportQuerySchema, req.query) as LeaveReportQuery;
    res.json(await staffService.getLeaveReport(query));
  })
);

staffRouter.get(
  "/leaves",
  asyncHandler(async (req, res) => {
    const query = parseBody(leaveListQuerySchema, req.query) as LeaveListQuery;
    res.json(await staffService.listLeaves(query));
  })
);

staffRouter.post(
  "/leaves",
  asyncHandler(async (req, res) => {
    const body = parseBody(leaveCreateSchema, req.body) as LeaveCreateBody;
    res.status(201).json(await staffService.createLeave(body));
  })
);

staffRouter.patch(
  "/leaves/:id/status",
  asyncHandler(async (req, res) => {
    const body = parseBody(leaveStatusSchema, req.body) as LeaveStatusBody;
    res.json(
      await staffService.updateLeaveStatus(req.params.id, body.status, {
        approvedBy: authUser(res).displayName,
        rejectionReason: body.rejectionReason,
      })
    );
  })
);

staffRouter.delete(
  "/leaves/:id",
  asyncHandler(async (req, res) => {
    res.json(await staffService.deleteLeave(req.params.id));
  })
);

// Salary
staffRouter.get(
  "/salaries",
  asyncHandler(async (req, res) => {
    const { month, department } = parseBody(salaryListQuerySchema, req.query) as SalaryListQuery;
    res.json(await staffService.listSalaries(month, department));
  })
);

// Bulk generate for a month (idempotent, transactional). Registered before
// any /:id route so "generate" is never parsed as an id.
staffRouter.post(
  "/salaries/generate",
  asyncHandler(async (req, res) => {
    const body = parseBody(salaryGenerateSchema, req.body) as SalaryGenerateBody;
    res.json(await staffService.generateForMonth(body.month, body.department));
  })
);

staffRouter.post(
  "/salaries",
  asyncHandler(async (req, res) => {
    res.status(201).json(await staffService.createSalary(req.body));
  })
);

staffRouter.put(
  "/salaries",
  asyncHandler(async (req, res) => {
    res.json(await staffService.upsertSalary(req.body));
  })
);

// Submit (Draft → Submitted): freezes the record. Registered before the
// /:id PUT route so "submit" is never parsed as a record id.
staffRouter.post(
  "/salaries/:id/submit",
  asyncHandler(async (req, res) => {
    parseBody(salarySubmitSchema, req.body);
    const submittedBy = authUser(res).displayName;
    res.json(await staffService.submitSalary(req.params.id, submittedBy));
  })
);

staffRouter.patch(
  "/salaries/:id/status",
  asyncHandler(async (req, res) => {
    // Only { status: "Pending" } is accepted here; Pending → Paid is reserved
    // exclusively for POST /salaries/:id/pay.
    parseBody(salaryStatusPatchSchema, req.body);
    res.json(await staffService.updateSalaryStatus(req.params.id));
  })
);

// Dedicated payment operation — Pending → Paid + Accounts payment, atomic.
staffRouter.post(
  "/salaries/:id/pay",
  asyncHandler(async (req, res) => {
    res.json(await staffService.paySalary(req.params.id, { ...req.body, paidBy: authUser(res).displayName }));
  })
);

staffRouter.put(
  "/salaries/:id",
  asyncHandler(async (req, res) => {
    res.json(await staffService.updateSalaryById(req.params.id, req.body));
  })
);

staffRouter.delete(
  "/salaries/:id",
  asyncHandler(async (req, res) => {
    res.json(await staffService.deleteSalary(req.params.id));
  })
);

// Per-employee register row: GET /api/staff/salaries/:employeeId?month=YYYY-MM
staffRouter.get(
  "/salaries/:employeeId",
  asyncHandler(async (req, res) => {
    const employeeId = Number(req.params.employeeId);
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      throw new AppError(400, `Invalid employee id: "${req.params.employeeId}"`);
    }
    const month =
      typeof req.query.month === "string" ? req.query.month : new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new AppError(400, "month must be in YYYY-MM format");
    }
    res.json(await staffService.getEmployeeSalary(employeeId, month));
  })
);

// Advance / Loan
staffRouter.get(
  "/advances",
  asyncHandler(async (req, res) => {
    res.json(
      await staffService.listAdvances(
        typeof req.query.type === "string" ? req.query.type : undefined,
        typeof req.query.status === "string" ? req.query.status : undefined
      )
    );
  })
);

staffRouter.post(
  "/advances",
  asyncHandler(async (req, res) => {
    res.status(201).json(await staffService.createAdvance(req.body));
  })
);

// Attendance
staffRouter.get(
  "/attendance",
  asyncHandler(async (req, res) => {
    res.json(
      await staffService.listAttendance(
        typeof req.query.month === "string" ? req.query.month : undefined,
        typeof req.query.department === "string" ? req.query.department : undefined
      )
    );
  })
);

staffRouter.post(
  "/attendance",
  asyncHandler(async (req, res) => {
    res.status(201).json(await staffService.upsertAttendance(req.body));
  })
);

// ============ DUTY PLANNER (PostgreSQL-backed) ============
// GET /api/staff/duty-planner?weekStart=YYYY-MM-DD
staffRouter.get(
  "/duty-planner",
  asyncHandler(async (req, res) => {
    const weekStart =
      typeof req.query.weekStart === "string" ? req.query.weekStart : undefined;
    res.json(await dutyPlannerService.getDutyWeek(weekStart ?? new Date().toISOString().slice(0, 10)));
  })
);

// GET /api/staff/duty-planner/week/:weekStart  (status + week)
staffRouter.get(
  "/duty-planner/week/:weekStart",
  asyncHandler(async (req, res) => {
    res.json(await dutyPlannerService.getWeekStatus(req.params.weekStart));
  })
);

// POST /api/staff/duty-planner/auto-assign/preview
staffRouter.post(
  "/duty-planner/auto-assign/preview",
  asyncHandler(async (req, res) => {
    const weekStart =
      typeof req.body?.weekStart === "string" ? req.body.weekStart : new Date().toISOString().slice(0, 10);
    res.json(await dutyPlannerService.autoAssignPreview(weekStart));
  })
);

// POST /api/staff/duty-planner/auto-assign/apply
staffRouter.post(
  "/duty-planner/auto-assign/apply",
  asyncHandler(async (req, res) => {
    const weekStart =
      typeof req.body?.weekStart === "string" ? req.body.weekStart : new Date().toISOString().slice(0, 10);
    const plan = req.body?.plan ?? undefined;
    const changedBy = authUser(res).displayName;
    res.json(await dutyPlannerService.autoAssignApply(weekStart, plan, changedBy));
  })
);

// POST /api/staff/duty-planner/assign  (manual; server-validated)
staffRouter.post(
  "/duty-planner/assign",
  asyncHandler(async (req, res) => {
    const changedBy = authUser(res).displayName;
    res.status(201).json(await dutyPlannerService.upsertDuty(req.body ?? {}, changedBy));
  })
);

// PUT /api/staff/duty-planner/:id  (manual edit; server-validated)
staffRouter.put(
  "/duty-planner/:id",
  asyncHandler(async (req, res) => {
    const changedBy = authUser(res).displayName;
    res.json(await dutyPlannerService.upsertDuty({ ...(req.body ?? {}), id: req.params.id }, changedBy));
  })
);

// DELETE /api/staff/duty-planner/:id
staffRouter.delete(
  "/duty-planner/:id",
  asyncHandler(async (req, res) => {
    const changedBy = authUser(res).displayName;
    res.json(await dutyPlannerService.deleteDuty(req.params.id, changedBy));
  })
);

// POST /api/staff/duty-planner/submit  { weekStart, submittedBy }
staffRouter.post(
  "/duty-planner/submit",
  asyncHandler(async (req, res) => {
    const weekStart =
      typeof req.body?.weekStart === "string" ? req.body.weekStart : new Date().toISOString().slice(0, 10);
    const submittedBy = authUser(res).displayName;
    res.json(await dutyPlannerService.submitWeek(weekStart, submittedBy));
  })
);

// GET /api/staff/attendance/summary?month=YYYY-MM
staffRouter.get(
  "/attendance/summary",
  asyncHandler(async (req, res) => {
    const month = typeof req.query.month === "string" ? req.query.month : new Date().toISOString().slice(0, 7);
    res.json(await dutyPlannerService.getAttendanceSummary(month));
  })
);

// GET /api/staff/employee/:id/history
staffRouter.get(
  "/employee/:id/history",
  asyncHandler(async (req, res) => {
    res.json(await dutyPlannerService.getEmployeeHistory(Number(req.params.id)));
  })
);
