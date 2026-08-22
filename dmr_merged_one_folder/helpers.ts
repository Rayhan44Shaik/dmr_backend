import type { AxiosRequestConfig } from "axios";
import { apiClient } from "./client";
import { handleApiError, throwApiError } from "./errors";
import type { ApiRequestOptions, ApiResult } from "./types";

function toAxiosConfig(options?: ApiRequestOptions): AxiosRequestConfig {
  if (!options) return {};
  return {
    headers: options.headers,
    signal: options.signal,
    params: options.params,
    timeout: options.timeout,
  };
}

async function request<T>(
  config: AxiosRequestConfig
): Promise<ApiResult<T>> {
  try {
    const response = await apiClient.request<T>(config);
    return { data: response.data, status: response.status };
  } catch (error) {
    throwApiError(error);
  }
}

/** GET helper */
export async function apiGet<T>(
  url: string,
  options?: ApiRequestOptions
): Promise<ApiResult<T>> {
  return request<T>({ method: "GET", url, ...toAxiosConfig(options) });
}

/** POST helper */
export async function apiPost<T, B = unknown>(
  url: string,
  body?: B,
  options?: ApiRequestOptions
): Promise<ApiResult<T>> {
  return request<T>({
    method: "POST",
    url,
    data: body,
    ...toAxiosConfig(options),
  });
}

/** PUT helper */
export async function apiPut<T, B = unknown>(
  url: string,
  body?: B,
  options?: ApiRequestOptions
): Promise<ApiResult<T>> {
  return request<T>({
    method: "PUT",
    url,
    data: body,
    ...toAxiosConfig(options),
  });
}

/** PATCH helper */
export async function apiPatch<T, B = unknown>(
  url: string,
  body?: B,
  options?: ApiRequestOptions
): Promise<ApiResult<T>> {
  return request<T>({
    method: "PATCH",
    url,
    data: body,
    ...toAxiosConfig(options),
  });
}

/** DELETE helper */
export async function apiDelete<T = void>(
  url: string,
  options?: ApiRequestOptions
): Promise<ApiResult<T>> {
  return request<T>({ method: "DELETE", url, ...toAxiosConfig(options) });
}

/**
 * Soft helper: returns data or null and never throws.
 * Useful for optional probes (e.g. health) without changing UI flow.
 */
export async function apiTryGet<T>(
  url: string,
  options?: ApiRequestOptions
): Promise<T | null> {
  try {
    const result = await apiGet<T>(url, options);
    return result.data;
  } catch (error) {
    handleApiError(error);
    return null;
  }
}

export const apiHelpers = {
  get: apiGet,
  post: apiPost,
  put: apiPut,
  patch: apiPatch,
  delete: apiDelete,
  tryGet: apiTryGet,
} as const;
