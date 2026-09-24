import { mapPgError } from "../utils/pgErrors.js";
export class AppError extends Error {
    status;
    details;
    constructor(status, message, details) {
        super(message);
        this.status = status;
        this.details = details;
    }
}
export function notFound(_req, res) {
    res.status(404).json({ error: "Not found", message: "The requested resource was not found." });
}
export function errorHandler(err, _req, res, _next) {
    // P3: every error response carries the request correlation id when present.
    const requestId = typeof res.locals.requestId === "string" ? res.locals.requestId : null;
    const withId = (body) => requestId ? { ...body, requestId } : body;
    if (err instanceof AppError) {
        return res.status(err.status).json(withId({
            error: err.message,
            message: err.message,
            details: err.details,
        }));
    }
    const pgErr = mapPgError(err);
    if (pgErr) {
        return res.status(pgErr.status).json(withId({
            error: pgErr.message,
            details: pgErr.details,
        }));
    }
    if (requestId)
        console.error(`[${requestId}]`, err);
    else
        console.error(err);
    return res
        .status(500)
        .json(withId({ error: "Internal server error" }));
}
export function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
//# sourceMappingURL=errorHandler.js.map