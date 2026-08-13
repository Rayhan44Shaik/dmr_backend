import { AppError } from "../middleware/errorHandler.js";
interface PgErrorLike {
    code?: string;
    constraint?: string;
    detail?: string;
    message?: string;
}
export declare function isPgError(err: unknown): err is PgErrorLike;
/**
 * Map PostgreSQL driver errors to HTTP-friendly AppError instances.
 * 409 conflict, 422 unprocessable, 400 bad request.
 */
export declare function mapPgError(err: unknown): AppError | null;
export declare function rethrowIfAppError(err: unknown): never;
export {};
