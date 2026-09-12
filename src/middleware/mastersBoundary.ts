import type { RequestHandler, ErrorRequestHandler, Request } from "express";
import { AppError } from "./errorHandler.js";
import { isPgError } from "../utils/pgErrors.js";

export type MastersAction = "read" | "create" | "update" | "deactivate" | "bulk-import";
export interface MastersAccess {
  entity: string;
  action: MastersAction;
  resourceId?: number;
}
/** Set app.locals.authorizeMasters to the application's future authorization adapter.
 * It must resolve server-side identity and enforce entity/record scope or throw 403.
 * No identity, permission, or tenant is accepted from request bodies/headers here.
 */
export type MastersAuthorizer = (request: Request, access: MastersAccess) => Promise<void>;
export const mastersBoundary: RequestHandler = (req, res, next) => {
  const [entity, id, subresource] = req.path.split("/").filter(Boolean);
  const action: MastersAction = req.method === "GET" ? "read"
    : id === "bulk" || id === "batch" ? "bulk-import"
    : req.method === "DELETE" || subresource === "status" ? "deactivate"
    : req.method === "POST" ? "create" : "update";
  const access: MastersAccess = { entity, action, resourceId: /^\d+$/.test(id ?? "") ? Number(id) : undefined };
  // Also available to the eventual application audit middleware. Actor remains absent
  // until authenticated identity exists; created_by/updated_by must never use a fake user.
  res.locals.mastersAccess = access;
  const authorize = req.app.locals.authorizeMasters as MastersAuthorizer | undefined;
  Promise.resolve()
    .then(() => authorize?.(req, access))
    .then(() => next(), next);
};

/** Keep database internals out of Masters responses without changing other modules. */
export const mastersErrors: ErrorRequestHandler = (err: unknown, _req, res, next) => {
  if (err instanceof AppError) return next(err);
  if (!isPgError(err)) return next(err);
  const errors: Record<string, [number, string]> = {
    "23505": [409, "A record with these unique details already exists."],
    "23503": [409, "This operation conflicts with a related record. Refresh and try again."],
    "23514": [400, "One or more values do not meet the required limits."],
    "23502": [400, "A required value is missing."],
    "22001": [400, "A value exceeds the maximum allowed length."],
    "22003": [400, "A number exceeds the allowed range."],
    "22P02": [400, "A value has an invalid format."],
    "22007": [400, "A date has an invalid format."],
    "22008": [400, "A date is outside the valid range."],
  };
  const mapped = errors[err.code ?? ""];
  if (mapped) return res.status(mapped[0]).json({ error: mapped[1] });
  return next(err);
};
