// Backend API client for Fleet → Permits (vehicle permit / document expiry).
// Records and optional scans live in PostgreSQL — this layer talks to the
// backend; it never stores permit data in localStorage.
import apiClient from '../../../api/client';
import { saveAs } from 'file-saver';
import type { PermitDocument } from '../types';

const BASE = '/fleet/permits';

export interface PermitSummary {
  total: number;
  byType: Record<
    string,
    { total: number; expired: number; expiring: number; safe: number }
  >;
}

/** JSON payload for a permit upsert (documented shape — the runtime accepts a
 * plain JSON object or a FormData with an optional "document" file). */
export interface PermitUpsertPayload {
  vehicleId?: number;
  documentNumber?: string;
  validFrom?: string | null;
  expiryDate: string;
  remarks?: string | null;
  createdBy?: string;
  removeDocument?: boolean;
}

export const permitApi = {
  /** GET /fleet/permits — every permit document across all vehicles. */
  async list(): Promise<PermitDocument[]> {
    const res = await apiClient.get(BASE);
    return res.data;
  },

  /** GET /fleet/permits/summary — per-type totals + expiry buckets. */
  async summary(): Promise<PermitSummary> {
    const res = await apiClient.get(`${BASE}/summary`);
    return res.data;
  },

  /** PUT /fleet/permits/:vehicleId/:docType — create or update one record.
   * Accepts either a JSON payload or a FormData carrying an optional scan under
   * the field name "document". */
  async upsert(
    vehicleId: string | number,
    docType: string,
    payload: PermitUpsertPayload | Record<string, unknown> | FormData
  ): Promise<PermitDocument> {
    const isForm = payload instanceof FormData;
    const res = await apiClient.put(`${BASE}/${vehicleId}/${docType}`, payload, {
      headers: isForm ? { 'Content-Type': 'multipart/form-data' } : undefined,
      timeout: 120_000,
    });
    return res.data;
  },

  /** DELETE /fleet/permits/:vehicleId/:docType — remove the record. */
  async remove(vehicleId: string | number, docType: string) {
    const res = await apiClient.delete(`${BASE}/${vehicleId}/${docType}`);
    return res.data;
  },

  /** Raw binary URL for the attached scan (<img> / <iframe> / download links). */
  documentUrl(vehicleId: string | number, docType: string): string {
    const base = (apiClient.defaults.baseURL || '').replace(/\/+$/, '');
    return `${base}${BASE}/${vehicleId}/${docType}/document`;
  },

  /** Download through Axios so API errors are normalized consistently. */
  async downloadDocument(vehicleId: string | number, docType: string, fileName?: string | null) {
    const res = await apiClient.get(`${BASE}/${vehicleId}/${docType}/document`, { responseType: 'blob' });
    saveAs(res.data as Blob, fileName || `${docType}-document`);
  },
};

export default permitApi;
