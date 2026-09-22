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
    case "23505": {
      // Surface the real conflicted value/constraint instead of a generic
      // "Duplicate record". PG detail looks like:
      //   Key (trip_no)=(TR-20260812-001) already exists.
      const detail = err.detail?.trim();
      const message =
        detail && /already exists/i.test(detail)
          ? `Duplicate record: ${detail.replace(/^Key \(/, "(")}`
          : "Duplicate record";
      return new AppError(409, message, {
        constraint: err.constraint,
        detail: err.detail,
      });
    }
    case "23P01":
      return new AppError(409, "Overlapping pending or approved leave already exists for this employee", {
        constraint: err.constraint,
        detail: err.detail ?? err.message,
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
