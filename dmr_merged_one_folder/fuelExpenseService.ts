import { apiDelete, apiGet, apiPost, apiPut, throwApiError } from "../../../../api";
import type { FuelExpense, FuelExpenseDraft, FuelUiStatus } from "../types/fuelExpense";

const PATH = "/operations/fuel-expenses";

export interface FuelListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface FuelListResult {
  data: FuelExpense[];
  meta: FuelListMeta;
}

export interface FuelListFilters {
  page?: number;
  limit?: number;
  fromDate?: string;
  toDate?: string;
  vehicleNo?: string;
  sourceType?: string;
  status?: string;
  tripNo?: string;
  billNo?: string;
  search?: string;
}

interface ApiFuel {
  id: string;
  billNo: string;
  billDate: string;
  sourceType?: string;
  vehicleId: number | null;
  vehicleNo: string | null;
  driverId: number | null;
  driverName: string | null;
  supervisorId: number | null;
  supervisorName: string | null;
  tripId?: number | null;
  tripNo?: string | null;
  currentMeter: number;
  fuelRate: number;
  liters: number;
  amount: number;
  pumpName: string;
  remarks?: string | null;
  gpsLat?: number | null;
  gpsLon?: number | null;
  gpsAccuracy?: number | null;
  gpsCapturedAt?: string | null;
  status: string;
  imageData?: string | null;
  imageName?: string | null;
  createdAt?: string | null;
  createdBy?: string;
  approvedAt?: string | null;
  approvedBy?: string | null;
  updatedAt?: string | null;
}

function mapStatus(status: string): FuelUiStatus {
  if (status === "Approved") return "Approved";
  if (status === "Rejected") return "Rejected";
  return "Pending";
}

function mapRow(row: ApiFuel): FuelExpense {
  return {
    id: row.id,
    billNo: row.billNo,
    date: row.billDate,
    sourceType: row.sourceType === "TRIP" ? "TRIP" : "MANUAL",
    vehicleId: row.vehicleId ?? 0,
    vehicleNo: row.vehicleNo ?? "",
    driverId: row.driverId ?? 0,
    driverName: row.driverName ?? "",
    supervisorId: row.supervisorId ?? 0,
    supervisorName: row.supervisorName ?? "",
    tripId: row.tripId ?? null,
    tripNo: row.tripNo ?? null,
    meterReading: Number(row.currentMeter ?? 0),
    amount: Number(row.amount ?? 0),
    rate: Number(row.fuelRate ?? 0),
    litres: Number(row.liters ?? 0),
    petrolBunk: row.pumpName ?? "",
    remarks: row.remarks ?? undefined,
    gpsLat: row.gpsLat ?? null,
    gpsLon: row.gpsLon ?? null,
    gpsAccuracy: row.gpsAccuracy ?? null,
    gpsCapturedAt: row.gpsCapturedAt ?? null,
    status: mapStatus(row.status),
    createdDate: row.createdAt ?? "",
    createdBy: row.createdBy ?? "",
    approvedDate: row.approvedAt ?? undefined,
    approvedBy: row.approvedBy ?? undefined,
    updatedDate: row.updatedAt ?? undefined,
    image: row.imageData ?? undefined,
    imageName: row.imageName ?? undefined,
    synced: true,
  };
}

function toBody(draft: FuelExpenseDraft | Partial<FuelExpense>) {
  return {
    billDate: draft.date,
    vehicleId: draft.vehicleId,
    vehicleNo: draft.vehicleNo,
    driverId: draft.driverId,
    driverName: draft.driverName,
    supervisorId: draft.supervisorId,
    supervisorName: draft.supervisorName,
    currentMeter: draft.meterReading,
    fuelRate: draft.rate,
    liters: draft.litres,
    pumpName: draft.petrolBunk,
    remarks: draft.remarks ?? null,
    imageData: draft.image ?? null,
    imageName: draft.imageName ?? null,
    gpsLat: draft.gpsLat ?? null,
    gpsLon: draft.gpsLon ?? null,
    gpsAccuracy: draft.gpsAccuracy ?? null,
    gpsCapturedAt: draft.gpsCapturedAt ?? null,
  };
}

let listCache: FuelExpense[] = [];

async function list(filters: FuelListFilters = {}): Promise<FuelListResult> {
  try {
    const { data } = await apiGet<FuelListResult | ApiFuel[]>(PATH, {
      params: {
        page: filters.page ?? 1,
        limit: filters.limit ?? 10,
        fromDate: filters.fromDate || undefined,
        toDate: filters.toDate || undefined,
        vehicleNo: filters.vehicleNo || undefined,
        sourceType: filters.sourceType || undefined,
        status: filters.status || undefined,
        tripNo: filters.tripNo || undefined,
        billNo: filters.billNo || undefined,
        search: filters.search || undefined,
      },
    });
    if (Array.isArray(data)) {
      const mapped = data.map(mapRow);
      listCache = mapped;
      return {
        data: mapped,
        meta: { total: mapped.length, page: 1, limit: mapped.length || 10, totalPages: 1 },
      };
    }
    const mapped = (data.data ?? []).map((row) => mapRow(row as unknown as ApiFuel));
    listCache = mapped;
    return {
      data: mapped,
      meta: data.meta,
    };
  } catch (err) {
    throwApiError(err);
  }
}

async function getById(id: string): Promise<FuelExpense> {
  try {
    const { data } = await apiGet<ApiFuel>(`${PATH}/${id}`);
    return mapRow(data);
  } catch (err) {
    throwApiError(err);
  }
}

async function save(expense: FuelExpenseDraft): Promise<FuelExpense> {
  try {
    const { data } = await apiPost<ApiFuel>(PATH, toBody(expense));
    return mapRow(data);
  } catch (err) {
    throwApiError(err);
  }
}

async function update(id: string, updates: Partial<FuelExpense>): Promise<FuelExpense> {
  try {
    const { data } = await apiPut<ApiFuel>(`${PATH}/${id}`, toBody(updates));
    return mapRow(data);
  } catch (err) {
    throwApiError(err);
  }
}

async function remove(id: string): Promise<void> {
  try {
    await apiDelete(`${PATH}/${id}`);
  } catch (err) {
    throwApiError(err);
  }
}

async function approve(id: string, approvedBy = "Admin"): Promise<FuelExpense> {
  try {
    const { data } = await apiPost<ApiFuel>(`${PATH}/${id}/approve`, { approvedBy });
    return mapRow(data);
  } catch (err) {
    throwApiError(err);
  }
}

async function reject(id: string, reason: string, rejectedBy = "Admin"): Promise<FuelExpense> {
  try {
    const { data } = await apiPost<ApiFuel>(`${PATH}/${id}/reject`, { reason, rejectedBy });
    return mapRow(data);
  } catch (err) {
    throwApiError(err);
  }
}

function getAll(): FuelExpense[] {
  return listCache;
}

export const fuelExpenseService = {
  list,
  getAll,
  getById,
  save,
  update,
  remove,
  approve,
  reject,
};
