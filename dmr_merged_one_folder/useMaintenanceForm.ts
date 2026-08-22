import { useState, useMemo, useCallback } from 'react';
import { useSafeNotification } from '../../../hooks/useSafeNotification';
import {
  maintenanceApi,
  mapMaintenanceToEvent,
} from '../services/maintenanceApi';
import { handleApiError } from '../../../api/errors';
import type { MaintenanceDocument, PartItem } from '../types';

export const MAINTENANCE_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file
export const MAINTENANCE_DOCUMENT_MAX_FILES = 10;
export const MAINTENANCE_DOCUMENT_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'application/pdf',
];

/** A document shown in the entry form: either already in the DB (existingId) or
 * a freshly selected local file awaiting upload. */
export interface MaintenanceDocItem {
  key: string;
  existingId?: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  file?: File;
  objectUrl?: string;
  markedForRemoval?: boolean;
}

const newKey = () => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

function inferMimeType(file: File): string {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.pdf')) return 'application/pdf';
  return 'application/octet-stream';
}

function fileIsSupported(file: File): boolean {
  const byMime = MAINTENANCE_DOCUMENT_MIME_TYPES.includes(file.type);
  const ext = (file.name || '').toLowerCase();
  const byExt = /\.(png|jpe?g|pdf)$/.test(ext);
  return byMime || byExt;
}

interface UseMaintenanceFormProps {
  onSuccess: () => void;
}

export const useMaintenanceForm = ({ onSuccess }: UseMaintenanceFormProps) => {
  const { showNotification } = useSafeNotification();

  const [form, setForm] = useState({
    id: '',
    vehicleId: '',
    date: new Date().toISOString().split('T')[0],
    billNumber: '',
    currentKM: '',
    maintenanceType: [] as string[],
    serviceType: '',
    garage: '',
    mechanic: '',
    driverId: '',
    driverName: '',
    nextServiceKM: '',
    remarks: '',
    createdAt: '',
  });

  const [parts, setParts] = useState<PartItem[]>([
    { name: '', specification: '', quantity: 1, rate: 0, amount: 0 },
  ]);

  const [documents, setDocuments] = useState<MaintenanceDocItem[]>([]);

  const totalCost = useMemo(() => {
    return parts.reduce((sum, p) => sum + (p.amount || 0), 0);
  }, [parts]);

  const validateForm = useCallback(() => {
    if (!form.vehicleId) { showNotification('Please select a vehicle.', 'error'); return false; }
    if (!form.date) { showNotification('Please select a date.', 'error'); return false; }
    if (!form.currentKM) { showNotification('Please enter current KM.', 'error'); return false; }
    if (!form.maintenanceType.length) { showNotification('Please select at least one maintenance type.', 'error'); return false; }
    if (!form.serviceType.trim()) { showNotification('Please enter service type.', 'error'); return false; }
    return true;
  }, [form, showNotification]);

  // ── Document management (multiple files, never replace previous) ──
  const addDocumentFiles = useCallback((files: File[]) => {
    const incoming = Array.from(files || []);
    if (incoming.length === 0) return;

    setDocuments((prev) => {
      const next = [...prev];
      for (const file of incoming) {
        if (next.length + 1 > MAINTENANCE_DOCUMENT_MAX_FILES) {
          showNotification(`Maximum ${MAINTENANCE_DOCUMENT_MAX_FILES} documents are allowed.`, 'error');
          continue;
        }
        if (!fileIsSupported(file)) {
          showNotification('Only PNG, JPG/JPEG, and PDF files are supported.', 'error');
          continue;
        }
        if (file.size > MAINTENANCE_DOCUMENT_MAX_BYTES) {
          showNotification(`File size cannot exceed 10 MB. ("${file.name}")`, 'error');
          continue;
        }
        const key = newKey();
        next.push({
          key,
          fileName: file.name,
          mimeType: inferMimeType(file),
          fileSize: file.size,
          file,
          objectUrl: file.type?.startsWith('image/') || /\.(png|jpe?g)$/i.test(file.name)
            ? URL.createObjectURL(file)
            : undefined,
        });
      }
      return next;
    });
  }, [showNotification]);

  const removeDocument = useCallback((key: string) => {
    setDocuments((prev) => {
      const item = prev.find((d) => d.key === key);
      if (item?.objectUrl) URL.revokeObjectURL(item.objectUrl);
      return prev.filter((d) => d.key !== key);
    });
  }, []);

  const setExistingDocuments = useCallback((existing: MaintenanceDocument[]) => {
    setDocuments((prev) => {
      const newItems = (existing || []).map((d) => ({
        key: newKey(),
        existingId: d.id,
        fileName: d.fileName,
        mimeType: d.mimeType,
        fileSize: d.fileSize ?? 0,
        createdAt: d.createdAt,
      }));
      const newFiles = prev.filter((d) => d.file);
      return [...newItems, ...newFiles];
    });
  }, []);

  const resetDocuments = useCallback(() => {
    setDocuments((prev) => {
      prev.forEach((d) => { if (d.objectUrl) URL.revokeObjectURL(d.objectUrl); });
      return [];
    });
  }, []);

  // Reset to fresh state, keeping vehicle & driver
  const resetToFresh = useCallback(() => {
    setForm(prev => ({
      id: '',
      vehicleId: prev.vehicleId,
      date: new Date().toISOString().split('T')[0],
      billNumber: '',
      currentKM: '',
      maintenanceType: [],
      serviceType: '',
      garage: '',
      mechanic: '',
      driverId: prev.driverId,
      driverName: prev.driverName,
      nextServiceKM: '',
      remarks: '',
      createdAt: '',
    }));
    setParts([{ name: '', specification: '', quantity: 1, rate: 0, amount: 0 }]);
    resetDocuments();
  }, [resetDocuments]);

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;

    const newFiles = documents.filter((d) => d.file);
    const existing = documents.filter((d) => !d.file);

    // At least one document must remain after the save (create or edit).
    const remainingExisting = existing.filter((d) => !d.markedForRemoval).length;
    if (remainingExisting + newFiles.length === 0) {
      showNotification('Maintenance bill / spare-part document is required.', 'error');
      return;
    }

    const cleanedParts: PartItem[] = parts
      .filter(p => p.name.trim() !== '')
      .map(p => ({
        ...p,
        quantity: Number(p.quantity) || 0,
        rate: Number(p.rate) || 0,
        amount: Number(p.amount) || 0,
      }));

    const removeIds = existing.filter((d) => d.markedForRemoval && d.existingId != null).map((d) => d.existingId!);

    const formData = new FormData();
    formData.append('date', form.date);
    formData.append('vehicleId', form.vehicleId);
    if (form.driverId) formData.append('driverId', form.driverId);
    formData.append('currentKM', form.currentKM);
    if (form.nextServiceKM) formData.append('nextServiceKM', form.nextServiceKM);
    formData.append('maintenanceType', JSON.stringify(form.maintenanceType));
    formData.append('serviceType', form.serviceType);
    if (form.garage) formData.append('garage', form.garage);
    if (form.mechanic) formData.append('mechanic', form.mechanic);
    formData.append('parts', JSON.stringify(cleanedParts));
    if (form.remarks) formData.append('remarks', form.remarks);
    if (removeIds.length > 0) formData.append('removeDocumentIds', JSON.stringify(removeIds));
    for (const item of newFiles) {
      if (item.file) formData.append('documents', item.file, item.fileName);
    }

    try {
      let saved: any;
      if (form.id) {
        saved = await maintenanceApi.update(form.id, formData);
        showNotification('Maintenance record updated successfully!', 'success');
      } else {
        saved = await maintenanceApi.create(formData);
        showNotification('Maintenance record saved successfully!', 'success');
      }
      // Validate the response against the frontend mapper before refreshing.
      mapMaintenanceToEvent(saved);
      onSuccess();
      resetToFresh();
    } catch (err) {
      showNotification(handleApiError(err), 'error');
    }
  }, [form, parts, documents, validateForm, showNotification, onSuccess, resetToFresh]);

  const resetForm = useCallback(() => {
    setForm({
      id: '',
      vehicleId: '',
      date: new Date().toISOString().split('T')[0],
      billNumber: '',
      currentKM: '',
      maintenanceType: [],
      serviceType: '',
      garage: '',
      mechanic: '',
      driverId: '',
      driverName: '',
      nextServiceKM: '',
      remarks: '',
      createdAt: '',
    });
    setParts([{ name: '', specification: '', quantity: 1, rate: 0, amount: 0 }]);
    resetDocuments();
  }, [resetDocuments]);

  const setFormData = useCallback((data: Partial<typeof form>) => {
    setForm(prev => ({ ...prev, ...data }));
  }, []);

  const setPartsData = useCallback((newParts: PartItem[]) => {
    setParts(newParts);
  }, []);

  // Individual setters (same as before)
  const setVehicleId = useCallback((id: string) => setForm(prev => ({ ...prev, vehicleId: id })), []);
  const setDate = useCallback((date: string) => setForm(prev => ({ ...prev, date })), []);
  const setBillNumber = useCallback((bill: string) => setForm(prev => ({ ...prev, billNumber: bill })), []);
  const setCurrentKM = useCallback((km: string) => setForm(prev => ({ ...prev, currentKM: km })), []);
  const setMaintenanceType = useCallback((types: string[]) => setForm(prev => ({ ...prev, maintenanceType: types })), []);
  const setServiceType = useCallback((type: string) => setForm(prev => ({ ...prev, serviceType: type })), []);
  const setGarage = useCallback((garage: string) => setForm(prev => ({ ...prev, garage })), []);
  const setMechanic = useCallback((mech: string) => setForm(prev => ({ ...prev, mechanic: mech })), []);
  const setDriverId = useCallback((id: string, name?: string) =>
    setForm(prev => ({ ...prev, driverId: id, driverName: name || prev.driverName })), []);
  const setNextServiceKM = useCallback((km: string) => setForm(prev => ({ ...prev, nextServiceKM: km })), []);
  const setRemarks = useCallback((remarks: string) => setForm(prev => ({ ...prev, remarks })), []);
  const markDocumentRemoval = useCallback((key: string) => {
    setDocuments(prev => prev.map(d => d.key === key ? { ...d, markedForRemoval: true } : d));
  }, []);

  return {
    form,
    setFormData,
    parts,
    setPartsData,
    totalCost,
    handleSubmit,
    resetForm,
    setVehicleId,
    setDate,
    setBillNumber,
    setCurrentKM,
    setMaintenanceType,
    setServiceType,
    setGarage,
    setMechanic,
    setDriverId,
    setNextServiceKM,
    setRemarks,
    // documents
    documents,
    addDocumentFiles,
    removeDocument,
    markDocumentRemoval,
    setExistingDocuments,
    resetDocuments,
  };
};
