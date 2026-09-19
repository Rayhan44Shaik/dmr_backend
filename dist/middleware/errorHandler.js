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
export function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
//# sourceMappingURL=errorHandler.js.map