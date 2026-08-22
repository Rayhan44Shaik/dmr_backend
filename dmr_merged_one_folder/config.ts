/**
 * API configuration for the DMR Poultries backend.
 * Backend Phase 1 runs locally at http://localhost:4000
 *
 * Override with VITE_API_BASE_URL in a frontend .env file when needed.
 */

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env ?? {};

export const API_CONFIG = {
  baseURL: env.VITE_API_BASE_URL ?? "http://localhost:4000/api",
  timeoutMs: Number(env.VITE_API_TIMEOUT_MS ?? 30_000),
  withCredentials: false,
} as const;
