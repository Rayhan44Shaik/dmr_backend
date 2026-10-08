import type { RequestHandler } from "express";
import { authUser } from "./auth.js";
import { AppError } from "./errorHandler.js";

const read = (method: string) => method === "GET" || method === "HEAD" || method === "OPTIONS";
const starts = (path: string, choices: readonly string[]) => choices.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

/** Coarse module boundary. Fine-grained workflow/row checks remain in each
 * router. Keeping this one table prevents a newly-added endpoint from silently
 * becoming visible to every authenticated role. */
export const roleBoundary: RequestHandler = (req, res, next) => {
  const { role } = authUser(res);
  const path = req.path;
  if (role === "OWNER" || role === "FULL_ACCESS") return next();
  // Self-scoped settings (language/theme preferences) are available to every
  // role: the router only ever reads and writes the caller's own row, so there
  // is nothing to gate. The employee access directory is NOT under /settings.
  if (starts(path, ["/settings"])) return next();
  // FULL_ACCESS is intentionally distinct from OWNER: read and workflow
  // permissions across modules, but no destructive writes (delete / financial
  // approve / rate-lock) — those remain OWNER-only.
  if (role === "AUDIT") {
    if (!read(req.method)) throw new AppError(403, "Audit access is read-only");
    return next();
  }
  if (path.startsWith("/access-management")) throw new AppError(403, "Owner or Full Access permission is required");
  // Reference lists are required by entry forms but remain read-only.
  if (path.startsWith("/masters") && read(req.method)) return next();
  if (role === "SUPERVISOR") {
    if (starts(path, ["/trips", "/operations/trips"])) return next();
    // Read-only operation views are available to supervisors; financial and
    // approval mutations remain blocked (roleBoundary + businessBoundary).
    if (starts(path, ["/operations/dashboard", "/operations/trip-list", "/operations/shop-ledger"])) return next();
    // Supervisors may reach their own staff endpoints; fine-grained ownership
    // and workflow checks (approve/reject, payroll, performance, attendance)
    // are enforced by staffBoundary so the correct 403 message is returned.
    if (starts(path, ["/staff/leaves", "/staff/duties", "/staff/duty-planner"])) return next();
    throw new AppError(403, "Supervisor access is limited to Trip Entry, read-only operations, and own staff data");
  }
  if (role === "COLLECTION") {
    if (read(req.method) && starts(path, ["/trips", "/operations/trips"])) return next();
    if (starts(path, ["/operations/collections", "/operations/collection-entry", "/operations/orders"])) return next();
    throw new AppError(403, "Collection role cannot access this module");
  }
  if (role === "OFFICE") {
    if (starts(path, ["/trips", "/operations/trips", "/operations/fuel-expenses", "/fleet/maintenance", "/fleet/permits", "/fleet/emis", "/staff/leaves", "/staff/duty"])) return next();
    throw new AppError(403, "Office role cannot access this module");
  }
  throw new AppError(403, "Access denied");
};
