import axios, { AxiosError, type AxiosInstance } from "axios";
import { mapApiTripToTrip } from "../../operations/vehicle-trips/services/tripHeaderApiService";
import type { Trip } from "../../operations/vehicle-trips/types/trip";
import type { MobileSupervisorProfile } from "../auth/mobileAuthStorage";

const env = (import.meta as ImportMeta & { env?: Record<string, string | boolean> }).env ?? {};
const configuredBase = typeof env.VITE_MOBILE_API_BASE_URL === "string"
  ? env.VITE_MOBILE_API_BASE_URL.trim()
  : "";
const isDevelopment = env.DEV === true;
const baseURL = configuredBase || "/api/mobile";

function assertSecureMobileEndpoint(): void {
  if (isDevelopment || !/^http:\/\//i.test(baseURL)) return;
  throw new MobileApiError(
    "Supervisor Mobile requires an HTTPS API endpoint.",
    "INSECURE_CONFIGURATION",
    0,
    false
  );
}

let accessToken: string | null = null;

export class MobileApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly retryable: boolean,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "MobileApiError";
  }
}

function toMobileApiError(error: unknown): MobileApiError {
  if (error instanceof MobileApiError) return error;
  if (error instanceof AxiosError || axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ error?: string; details?: unknown }>;
    const status = axiosError.response?.status ?? 0;
    const message = axiosError.response?.data?.error ||
      (status === 0
        ? "Office backend is not reachable."
        : status === 401
          ? "Your mobile session has expired."
          : status === 403
            ? "You are not authorized for this Trip."
            : status === 409
              ? "This Trip was changed from another client."
              : "Mobile synchronization failed.");
    const detailCode =
      axiosError.response?.data?.details &&
      typeof axiosError.response.data.details === "object" &&
      "code" in axiosError.response.data.details
        ? String((axiosError.response.data.details as { code?: unknown }).code)
        : status
          ? `HTTP_${status}`
          : "OFFICE_UNREACHABLE";
    return new MobileApiError(
      message,
      detailCode,
      status,
      status === 0 || status === 408 || status === 429 || status >= 500,
      axiosError.response?.data?.details
    );
  }
  return new MobileApiError(
    error instanceof Error ? error.message : "Mobile synchronization failed.",
    "UNKNOWN",
    0,
    true
  );
}

const client: AxiosInstance = axios.create({
  baseURL,
  timeout: Number(env.VITE_MOBILE_API_TIMEOUT_MS ?? 30_000),
  headers: { Accept: "application/json", "Content-Type": "application/json" },
});

client.interceptors.request.use((config) => {
  assertSecureMobileEndpoint();
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(toMobileApiError(error))
);

export function setMobileAccessToken(token: string | null): void {
  accessToken = token;
}

export type MobileTrip = Trip & { version: number };

function mapMobileTrip(raw: Record<string, unknown>): MobileTrip {
  return {
    ...mapApiTripToTrip(raw),
    version: Number(raw.version ?? 1),
  };
}

export type MobileBootstrap = {
  supervisor: MobileSupervisorProfile;
  employees: Array<{ id: number; employeeName: string; department: string; role: string; status: string }>;
  vehicles: Array<{ id: number; vehicleNo: number; vehicleNumber: string; noOfBoxes: number; status: string }>;
  farms: Array<{ id: number; farmNo: number; farmName: string; address: string; village: string; status: string }>;
  shops: Array<{ id: number; shopNo: number; shopName: string; village: string; status: string }>;
  birdTypes: Array<{ id: number; birdTypeNo: number; birdType: string; averageWeight: number; status: string }>;
};

export type MobileOperationRequest = {
  operationId: string;
  clientDraftId: string;
  expectedVersion?: number | null;
  mode: "save" | "submit";
  payload: Partial<Trip>;
};

export type MobileAcknowledgement = {
  acknowledged: true;
  operationId: string;
  trip: MobileTrip;
  serverTime: string;
  replayed: boolean;
};

function mapAcknowledgement(raw: Record<string, unknown>): MobileAcknowledgement {
  if (raw.acknowledged !== true || !raw.operationId || !raw.trip || !raw.serverTime) {
    throw new MobileApiError("Invalid acknowledgement from office backend.", "INVALID_ACK", 0, true);
  }
  return {
    acknowledged: true,
    operationId: String(raw.operationId),
    trip: mapMobileTrip(raw.trip as Record<string, unknown>),
    serverTime: String(raw.serverTime),
    replayed: raw.replayed === true,
  };
}

export async function mobileLogin(username: string, password: string) {
  const { data } = await client.post<{
    token: string;
    expiresAt: string;
    supervisor: MobileSupervisorProfile;
  }>("/auth/login", { username, password });
  return data;
}

export async function mobileLogout(): Promise<void> {
  await client.post("/auth/logout");
}

export async function mobileMe() {
  const { data } = await client.get<{
    supervisor: MobileSupervisorProfile;
    expiresAt: string;
  }>("/auth/me");
  return data;
}

export async function mobileHealth() {
  const { data } = await client.get<{
    ok: true;
    authenticated: true;
    databaseReachable: true;
    supervisorId: number;
    serverTime: string;
  }>("/sync/health", { timeout: 8_000 });
  return data;
}

export async function loadMobileBootstrap(): Promise<MobileBootstrap> {
  const { data } = await client.get<MobileBootstrap>("/bootstrap");
  return data;
}

export async function listMobileDrafts(): Promise<MobileTrip[]> {
  const { data } = await client.get<Record<string, unknown>[]>("/trips");
  return data.map(mapMobileTrip).filter((trip) => trip.status === "Draft" && !trip.deleted);
}

export async function loadMobileTrip(tripId: number): Promise<MobileTrip> {
  const { data } = await client.get<Record<string, unknown>>(`/trips/${tripId}`);
  return mapMobileTrip(data);
}

export async function createMobileTrip(
  request: MobileOperationRequest
): Promise<MobileAcknowledgement> {
  const { data } = await client.post<Record<string, unknown>>("/trips/steps/start", request);
  return mapAcknowledgement(data);
}

export async function applyMobileTripStep(
  tripId: number,
  step: "start" | "farm" | "pickup" | "deliveries" | "expenses",
  request: MobileOperationRequest
): Promise<MobileAcknowledgement> {
  const { data } = await client.post<Record<string, unknown>>(
    `/trips/${tripId}/steps/${step}`,
    request
  );
  return mapAcknowledgement(data);
}

export function asMobileApiError(error: unknown): MobileApiError {
  return toMobileApiError(error);
}

export const MOBILE_API_BASE_URL = baseURL;
