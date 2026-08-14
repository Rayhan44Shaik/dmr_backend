import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { staffService } from "../services/staffService.js";
import { dutyPlannerService } from "../services/dutyPlannerService.js";
export const staffRouter = Router();
// Duty Planner
staffRouter.get("/duties", asyncHandler(async (req, res) => {
    res.json(await staffService.listDuties(typeof req.query.fromDate === "string" ? req.query.fromDate : undefined, typeof req.query.toDate === "string" ? req.query.toDate : undefined, typeof req.query.department === "string" ? req.query.department : undefined));
}));
staffRouter.post("/duties", asyncHandler(async (req, res) => {
    res.status(201).json(await staffService.upsertDuty(req.body));
}));
staffRouter.put("/duties/:id", asyncHandler(async (req, res) => {
    res.json(await staffService.upsertDuty({ ...req.body, id: req.params.id }));
}));
staffRouter.delete("/duties/:id", asyncHandler(async (req, res) => {
    res.json(await staffService.deleteDuty(req.params.id));
}));
// Leave
staffRouter.get("/leaves", asyncHandler(async (req, res) => {
    res.json(await staffService.listLeaves(typeof req.query.status === "string" ? req.query.status : undefined));
}));
staffRouter.post("/leaves", asyncHandler(async (req, res) => {
    res.status(201).json(await staffService.createLeave(req.body));
}));
staffRouter.patch("/leaves/:id/status", asyncHandler(async (req, res) => {
    res.json(await staffService.updateLeaveStatus(req.params.id, req.body.status, {
        approvedBy: req.body.approvedBy,
        rejectionReason: req.body.rejectionReason,
    }));
}));
// Salary
staffRouter.get("/salaries", asyncHandler(async (req, res) => {
    res.json(await staffService.listSalaries(typeof req.query.month === "string" ? req.query.month : undefined, typeof req.query.department === "string" ? req.query.department : undefined));
}));
staffRouter.post("/salaries", asyncHandler(async (req, res) => {
    res.status(201).json(await staffService.upsertSalary(req.body));
}));
staffRouter.put("/salaries", asyncHandler(async (req, res) => {
    res.json(await staffService.upsertSalary(req.body));
}));
// Advance / Loan
staffRouter.get("/advances", asyncHandler(async (req, res) => {
    res.json(await staffService.listAdvances(typeof req.query.type === "string" ? req.query.type : undefined, typeof req.query.status === "string" ? req.query.status : undefined));
}));
staffRouter.post("/advances", asyncHandler(async (req, res) => {
    res.status(201).json(await staffService.createAdvance(req.body));
}));
// Attendance
staffRouter.get("/attendance", asyncHandler(async (req, res) => {
    res.json(await staffService.listAttendance(typeof req.query.month === "string" ? req.query.month : undefined, typeof req.query.department === "string" ? req.query.department : undefined));
}));
staffRouter.post("/attendance", asyncHandler(async (req, res) => {
    res.status(201).json(await staffService.upsertAttendance(req.body));
}));
// ============ DUTY PLANNER (PostgreSQL-backed) ============
// GET /api/staff/duty-planner?weekStart=YYYY-MM-DD
staffRouter.get("/duty-planner", asyncHandler(async (req, res) => {
    const weekStart = typeof req.query.weekStart === "string" ? req.query.weekStart : undefined;
    res.json(await dutyPlannerService.getDutyWeek(weekStart ?? new Date().toISOString().slice(0, 10)));
}));
// GET /api/staff/duty-planner/week/:weekStart  (status + week)
staffRouter.get("/duty-planner/week/:weekStart", asyncHandler(async (req, res) => {
    res.json(await dutyPlannerService.getWeekStatus(req.params.weekStart));
}));
// POST /api/staff/duty-planner/auto-assign/preview
staffRouter.post("/duty-planner/auto-assign/preview", asyncHandler(async (req, res) => {
    const weekStart = typeof req.body?.weekStart === "string" ? req.body.weekStart : new Date().toISOString().slice(0, 10);
    res.json(await dutyPlannerService.autoAssignPreview(weekStart));
}));
// POST /api/staff/duty-planner/auto-assign/apply
staffRouter.post("/duty-planner/auto-assign/apply", asyncHandler(async (req, res) => {
    const weekStart = typeof req.body?.weekStart === "string" ? req.body.weekStart : new Date().toISOString().slice(0, 10);
    const plan = req.body?.plan ?? undefined;
    const changedBy = typeof req.body?.changedBy === "string" ? req.body.changedBy : "user";
    res.json(await dutyPlannerService.autoAssignApply(weekStart, plan, changedBy));
}));
// POST /api/staff/duty-planner/assign  (manual; server-validated)
staffRouter.post("/duty-planner/assign", asyncHandler(async (req, res) => {
    const changedBy = typeof req.body?.changedBy === "string" ? req.body.changedBy : "user";
    res.status(201).json(await dutyPlannerService.upsertDuty(req.body ?? {}, changedBy));
}));
// PUT /api/staff/duty-planner/:id  (manual edit; server-validated)
staffRouter.put("/duty-planner/:id", asyncHandler(async (req, res) => {
    const changedBy = typeof req.body?.changedBy === "string" ? req.body.changedBy : "user";
    res.json(await dutyPlannerService.upsertDuty({ ...(req.body ?? {}), id: req.params.id }, changedBy));
}));
// DELETE /api/staff/duty-planner/:id
staffRouter.delete("/duty-planner/:id", asyncHandler(async (req, res) => {
    const changedBy = typeof req.body?.changedBy === "string" ? req.body.changedBy : "user";
    res.json(await dutyPlannerService.deleteDuty(req.params.id, changedBy));
}));
// POST /api/staff/duty-planner/submit  { weekStart, submittedBy }
staffRouter.post("/duty-planner/submit", asyncHandler(async (req, res) => {
    const weekStart = typeof req.body?.weekStart === "string" ? req.body.weekStart : new Date().toISOString().slice(0, 10);
    const submittedBy = typeof req.body?.submittedBy === "string" ? req.body.submittedBy : "user";
    res.json(await dutyPlannerService.submitWeek(weekStart, submittedBy));
}));
// GET /api/staff/attendance/summary?month=YYYY-MM
staffRouter.get("/attendance/summary", asyncHandler(async (req, res) => {
    const month = typeof req.query.month === "string" ? req.query.month : new Date().toISOString().slice(0, 7);
    res.json(await dutyPlannerService.getAttendanceSummary(month));
}));
// GET /api/staff/employee/:id/history
staffRouter.get("/employee/:id/history", asyncHandler(async (req, res) => {
    res.json(await dutyPlannerService.getEmployeeHistory(Number(req.params.id)));
}));
//# sourceMappingURL=staff.js.map