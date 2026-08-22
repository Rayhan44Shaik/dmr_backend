import axios, {
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { logger } from "../logger/logger";
import { API_CONFIG } from "./config";
import { toApiError } from "./errors";

declare module "axios" {
  export interface InternalAxiosRequestConfig {
    /** Set by request interceptor for duration logging */
    metadata?: { startTime: number };
  }
}

/**
 * Centralized Axios instance for all backend HTTP calls.
 * UI and localStorage services are unchanged — this is foundation only.
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_CONFIG.baseURL,
  timeout: API_CONFIG.timeoutMs,
  withCredentials: API_CONFIG.withCredentials,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

/** Request interceptor — attach auth/metadata later without touching callers */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    config.metadata = { startTime: Date.now() };

    // Placeholder for future auth token:
    // const token = localStorage.getItem("dmr-auth-token");
    // if (token) config.headers.Authorization = `Bearer ${token}`;

    if (import.meta.env?.DEV) {
      logger.debug(
        `[API →] ${(config.method ?? "get").toUpperCase()} ${config.baseURL ?? ""}${config.url ?? ""}`
      );
    }

    return config;
  },
  (error) => Promise.reject(toApiError(error))
);

/** Response interceptor — normalize success logging and error shape */
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    const started = response.config.metadata?.startTime;
    const ms = started ? Date.now() - started : undefined;

    if (import.meta.env?.DEV) {
      logger.debug(
        `[API ←] ${response.status} ${(response.config.method ?? "get").toUpperCase()} ${response.config.url ?? ""}${ms != null ? ` (${ms}ms)` : ""}`
      );
    }

    return response;
  },
  (error) => Promise.reject(toApiError(error))
);

export default apiClient;
