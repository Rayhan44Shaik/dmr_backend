import type { RequestHandler, Response } from "express";
import { AppError, asyncHandler } from "./errorHandler.js";
import { authUser } from "./auth.js";
import {
  enforceSupervisorAssignment,
  requireTripAccess,
  requireTripPermission,
  type TripPermission,
} from "./tripAuthorization.js";
import type { AuthUser } from "../services/authService.js";

/**
 * Server-side authorization for business routers that historically relied on
 * `requireAuth` alone.
 *
 * Policy (mirrors the masters/staff boundary precedent):
 * - Reads (GET/HEAD/OPTIONS) stay open to any authenticated, role-linked user
 *   (field selectors and dashboards depend on them).
 * - `/operations/trips*` enforces the SAME rules as `/trips` (permission +
 *   supervisor ownership scope). This closes the shadow write path that
 *   bypassed `requireTripAccess`.
 * - Financial approval and destructive mutations are OWNER-only.
 * - Field mutations (trip steps, collections, fuel, shop sales/rates entry,
 *   maintenance entry, duty/leave flows) remain open to linked supervisors —
 *   restricting them would break field workflows. Row-level supervisor
 *   scoping for those writes is tracked follow-up work, not done here.
 */

type Role = AuthUser["role"];
function positiveId(value: string, label: string): number {
  if (!/^\d+$/.test(value)) throw new AppError(400, `${label} must be a positive integer`);
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new AppError(400, `${label} must be a positive integer`);
  return id;
}

function normalizedPath(path: string): string {
  // Express route matching is case-insensitive and accepts a trailing slash,
  // but req.path preserves both. Normalize before matching a security regex.
  const trimmed = path.replace(/\/+$/, "");
  return (trimmed || "/").toLowerCase();
}

function financeOnly(res: Parameters<typeof authUser>[0], action: string): void {
  const user = authUser(res);
  if (user.role !== "OWNER") {
    throw new AppError(403, `Owner access is required (${action})`);
  }
}

/** Supervisors always act as themselves — never accept another employee id. */
function supervisorBodyScope(
  res: Parameters<typeof authUser>[0],
  body: Record<string, unknown> | undefined,
): void {
  const user = authUser(res);
  if (user.role !== "SUPERVISOR") return;
  if (!body || typeof body !== "object") {
    enforceSupervisorAssignment(user, user.employeeId);
    return;
  }
  if (body.supervisorId == null) body.supervisorId = user.employeeId;
  enforceSupervisorAssignment(user, body.supervisorId);
}

/** Supervisors list only their own trips — same rule as the /trips router. */
function supervisorListScope(
  req: { query: Record<string, unknown> },
  res: Parameters<typeof authUser>[0],
): void {
  const user = authUser(res);
  if (user.role !== "SUPERVISOR") return;
  if (user.employeeId == null) {
    throw new AppError(403, "Supervisor account is not linked to an employee");
  }
  req.query.supervisorId = String(user.employeeId);
  req.query.status = "Draft";
}

const STEP_NAMES = new Set(["start", "farm", "pickup", "deliveries", "expenses"]);

/**
 * For a SUPERVISOR, confirm trip ownership BEFORE the permission answer: a
 * trip that is not theirs must read as 404 (the boundary must not disclose
 * that it exists), then the real permission applies to their own trips.
 * Non-supervisors go straight to the permission check.
 */
async function maskedTripAccess(
  res: Response,
  tripId: number,
  permission: TripPermission,
): Promise<void> {
  const user = authUser(res);
  if (user.role === "SUPERVISOR") {
    await requireTripAccess(res, tripId, "trip.view");
  }
  await requireTripAccess(res, tripId, permission);
}

/**
 * Guards `/operations/trips*` with identical semantics to `/trips`.
 * Mount with `operationsRouter.use(operationsTripsBoundary)`.
 */
export const operationsTripsBoundary: RequestHandler = asyncHandler(async (req, res, next) => {
  const parts = normalizedPath(req.path).split("/").filter(Boolean);
  if (parts[0] !== "trips") return next();
  const method = req.method;
  if (method === "GET" && parts.length === 1) {
    requireTripPermission(res, "trip.view");
    supervisorListScope(req as { query: Record<string, unknown> }, res);
    return next();
  }
  if (method === "GET") {
    await requireTripAccess(res, positiveId(parts[1], "Trip id"), "trip.view");
    return next();
  }
  if (method === "POST" && parts.length === 1) {
    requireTripPermission(res, "trip.create");
    supervisorBodyScope(res, req.body as Record<string, unknown> | undefined);
    return next();
  }
  if (method === "PUT" && parts.length === 2) {
    const id = positiveId(parts[1], "Trip id");
    await requireTripAccess(res, id, "trip.edit");
    supervisorBodyScope(res, req.body as Record<string, unknown> | undefined);
    return next();
  }
  if (method === "POST" && parts[2] === "steps" && parts.length === 4) {
    const step = parts[3];
    if (!STEP_NAMES.has(step)) throw new AppError(400, "Invalid step. Use start|farm|pickup|deliveries|expenses");
    const id = positiveId(parts[1], "Trip id");
    await requireTripAccess(res, id, "trip.submit");
    if (step === "start") supervisorBodyScope(res, req.body as Record<string, unknown> | undefined);
    return next();
  }
  if (method === "PATCH" && parts[2] === "status") {
    await maskedTripAccess(res, positiveId(parts[1], "Trip id"), "trip.status_change");
    return next();
  }
  if (method === "DELETE" && parts.length === 2) {
    await maskedTripAccess(res, positiveId(parts[1], "Trip id"), "trip.delete");
    return next();
  }
  return next();
});

/**
 * Financial finalization under `/operations`: locking finalized rates is a
 * back-office action. Draft saves stay open for field entry.
 *
 * Approve/reject, status changes and deletions of financial records (fuel
 * expenses, collections, collection-entry, manual expenses, shop sales and
 * shop rates) are OWNER-only. FULL_ACCESS deliberately has no bypass here.
 */
export const operationsSensitiveBoundary: RequestHandler = (req, res, next) => {
  const method = req.method;
  // Express matches routes with or without a trailing slash; the guard must
  // see the same canonical path or `/bulk-approve/` would skip it.
  const path = normalizedPath(req.path);
  if (method === "POST" && /^\/rate-entry\/[^/]+\/lock$/.test(path)) {
    financeOnly(res, "rate lock");
  }
  if (
    method === "POST" &&
    /^\/(fuel-expenses|collections|collection-entry|shop-sales|shop-rates)\/[^/]+\/(approve|reject)$/.test(path)
  ) {
    financeOnly(res, "approval");
  }
  // Collection Entry uses a consolidated PATCH status endpoint. Protect it
  // here as well as the legacy POST approve/reject routes; hiding the action
  // in the UI is never treated as authorization.
  if (method === "PATCH" && /^\/collection-entry\/[^/]+\/status$/.test(path)) {
    financeOnly(res, "collection approval");
  }
  if (method === "DELETE" && /^\/collection-entry\/(?:pending\/)?[^/]+$/.test(path)) {
    financeOnly(res, "collection deletion");
  }
  // Manual expenses are a financial record: approval and deletion are
  // OWNER-only. Draft entry/editing stays with the back office.
  if (method === "POST" && /^\/expenses\/manual\/[^/]+\/approve$/.test(path)) {
    financeOnly(res, "manual expense approval");
  }
  if (method === "DELETE" && /^\/expenses\/manual\/[^/]+$/.test(path)) {
    financeOnly(res, "manual expense deletion");
  }
  // A collection status change can complete or delete the underlying trip;
  // it is never a field-entry action.
  if (method === "PATCH" && /^\/collections\/[^/]+\/status$/.test(path)) {
    financeOnly(res, "collection status change");
  }
  if (method === "DELETE" && /^\/collections\/[^/]+$/.test(path)) {
    financeOnly(res, "collection deletion");
  }
  // Import and bulk approval create/approve money records in one request and
  // must carry the same authorization as the individual operations.
  if (method === "POST" && /^\/collection-entry\/import$/.test(path)) {
    financeOnly(res, "collection import");
  }
  if (method === "POST" && /^\/collection-entry\/bulk-approve$/.test(path)) {
    financeOnly(res, "collection bulk approval");
  }
  // Shop rates are reference prices used by financial calculations. Creating,
  // editing, changing status, or deleting one is OWNER-only.
  if (method === "POST" && /^\/shop-rates$/.test(path)) {
    financeOnly(res, "shop rate creation");
  }
  if (method === "PUT" && /^\/shop-rates\/[^/]+$/.test(path)) {
    financeOnly(res, "shop rate update");
  }
  if (method === "PATCH" && /^\/shop-rates\/[^/]+\/status$/.test(path)) {
    financeOnly(res, "shop rate status change");
  }
  if (method === "DELETE" && /^\/shop-rates\/[^/]+$/.test(path)) {
    financeOnly(res, "shop rate deletion");
  }
  // Shop sales (including trip/load editors) change receivable amounts.
  if (method === "PUT" && /^\/shop-sales\/(?:trip\/[^/]+\/(?:deliveries|load\/[^/]+)|[^/]+)$/.test(path)) {
    financeOnly(res, "shop sale update");
  }
  if (method === "PATCH" && /^\/shop-sales\/[^/]+\/status$/.test(path)) {
    financeOnly(res, "shop sale status change");
  }
  if (method === "DELETE" && /^\/shop-sales\/[^/]+$/.test(path)) {
    financeOnly(res, "shop sale deletion");
  }
  if (method === "DELETE" && /^\/fuel-expenses\/[^/]+$/.test(path)) {
    financeOnly(res, "fuel expense deletion");
  }
  next();
};

/**
 * Guards `/fleet` mutations. Reads stay open; maintenance entry stays open for
 * field reporting; approvals, deletes, permit upserts/deletes, and all EMI
 * writes (create, update, delete, pay) are OWNER-only.
 */
export const fleetBoundary: RequestHandler = (req, res, next) => {
  const path = normalizedPath(req.path);
  const method = req.method;
  const sensitive =
    (method === "POST" && /^\/maintenance\/[^/]+\/(approve|reject)$/.test(path)) ||
    (method === "DELETE" && /^\/maintenance\/[^/]+$/.test(path)) ||
    (method === "DELETE" && /^\/maintenance\/[^/]+\/documents\/[^/]+$/.test(path)) ||
    ((method === "PUT" || method === "DELETE") && /^\/permits\//.test(path)) ||
    (method === "POST" && /^\/emis$/.test(path)) ||
    (method === "PUT" && /^\/emis\/[^/]+$/.test(path)) ||
    (method === "DELETE" && /^\/emis\/[^/]+$/.test(path)) ||
    (method === "POST" && /^\/emis\/[^/]+\/pay$/.test(path));
  if (sensitive) financeOnly(res, "fleet approval/finance");
  next();
};

/**
 * Guards `/accounts` mutations. Reads stay open; every payments write and
 * farm-payment update requires OWNER/FULL_ACCESS.
 */
export const accountsBoundary: RequestHandler = (req, res, next) => {
  const path = normalizedPath(req.path);
  const method = req.method;
  const sensitive =
    ((method === "POST" || method === "PUT" || method === "DELETE") && /^\/payments/.test(path)) ||
    (method === "PUT" && /^\/farm-payments/.test(path));
  if (sensitive) financeOnly(res, "accounts write");
  next();
};
