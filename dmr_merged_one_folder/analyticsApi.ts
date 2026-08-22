import apiClient from '../../../api/client';
import type { FleetAnalyticsResponse } from '../types/analytics';

export interface AnalyticsQueryParams {
  fromDate: string;
  toDate: string;
  vehicleId?: number | null;
  signal?: AbortSignal;
}

export const analyticsApi = {
  async get(params: AnalyticsQueryParams): Promise<FleetAnalyticsResponse> {
    const query: Record<string, string | number> = {
      fromDate: params.fromDate,
      toDate: params.toDate,
    };
    if (params.vehicleId != null) query.vehicleId = params.vehicleId;
    const res = await apiClient.get<FleetAnalyticsResponse>('/fleet/analytics', {
      params: query,
      signal: params.signal,
    });
    return res.data;
  },
};

export default analyticsApi;
