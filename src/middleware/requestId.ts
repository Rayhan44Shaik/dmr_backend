import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

const REQUEST_ID_HEADER = "x-request-id";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** P3: correlation IDs. Propagates an incoming X-Request-Id (when a valid
 *  UUID) or mints one, exposes it on res.locals + the response header so
 *  clients and logs can correlate a request end to end. */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const raw = Array.isArray(incoming) ? incoming[0] : incoming;
  const id =
    typeof raw === "string" && UUID_RE.test(raw.trim())
      ? raw.trim()
      : randomUUID();
  res.locals.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}

export function getRequestId(res: {
  locals: Record<string, unknown>;
}): string | null {
  const id = res.locals.requestId;
  return typeof id === "string" ? id : null;
}
