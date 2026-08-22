// Backend API client for Fleet Maintenance + bill/spare-part documents.
// The maintenance records and the document binaries live in PostgreSQL — this
// layer talks to the backend, it never stores binary data in localStorage.
import apiClient from '../../../api/client';
import { saveAs } from 'file-saver';
import type { MaintenanceDocument, MaintenanceEvent } from '../types';

const BASE = '/fleet/maintenance';

export interface MaintenanceDocumentMetadata {
  id: number;
  maintenanceId: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt?: string | null;
}

export interface MaintenanceListParams {
  vehicleId?: number | string;
  driverId?: number | string;
  fromDate?: string;
  toDate?: string;
  status?: string;
  search?: string;
  includeDeleted?: boolean;
  /** Approved tab: return only the latest approved record per vehicle (backend). */
  latestApproved?: boolean;
  page?: number;
  limit?: number;
}

/** Server-generated bill number format, e.g. MNT-20260813-001 */
export const isServerBillNo = (billNo?: string | null): boolean =>
  /^MNT-\d{8}-\d{3}$/.test(billNo ?? '');

/** Map a backend FleetMaintenance row into the frontend MaintenanceEvent shape. */
export function mapMaintenanceToEvent(record: any): MaintenanceEvent {
  const deleted = Boolean(record.deleted || record.deletedAt);
  const normalizedStatus = String(record.paymentStatus || record.status || '').toLowerCase();
  return {
    id: String(record.id),
    vehicleId: record.vehicleId != null ? String(record.vehicleId) : '',
    vehicleNo: record.vehicleNo != null ? String(record.vehicleNo) : '',
    date: record.date ? new Date(record.date).toISOString() : new Date().toISOString(),
    billNumber: record.billNo || '',
    currentKM: Number(record.currentKM) || 0,
    maintenanceType: record.maintenanceType || '',
    serviceType: record.serviceType || '',
    garage: record.garage || '',
    mechanic: record.mechanic || '',
    driverId: record.driverId != null ? String(record.driverId) : '',
    driverName: record.driverName || '',
    nextServiceKM: record.nextServiceKM != null ? Number(record.nextServiceKM) : 0,
    totalCost: Number(record.totalCost) || 0,
    parts: Array.isArray(record.parts) ? record.parts : [],
    remarks: record.remarks || '',
    createdAt: record.createdAt || undefined,
    createdBy: record.createdBy || undefined,
    updatedAt: record.updatedAt || undefined,
    approvedBy: record.approvedBy || undefined,
    approvedAt: record.approvedAt || undefined,
    paymentStatus: normalizedStatus === 'approved' ? 'approved' : 'pending',
    deletedAt: deleted ? record.deletedAt || record.updatedAt || undefined : undefined,
    documents: (Array.isArray(record.documents) ? record.documents : []).map((d: any) => ({
      id: d.id,
      maintenanceId: d.maintenanceId,
      fileName: d.fileName,
      mimeType: d.mimeType,
      fileSize: d.fileSize,
      createdAt: d.createdAt,
    })),
  };
}

export const maintenanceApi = {
  /** GET /fleet/maintenance — history list (array or { data, meta }). */
  async list(params: MaintenanceListParams = {}) {
    const res = await apiClient.get(BASE, { params });
    return res.data;
  },

  /** POST /fleet/maintenance — create with documents (multipart). */
  async create(formData: FormData) {
    const res = await apiClient.post(BASE, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120_000,
    });
    return res.data;
  },

  /** PUT /fleet/maintenance/:id — update with documents (multipart). */
  async update(id: string | number, formData: FormData) {
    const res = await apiClient.put(`${BASE}/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120_000,
    });
    return res.data;
  },

  /** DELETE /fleet/maintenance/:id — soft delete. */
  async remove(id: string | number, reason?: string) {
    const res = await apiClient.delete(`${BASE}/${id}`, {
      headers: { 'Content-Type': 'application/json' },
      data: reason ? { reason } : undefined,
    });
    return res.data;
  },

  /** POST /fleet/maintenance/:id/approve — approve a pending maintenance record
   * (status-only change; documents are never touched). */
  async approve(id: string | number, approvedBy?: string) {
    const res = await apiClient.post(`${BASE}/${id}/approve`, {
      approvedBy: approvedBy || 'system',
    });
    return res.data;
  },

  /** GET /fleet/maintenance/:id/documents — metadata list. */
  async listDocuments(maintenanceId: string | number): Promise<MaintenanceDocument[]> {
    const res = await apiClient.get(`${BASE}/${maintenanceId}/documents`);
    return res.data;
  },

  /** Raw binary URL for <img> / <iframe> / download links. */
  documentUrl(maintenanceId: string | number, documentId: number): string {
    const base = (apiClient.defaults.baseURL || '').replace(/\/+$/, '');
    return `${base}${BASE}/${maintenanceId}/documents/${documentId}`;
  },

  /** DELETE /fleet/maintenance/:id/documents/:documentId — remove one document. */
  async removeDocument(maintenanceId: string | number, documentId: number) {
    const res = await apiClient.delete(`${BASE}/${maintenanceId}/documents/${documentId}`);
    return res.data;
  },

  /** Fetch a document binary and save it locally. */
  async downloadDocument(maintenanceId: string | number, doc: MaintenanceDocument) {
    const res = await apiClient.get(`${BASE}/${maintenanceId}/documents/${doc.id}`, {
      responseType: 'blob',
    });
    saveAs(res.data as Blob, doc.fileName || 'maintenance-document');
  },
};

export default maintenanceApi;
