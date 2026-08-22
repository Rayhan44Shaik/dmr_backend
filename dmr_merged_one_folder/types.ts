/**
 * Shared API types for the Axios client layer.
 * Does not replace domain models — only transport shapes.
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiRequestOptions {
  /** Extra headers for a single request */
  headers?: Record<string, string>;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Query string params */
  params?: Record<string, unknown>;
  /** Override timeout (ms) for this request */
  timeout?: number;
}

export interface ApiErrorBody {
  error?: string;
  message?: string;
  details?: unknown;
}

export interface ApiResult<T> {
  data: T;
  status: number;
}
