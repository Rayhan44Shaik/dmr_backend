import { mapPgError } from "../utils/pgErrors.js";
export class AppError extends Error {
    status;
    details;
    code;
    constructor(status, message, details, code) {
        super(message);
        this.status = status;
        this.details = details;
        this.code = code;
    }
}
function authCodeFor(status, message) {
    if (status === 401) {
        const lower = message.toLowerCase();
        if (lower.includes("expir"))
            return "AUTH_EXPIRED";
        if (lower.includes("revok"))
            return "AUTH_REVOKED";
        return "AUTH_INVALID";
    }
    if (status === 403)
        return "FORBIDDEN";
    if (status === 429)
        return "RATE_LIMITED";
    return null;
}
export function notFound(_req, res) {
    res.status(404).json({ error: "Not found", message: "The requested resource was not found." });
}
export function errorHandler(err, _req, res, _next) {
    // P3: every error response carries the request correlation id when present.
    const requestId = typeof res.locals.requestId === "string" ? res.locals.requestId : null;
    const withId = (body) => requestId ? { ...body, requestId } : body;
    // Malformed JSON bodies (body-parser SyntaxError): report 400 with a safe
    // generic message. Never echo the offending body (it is user input).
    if (err instanceof SyntaxError && typeof err.status === "number") {
        const status = err.status;
        if (status >= 400 && status < 500) {
            return res.status(status).json(withId({
                error: "Invalid request body",
                message: "The request body is not valid JSON.",
                code: "VALIDATION_ERROR",
            }));
        }
    }
    if (err instanceof AppError) {
        const code = err.code ?? authCodeFor(err.status, err.message);
        return res.status(err.status).json(withId({
            error: err.message,
            message: err.message,
            ...(code ? { code } : {}),
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