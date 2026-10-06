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
 * - Financial/approval/destructive mutations (fleet approve/reject/delete,
 *   permit upsert/delete, EMI create/update/delete/pay, accounts payments,
 *   farm-payment updates, rate-entry lock) require OWNER or SENIOR_ACCOUNT.
 * - Field mutations (trip steps, collections, fuel, shop sales/rates entry,
 *   maintenance entry, duty/leave flows) remain open to linked supervisors —
 *   restricting them would break field workflows. Row-level supervisor
 *   scoping for those writes is tracked follow-up work, not done here.
 */

type Role = AuthUser["role"];
const FINANCE_ROLES: ReadonlySet<Role> = new Set(["OWNER", "SENIOR_ACCOUNT"]);

function positiveId(value: string, label: string): number {
  if (!/^\d+$/.test(value)) throw new AppError(400, `${label} must be a positive integer`);
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new AppError(400, `${label} must be a positive integer`);
  return id;
}

function financeOnly(res: Parameters<typeof authUser>[0], action: string): void {
  const user = authUser(res);
  if (!FINANCE_ROLES.has(user.role)) {
    throw new AppError(403, `Owner or Senior Accounts access is required (${action})`);
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
  const parts = req.path.split("/").filter(Boolean);
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
 * Approve/reject of financial records (fuel expenses, collections,
 * collection-entry, shop sales/rates) is a finance action — approving money
 * flows must not be reachable by a supervisor role.
 */
export const operationsSensitiveBoundary: RequestHandler = (req, res, next) => {
  const method = req.method;
  if (method === "POST" && /^\/rate-entry\/[^/]+\/lock$/.test(req.path)) {
    financeOnly(res, "rate lock");
  }
  if (
    method === "POST" &&
    /^\/(fuel-expenses|collections|collection-entry|shop-sales|shop-rates)\/[^/]+\/(approve|reject)$/.test(req.path)
  ) {
    financeOnly(res, "approval");
  }
  next();
};

/**
 * Guards `/fleet` mutations. Reads stay open; entry (maintenance create/
 * update, permit scans) stays open for field reporting; approvals, deletes,
 * permit upserts/deletes, and all EMI writes require OWNER/SENIOR_ACCOUNT.
 */
export const fleetBoundary: RequestHandler = (req, res, next) => {
  const path = req.path;
  const method = req.method;
  const sensitive =
    (method === "POST" && /^\/maintenance\/[^/]+\/(approve|reject)$/.test(path)) ||
    (method === "DELETE" && /^\/maintenance\/[^/]+$/.test(path)) ||
    (method === "DELETE" && /^\/maintenance\/[^/]+\/documents\/[^/]+$/.test(path)) ||
    ((method === "PUT" || method === "DELETE") && /^\/permits\//.test(path)) ||
    ((method === "POST" || method === "PUT" || method === "DELETE") && /^\/emis/.test(path));
  if (sensitive) financeOnly(res, "fleet approval/finance");
  next();
};

/**
 * Guards `/accounts` mutations. Reads stay open; every payments write and
 * farm-payment update requires OWNER/SENIOR_ACCOUNT.
 */
export const accountsBoundary: RequestHandler = (req, res, next) => {
  const path = req.path;
  const method = req.method;
  const sensitive =
    ((method === "POST" || method === "PUT" || method === "DELETE") && /^\/payments/.test(path)) ||
    (method === "PUT" && /^\/farm-payments/.test(path));
  if (sensitive) financeOnly(res, "accounts write");
  next();
};
