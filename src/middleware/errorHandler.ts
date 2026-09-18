import type { NextFunction, Request, Response } from "express";
import { mapPgError } from "../utils/pgErrors.js";

export class AppError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
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
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: err.message,
      message: err.message,
      details: err.details,
    });
  }

  const pgErr = mapPgError(err);
  if (pgErr) {
    return res.status(pgErr.status).json({
      error: pgErr.message,
      details: pgErr.details,
    });
  }

  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
