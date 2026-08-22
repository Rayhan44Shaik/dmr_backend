import { AxiosError, isAxiosError } from "axios";
import { logger } from "../logger/logger";
import { AppError } from "../errors/ErrorHandler";
import type { ApiErrorBody } from "./types";

/**
 * Normalized API error used by the Axios layer.
 * Extends the shared AppError so existing handleError() still works.
 */
export class ApiError extends AppError {
  public details?: unknown;
  public url?: string;
  public method?: string;

  constructor(
    message: string,
    options: {
      code?: string;
      status?: number;
      details?: unknown;
      url?: string;
      method?: string;
    } = {}
  ) {
    super(message, options.code ?? "API_ERROR", options.status);
    this.name = "ApiError";
    this.details = options.details;
    this.url = options.url;
    this.method = options.method;
  }
}

function messageFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const data = body as ApiErrorBody;
  if (typeof data.error === "string" && data.error.trim()) return data.error;
  if (typeof data.message === "string" && data.message.trim()) return data.message;
  return null;
}

/**
 * Convert any thrown value (Axios or otherwise) into an ApiError.
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (isAxiosError(error)) {
    const axiosErr = error as AxiosError<ApiErrorBody>;
    const status = axiosErr.response?.status;
    const bodyMessage = messageFromBody(axiosErr.response?.data);
    const method = axiosErr.config?.method?.toUpperCase();
    const url = axiosErr.config?.url;

    if (axiosErr.code === "ECONNABORTED") {
      return new ApiError("Request timed out. Please try again.", {
        code: "TIMEOUT",
        status,
        url,
        method,
      });
    }

    if (axiosErr.code === "ERR_CANCELED" || axiosErr.name === "CanceledError") {
      return new ApiError("Request cancelled.", {
        code: "CANCELED",
        status,
        url,
        method,
      });
    }

    if (!axiosErr.response) {
      return new ApiError(
        "Unable to reach the server. Check that the backend is running.",
        {
          code: "NETWORK_ERROR",
          status,
          url,
          method,
        }
      );
    }

    const fallback =
      status === 401
        ? "Unauthorized. Please sign in again."
        : status === 403
          ? "You do not have permission to perform this action."
          : status === 404
            ? "The requested resource was not found."
            : status === 409
              ? "Conflict while saving. Please refresh and try again."
              : status === 422
                ? "The request could not be processed."
              : status && status >= 500
                ? "Server error. Please try again later."
                : "Request failed. Please try again.";

    return new ApiError(bodyMessage ?? fallback, {
      code: status ? `HTTP_${status}` : "HTTP_ERROR",
      status,
      details: axiosErr.response.data,
      url,
      method,
    });
  }

  if (error instanceof Error) {
    return new ApiError(error.message, { code: "UNKNOWN" });
  }

  return new ApiError("Something went wrong. Please try again.", {
    code: "UNKNOWN",
  });
}

/**
 * Common API error handler: log + return a user-facing message.
 * Safe to call from services later without changing UI yet.
 */
export function isCanceledError(error: unknown): boolean {
  const apiError = error instanceof ApiError ? error : toApiError(error);
  return apiError.code === "CANCELED";
}

export function handleApiError(error: unknown): string {
  const apiError = toApiError(error);
  if (apiError.code === "CANCELED") return apiError.message;
  logger.error(
    `[API ${apiError.code ?? "ERROR"}] ${apiError.method ?? ""} ${apiError.url ?? ""} → ${apiError.message}`,
    apiError.details
  );
  return apiError.message;
}

/**
 * Re-throw as ApiError after logging (for callers that prefer throw).
 */
export function throwApiError(error: unknown): never {
  const apiError = toApiError(error);
  handleApiError(apiError);
  throw apiError;
}
