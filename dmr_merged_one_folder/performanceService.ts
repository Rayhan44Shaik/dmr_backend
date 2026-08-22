// src/modules/staff/services/performanceService.ts
// Read-only staff performance API — GET /api/staff/performance/{drivers|supervisors}.
// No localStorage, no synthetic figures; the backend aggregates everything.

import { apiGet } from "../../../api";
import type {
  DriverPerformanceResponse,
  SupervisorPerformanceResponse,
} from "../types/performance";

export interface PerformanceQueryParams {
  fromDate: string;
  toDate: string;
  search?: string;
  driverId?: number | null;
  supervisorId?: number | null;
  vehicleId?: number | null;
}

const PERFORMANCE_PATH = "/staff/performance";

function buildQuery(params: PerformanceQueryParams): Record<string, string | number> {
  const query: Record<string, string | number> = {
    fromDate: params.fromDate,
    toDate: params.toDate,
  };
  if (params.search?.trim()) query.search = params.search.trim();
  if (params.driverId != null) query.driverId = params.driverId;
  if (params.supervisorId != null) query.supervisorId = params.supervisorId;
  if (params.vehicleId != null) query.vehicleId = params.vehicleId;
  return query;
}

export async function getDriverPerformance(
  params: PerformanceQueryParams
): Promise<DriverPerformanceResponse> {
  const { data } = await apiGet<DriverPerformanceResponse>(
    `${PERFORMANCE_PATH}/drivers`,
    { params: buildQuery(params) }
  );
  return data;
}

export async function getSupervisorPerformance(
  params: PerformanceQueryParams
): Promise<SupervisorPerformanceResponse> {
  const { data } = await apiGet<SupervisorPerformanceResponse>(
    `${PERFORMANCE_PATH}/supervisors`,
    { params: buildQuery(params) }
  );
  return data;
}