import apiClient from '../../../api/client';
import type {
  EmiCreateInput,
  EmiPayInput,
  EmiStatus,
  EmiUpdateInput,
  VehicleEmi,
  VehicleEmiInstallment,
} from '../types';
import {
  mapEmiListResponse,
  mapEmiResponse,
  mapEmiScheduleResponse,
} from './emiMappers';

const BASE = '/fleet/emis';

export interface EmiListParams {
  vehicleId?: number | string;
  status?: EmiStatus | 'all';
  search?: string;
  signal?: AbortSignal;
}

export const emiApi = {
  /**
   * List EMI records (for future phases with manual EMI management).
   * Not used in the current read-only EMI schedule phase.
   */
  async list(params: EmiListParams = {}): Promise<VehicleEmi[]> {
    const query: Record<string, string | number> = {};
    if (params.vehicleId != null && params.vehicleId !== '' && params.vehicleId !== 'all') {
      query.vehicleId = Number(params.vehicleId);
    }
    if (params.status && params.status !== 'all') query.status = params.status;
    if (params.search?.trim()) query.search = params.search.trim();

    const response = await apiClient.get<unknown>(BASE, {
      params: query,
      signal: params.signal,
    });
    return mapEmiListResponse(response.data);
  },

  async getById(id: number, signal?: AbortSignal): Promise<VehicleEmi> {
    const response = await apiClient.get<unknown>(`${BASE}/${id}`, { signal });
    return mapEmiResponse(response.data);
  },

  async create(payload: EmiCreateInput): Promise<VehicleEmi> {
    const body: Record<string, unknown> = {
      vehicleId: payload.vehicleId,
      financeCompany: payload.financeCompany.trim(),
      loanAmount: payload.loanAmount,
      totalEMIs: payload.totalEMIs,
      startDate: payload.startDate,
    };
    if (payload.endDate) body.endDate = payload.endDate;
    if (payload.emiAmount != null) body.emiAmount = payload.emiAmount;
    const response = await apiClient.post<unknown>(BASE, body);
    return mapEmiResponse(response.data);
  },

  async update(id: number, payload: EmiUpdateInput): Promise<VehicleEmi> {
    const body: Record<string, unknown> = {};
    if (payload.financeCompany !== undefined) body.financeCompany = payload.financeCompany.trim();
    if (payload.loanAmount !== undefined) body.loanAmount = payload.loanAmount;
    if (payload.totalEMIs !== undefined) body.totalEMIs = payload.totalEMIs;
    if (payload.startDate !== undefined) body.startDate = payload.startDate;
    if (payload.endDate !== undefined) body.endDate = payload.endDate;
    if (payload.emiAmount !== undefined) body.emiAmount = payload.emiAmount;
    const response = await apiClient.put<unknown>(`${BASE}/${id}`, body);
    return mapEmiResponse(response.data);
  },

  async listSchedule(id: number, signal?: AbortSignal): Promise<VehicleEmiInstallment[]> {
    const response = await apiClient.get<unknown>(`${BASE}/${id}/schedule`, { signal });
    return mapEmiScheduleResponse(response.data);
  },

  async pay(id: number, payload: EmiPayInput = {}): Promise<VehicleEmi> {
    const body: Record<string, unknown> = {};
    if (payload.paidBy) body.paidBy = payload.paidBy;
    if (payload.idempotencyKey) body.idempotencyKey = payload.idempotencyKey;
    const response = await apiClient.post<unknown>(`${BASE}/${id}/pay`, body);
    return mapEmiResponse(response.data);
  },
};

export default emiApi;