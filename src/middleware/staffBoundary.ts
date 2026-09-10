import type { Request, RequestHandler } from "express";

export type StaffAction = "read" | "create" | "update" | "delete" | "approve" | "reject" | "cancel" | "submit";
export interface StaffAccess { resource: "duty-planner" | "leave" | "staff"; action: StaffAction; resourceId?: string }
export type StaffAuthorizer = (request: Request, access: StaffAccess) => Promise<void>;

/** Server-side integration point for the application's authentication provider.
 * No actor or permission is accepted from request payloads or invented here. */
export const staffBoundary: RequestHandler = (req, res, next) => {
  const parts = req.path.split("/").filter(Boolean);
  const resource: StaffAccess["resource"] = parts[0] === "duty-planner" ? "duty-planner" : parts[0] === "leaves" ? "leave" : "staff";
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
  const authorize = req.app.locals.authorizeStaff as StaffAuthorizer | undefined;
  Promise.resolve().then(() => authorize?.(req, access)).then(() => next(), next);
};
