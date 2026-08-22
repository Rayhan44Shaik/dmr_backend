/**
 * Frontend API foundation
 * ------------------------
 * Axios client, helpers, interceptors, and error handling for the
 * local PostgreSQL backend (http://localhost:4000).
 *
 * Intentionally not wired into UI or localStorage yet.
 */

export { API_CONFIG } from "./config";
export { apiClient, default as api } from "./client";
export {
  apiGet,
  apiPost,
  apiPut,
  apiPatch,
  apiDelete,
  apiTryGet,
  apiHelpers,
} from "./helpers";
export {
  ApiError,
  toApiError,
  handleApiError,
  throwApiError,
} from "./errors";
export type {
  HttpMethod,
  ApiRequestOptions,
  ApiErrorBody,
  ApiResult,
} from "./types";
