import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  parse,
  format,
  isBefore,
  differenceInDays,
  addDays,
} from 'date-fns';
import { useVehicles } from '../../masters/vehicles/hooks/useVehicles';
import { Vehicle } from '../../masters/vehicles/types/vehicle';
import permitApi from '../services/permitApi';
import { fleetCacheInvalidate, fleetSharedGet } from '../services/fleetSessionCache';
import type { PermitDocument } from '../types';
import { DocumentTypeEnum, VehicleDocument, DocumentType } from '../types';

type DocumentTypeKey = 'insurance' | 'fitness' | 'permit' | 'puc' | 'rc';
type Counts = Record<DocumentTypeKey, number>;

interface MatrixRow {
  vehicle: Vehicle;
  docMap: Partial<Record<DocumentTypeKey, VehicleDocument>>;
}

interface StatusCounts {
  [type: string]: {
    expired: number;
    expiring: number;
    safe: number;
  };
}

/** Frontend shape of a permit document — VehicleDocument plus scan metadata. */
export interface PermitViewDocument extends VehicleDocument {
  docType: string;
  hasDocument: boolean;
  fileName: string | null;
  mimeType: string | null;
  validFrom?: string | null;
  remarks?: string | null;
}

// Helpers
const parseDate = (dateStr: string | undefined): Date | null => {
  if (!dateStr) return null;
  const parsed = parse(dateStr, 'dd/MM/yyyy', new Date());
  return isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (dateStr: string | undefined): string => {
  const parsed = parseDate(dateStr);
  return parsed ? format(parsed, 'dd-MMM-yyyy') : '—';
};

const toDisplayFormat = (dateStr: string): string => {
  if (!dateStr) return '';
  const yyyyMMdd = /^\d{4}-\d{2}-\d{2}$/;
  if (yyyyMMdd.test(dateStr)) {
    const parts = dateStr.split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  const ddMMyyyy = /^\d{2}\/\d{2}\/\d{4}$/;
  if (ddMMyyyy.test(dateStr)) return dateStr;
  const parsed = parse(dateStr, 'yyyy-MM-dd', new Date());
  if (!isNaN(parsed.getTime())) return format(parsed, 'dd/MM/yyyy');
  return dateStr;
};

const toIsoFormat = (dateStr: string): string => {
  if (!dateStr) return '';
  const yyyyMMdd = /^\d{4}-\d{2}-\d{2}$/;
  if (yyyyMMdd.test(dateStr)) return dateStr;
  const parsed = parse(dateStr, 'dd/MM/yyyy', new Date());
  if (!isNaN(parsed.getTime())) return format(parsed, 'yyyy-MM-dd');
  return dateStr;
};

/** Convert a backend permit record into the shape the matrix / modal expects,
 * with expiry dates normalized to dd/MM/yyyy for the existing UI. */
function mapPermitToView(p: PermitDocument): PermitViewDocument {
  return {
    id: String(p.id),
    vehicleId: String(p.vehicleId),
    type: p.docType as DocumentType,
    documentNumber: p.documentNumber,
    expiryDate: toDisplayFormat(p.expiryDate),
    status: 'valid',
    docType: p.docType,
    hasDocument: p.hasDocument,
    fileName: p.fileName,
    mimeType: p.mimeType,
    validFrom: p.validFrom,
    remarks: p.remarks,
  } as PermitViewDocument;
}

export function useDocumentsData() {
  const { vehicles } = useVehicles();
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permitDocs, setPermitDocs] = useState<PermitViewDocument[]>([]);
  const hasLoaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasLoaded.current) setLoading(true);
      try {
        const rows = await fleetSharedGet('permits:list', () => permitApi.list());
        if (!cancelled) {
          hasLoaded.current = true;
          setPermitDocs(rows.map(mapPermitToView));
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          if (!hasLoaded.current) setPermitDocs([]);
          const msg =
            e instanceof Error ? e.message : 'Failed to load permit documents';
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const documents = useMemo(() => permitDocs, [permitDocs]);

  const [filterType, setFilterType] = useState<string>('all');
  const now = useMemo(() => new Date(), []);
  const thirtyDaysLater = addDays(now, 30);
  const sixtyDaysLater = addDays(now, 60);

  const totalCounts = useMemo<Counts>(() => {
    const counts: Counts = { insurance: 0, fitness: 0, permit: 0, puc: 0, rc: 0 };
    documents.forEach((d) => {
      if (d.expiryDate) {
        counts[d.type as DocumentTypeKey] = (counts[d.type as DocumentTypeKey] || 0) + 1;
      }
    });
    return counts;
  }, [documents]);

  const statusCounts = useMemo<StatusCounts>(() => {
    const result: StatusCounts = {};
    const types = ['insurance', 'fitness', 'permit', 'puc', 'rc'] as const;
    types.forEach((type) => {
      result[type] = { expired: 0, expiring: 0, safe: 0 };
    });
    documents.forEach((d) => {
      const key = d.type as DocumentTypeKey;
      if (!result[key]) return;
      const expDate = parseDate(d.expiryDate);
      if (expDate) {
        const days = differenceInDays(expDate, now);
        if (days < 0) result[key].expired += 1;
        else if (days <= 30) result[key].expiring += 1;
        else result[key].safe += 1;
      }
    });
    return result;
  }, [documents, now]);

  const expiringCounts = useMemo<Counts>(() => {
    const counts: Counts = { insurance: 0, fitness: 0, permit: 0, puc: 0, rc: 0 };
    documents.forEach((d) => {
      const expDate = parseDate(d.expiryDate);
      if (expDate) {
        const daysUntil = differenceInDays(expDate, now);
        if (daysUntil > 0 && daysUntil <= 30) {
          const key = d.type as DocumentTypeKey;
          counts[key] = (counts[key] || 0) + 1;
        }
      }
    });
    return counts;
  }, [documents, now]);

  const matrix = useMemo<MatrixRow[]>(() => {
    const byKey = new Map<string, VehicleDocument>();
    documents.forEach((doc) => {
      byKey.set(`${String(doc.vehicleId)}:${doc.type}`, doc);
    });
    return vehicles.map((vehicle) => {
      const docMap: Partial<Record<DocumentTypeKey, VehicleDocument>> = {};
      DocumentTypeEnum.forEach((type) => {
        const doc = byKey.get(`${String(vehicle.id)}:${type}`);
        if (doc) {
          docMap[type as DocumentTypeKey] = doc;
        }
      });
      return { vehicle, docMap };
    });
  }, [vehicles, documents]);

  const getStatusColor = (expiryDate?: string): string => {
    if (!expiryDate) return 'text-gray-400';
    const d = parseDate(expiryDate);
    if (!d) return 'text-gray-400';
    if (isBefore(d, now)) return 'bg-red-100 text-red-800';
    if (isBefore(d, thirtyDaysLater)) return 'bg-amber-100 text-amber-800';
    if (isBefore(d, sixtyDaysLater)) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
  };

  const formatExpiryDate = formatDate;

  const refetch = useCallback(() => {
    fleetCacheInvalidate('permits:');
    if (!hasLoaded.current) setLoading(true);
    setError(null);
    setRefreshKey((prev) => prev + 1);
  }, []);

  /** Save expiry dates / document numbers for one or more types, optionally
   * uploading a scan (files[type]) or removing an existing scan (removes[type]). */
  const updateDocument = useCallback(
    async (
      vehicleId: string | number,
      updates: Record<
        string,
        string | { expiryDate?: string; documentNumber?: string; validFrom?: string; remarks?: string } | null
      >,
      files?: Record<string, File | null>,
      removes?: Record<string, boolean>
    ) => {
      for (const [type, value] of Object.entries(updates)) {
        const dateStr = typeof value === 'string' ? value : value?.expiryDate;
        const docNo = typeof value === 'object' && value !== null ? value.documentNumber : undefined;
        const validFrom = typeof value === 'object' && value !== null ? value.validFrom : undefined;
        const remarks = typeof value === 'object' && value !== null ? value.remarks : undefined;

        const payload: Record<string, unknown> = {};
        if (dateStr) payload.expiryDate = toIsoFormat(dateStr);
        if (docNo !== undefined && docNo !== null) payload.documentNumber = docNo;
        if (validFrom !== undefined) payload.validFrom = validFrom ? toIsoFormat(validFrom) : null;
        if (remarks !== undefined) payload.remarks = remarks || null;
        if (removes?.[type]) payload.removeDocument = true;

        const file = files?.[type] ?? undefined;
        if (file) {
          const fd = new FormData();
          Object.entries(payload).forEach(([k, v]) => {
            if (v !== undefined && v !== null) fd.append(k, String(v));
          });
          fd.append('document', file, file.name);
          await permitApi.upsert(vehicleId, type, fd);
        } else {
          await permitApi.upsert(vehicleId, type, payload);
        }
      }
      fleetCacheInvalidate('permits:');
      if (!hasLoaded.current) setLoading(true);
      setError(null);
      setRefreshKey((prev) => prev + 1);
      return { success: true };
    },
    []
  );

  return {
    documents,
    totalCounts,
    statusCounts,
    expiringCounts,
    matrix,
    hasData: permitDocs.length > 0,
    filterType,
    setFilterType,
    getStatusColor,
    formatExpiryDate,
    refetch,
    updateDocument,
    loading,
    error,
  };
}
