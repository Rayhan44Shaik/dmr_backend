import type { RequestHandler } from "express";
import { AppError } from "../middleware/errorHandler.js";
import { authUser } from "../middleware/auth.js";

export const APP_ROLES = ["OWNER", "FULL_ACCESS", "AUDIT", "OFFICE", "COLLECTION", "SUPERVISOR"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const PERMISSIONS = {
  OWNER: ["*"],
  FULL_ACCESS: ["business.*", "trip.*", "maintenance.*", "permit.*", "emi.*", "duty.*", "leave.*", "fuel.*", "collection.*", "staff.*", "reports.*"],
  AUDIT: ["business.view", "trip.view", "maintenance.view", "permit.view", "emi.view", "duty.view", "leave.view", "fuel.view", "collection.view", "staff.view", "reports.view"],
  OFFICE: ["trip.view", "trip.create", "trip.edit", "trip.submit", "trip.complete", "maintenance.view", "maintenance.create", "maintenance.edit", "permit.view", "permit.create", "permit.edit", "emi.view", "emi.create", "emi.edit", "duty.view", "duty.create", "duty.edit", "leave.view", "leave.create", "leave.edit", "fuel.view", "fuel.create", "fuel.edit"],
  COLLECTION: ["trip.view", "orders.view", "collection.view", "collection.create"],
  SUPERVISOR: ["trip.create", "trip.submit"],
} as const satisfies Record<AppRole, readonly string[]>;

export function hasPermission(role: AppRole, permission: string): boolean {
  return PERMISSIONS[role].some((grant) => grant === "*" || grant === permission || (grant.endsWith(".*") && permission.startsWith(grant.slice(0, -1))));
}

export function requirePermission(permission: string): RequestHandler {
  return (_req, res, next) => {
    const role = authUser(res).role as AppRole;
    if (!hasPermission(role, permission)) return next(new AppError(403, "You do not have permission to perform this action"));
    next();
  };
}

