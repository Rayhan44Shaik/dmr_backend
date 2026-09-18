import type { Request, RequestHandler } from "express";
import { authUser } from "./auth.js";
import { AppError } from "./errorHandler.js";

export type StaffAction = "read" | "create" | "update" | "delete" | "approve" | "reject" | "cancel" | "submit";
export interface StaffAccess { resource: "duty-planner" | "leave" | "staff"; action: StaffAction; resourceId?: string }
export type StaffAuthorizer = (request: Request, access: StaffAccess) => Promise<void>;

/** Server-side integration point for the application's authentication provider.
 * No actor or permission is accepted from request payloads or invented here. */
export const staffBoundary: RequestHandler = (req, res, next) => {
  const parts = req.path.split("/").filter(Boolean);
  const resource: StaffAccess["resource"] = parts[0] === "duty-planner" || parts[0] === "duties" ? "duty-planner" : parts[0] === "leaves" ? "leave" : "staff";
  const requestedStatus = typeof req.body?.status === "string" ? req.body.status : "";
  const action: StaffAction = req.method === "GET" ? "read"
    : requestedStatus === "Approved" ? "approve"
    : requestedStatus === "Rejected" ? "reject"
    : requestedStatus === "Cancelled" ? "cancel"
    : parts.includes("submit") ? "submit"
    : req.method === "DELETE" ? "delete"
    : req.method === "POST" ? "create" : "update";
  const access: StaffAccess = { resource, action, resourceId: parts.find((part) => /^[0-9a-f-]{36}$/i.test(part)) };
  res.locals.staffAccess = access;
  const user = authUser(res);
  if (action === "read" && user.role !== "OWNER" && resource === "staff") {
    throw new AppError(403, "Owner access is required to view payroll, attendance, advances, or performance data");
  }
  if (user.role !== "OWNER" && resource === "leave") {
    if (user.employeeId == null) throw new AppError(403, "This account is not linked to an employee");
    if (action === "read") req.query.employeeId = String(user.employeeId);
    if (action === "create" && Number(req.body?.employeeId) !== user.employeeId) {
      throw new AppError(403, "Leave requests may only be created for the signed-in employee");
    }
  }
  const isManualDutyWrite = resource === "duty-planner"
    && (action === "create" || action === "update")
    && !parts.includes("auto-assign")
    && !parts.includes("submit");
  const isLeaveRequestCreate = resource === "leave" && action === "create" && parts.length === 1;
  if (action !== "read" && user.role !== "OWNER" && !isManualDutyWrite && !isLeaveRequestCreate) {
    throw new AppError(403, "Owner access is required for this staff operation");
  }
  const authorize = req.app.locals.authorizeStaff as StaffAuthorizer | undefined;
  Promise.resolve()
    .then(() => authorize?.(req, access))
    .then(() => next(), next);
};
