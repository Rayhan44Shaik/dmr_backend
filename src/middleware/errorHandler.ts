import type { NextFunction, Request, Response } from "express";
import { mapPgError } from "../utils/pgErrors.js";

export class AppError extends Error {
  status: number;
  details?: unknown;
  code?: string;

  constructor(status: number, message: string, details?: unknown, code?: string) {
    super(message);
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

function authCodeFor(status: number, message: string): string | null {
  if (status === 401) {
    const lower = message.toLowerCase();
    if (lower.includes("expir")) return "AUTH_EXPIRED";
    if (lower.includes("revok")) return "AUTH_REVOKED";
    return "AUTH_INVALID";
  }
  if (status === 403) return "FORBIDDEN";
  if (status === 429) return "RATE_LIMITED";
  return null;
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "Not found", message: "The requested resource was not found." });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  // P3: every error response carries the request correlation id when present.
  const requestId =
    typeof res.locals.requestId === "string" ? res.locals.requestId : null;
  const withId = (body: Record<string, unknown>) =>
    requestId ? { ...body, requestId } : body;

  // Malformed JSON bodies (body-parser SyntaxError): report 400 with a safe
  // generic message. Never echo the offending body (it is user input).
  if (err instanceof SyntaxError && typeof (err as unknown as { status?: unknown }).status === "number") {
    const status = (err as unknown as { status: number }).status;
    if (status >= 400 && status < 500) {
      return res.status(status).json(
        withId({
          error: "Invalid request body",
          message: "The request body is not valid JSON.",
          code: "VALIDATION_ERROR",
        })
      );
    }
  }

  if (err instanceof AppError) {
    const code = err.code ?? authCodeFor(err.status, err.message);
    return res.status(err.status).json(
      withId({
        error: err.message,
        message: err.message,
        ...(code ? { code } : {}),
        details: err.details,
      })
    );
  }

  const pgErr = mapPgError(err);
  if (pgErr) {
    return res.status(pgErr.status).json(
      withId({
        error: pgErr.message,
        details: pgErr.details,
      })
    );
  }

  if (requestId) console.error(`[${requestId}]`, err);
  else console.error(err);
  return res
    .status(500)
    .json(withId({ error: "Internal server error" }));
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
