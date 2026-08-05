import { AppError } from "../middleware/errorHandler.js";

interface PgErrorLike {
  code?: string;
  constraint?: string;
  detail?: string;
  message?: string;
}

export function isPgError(err: unknown): err is PgErrorLike {
  return typeof err === "object" && err !== null && "code" in err;
}

/**
 * Map PostgreSQL driver errors to HTTP-friendly AppError instances.
 * 409 conflict, 422 unprocessable, 400 bad request.
 */
export function mapPgError(err: unknown): AppError | null {
  if (!isPgError(err) || !err.code) return null;

  switch (err.code) {
    case "23505":
      return new AppError(409, "Duplicate record", {
        constraint: err.constraint,
        detail: err.detail,
      });
    case "23503":
      return new AppError(422, "Referenced record does not exist", {
        constraint: err.constraint,
        detail: err.detail,
      });
    case "23514":
      return new AppError(422, "Constraint check failed", {
        constraint: err.constraint,
        detail: err.detail,
      });
    case "22P02":
      return new AppError(400, "Invalid value for column type", {
        detail: err.detail ?? err.message,
      });
    case "22007":
      return new AppError(400, "Invalid date or time value", {
        detail: err.detail ?? err.message,
      });
    default:
      return null;
  }
}

export function rethrowIfAppError(err: unknown): never {
  if (err instanceof AppError) throw err;
  const mapped = mapPgError(err);
  if (mapped) throw mapped;
  throw err;
}
