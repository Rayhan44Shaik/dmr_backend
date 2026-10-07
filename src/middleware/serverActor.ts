import type { RequestHandler } from "express";
import { authUser } from "./auth.js";

/**
 * Server-side actor stamping.
 *
 * Who approved, rejected or deleted a record is an AUDIT fact that must come
 * from the authenticated session — never from the request payload. A client
 * that sends `approvedBy` / `rejectedBy` / `deletedBy` (the desktop UI does,
 * for historical reasons) has those fields replaced with the session user, so
 * parameter tampering cannot impersonate another actor.
 *
 * Approve/reject endpoints and status transitions additionally get
 * the actor injected when the client omitted it, so the database never falls
 * back to the placeholder "system" actor for a real human action.
 */
const ACTOR_FIELDS = ["approvedBy", "rejectedBy", "deletedBy"] as const;

export const serverActor: RequestHandler = (req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return next();
  }
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return next();
  const record = body as Record<string, unknown>;

  const user = authUser(res);
  const actor = user.displayName;

  for (const field of ACTOR_FIELDS) {
    if (record[field] !== undefined) record[field] = actor;
  }

  // POST /…/approve  and  POST /…/reject — always record who acted.
  if (/\/(approve|reject)$/.test(req.path)) {
    if (record.approvedBy === undefined) record.approvedBy = actor;
    if (record.rejectedBy === undefined) record.rejectedBy = actor;
  }

  // PATCH …/status — record who acted for the business record.
  // Covers trip completion as well as pending/rate/shop-sale approval and rejection.
  if (/\/status$/.test(req.path)) {
    if (record.status === "Completed" && record.approvedBy === undefined) {
      record.approvedBy = actor;
    }
    if (record.status === "Approved" && record.approvedBy === undefined) {
      record.approvedBy = actor;
    }
    if (record.status === "Rejected" && record.rejectedBy === undefined) {
      record.rejectedBy = actor;
    }
  }

  return next();
};
