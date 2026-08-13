import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { staffService } from "../services/staffService.js";
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
//# sourceMappingURL=staff.js.map