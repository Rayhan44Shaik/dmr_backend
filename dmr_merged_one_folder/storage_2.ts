import { VehicleDocument, DocumentType } from '../types';

const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

export const FLEET_KEYS = {
  MAINTENANCE: 'dmr-vehicle-maintenance',
  DOCUMENTS: 'dmr-vehicle-documents',
  FASTAG: 'dmr-vehicle-fastag',
  FASTAG_TRANSACTIONS: 'dmr-vehicle-fastag-transactions',
  EMI: 'dmr-vehicle-emi',
  DELETED_MAINTENANCE: 'dmr-vehicle-maintenance-deleted',
} as const;

export const getData = <T>(key: string): T[] => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error(`[fleet-storage] Failed to read ${key}:`, error);
    return [];
  }
};

export const setData = <T>(key: string, data: T[]): boolean => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error(`[fleet-storage] Failed to write ${key}:`, error);
    return false;
  }
};

export const addRecord = <T extends { id?: string }>(key: string, record: T): T[] => {
  const existing = getData<T>(key);
  const newRecord = { ...record, id: record.id || generateId() };
  const updated = [...existing, newRecord];
  setData(key, updated);
  return updated;
};

export const updateRecord = <T extends { id: string }>(key: string, id: string, updates: Partial<T>): T[] => {
  const existing = getData<T>(key);
  const index = existing.findIndex(item => item.id === id);
  if (index === -1) return existing;
  const updated = [...existing];
  updated[index] = { ...updated[index], ...updates };
  setData(key, updated);
  return updated;
};

export const deleteRecord = <T extends { id: string }>(key: string, id: string): T[] => {
  const existing = getData<T>(key);
  const updated = existing.filter(item => item.id !== id);
  setData(key, updated);
  return updated;
};

export const getMaintenance = () => getData(FLEET_KEYS.MAINTENANCE);
export const getDocuments = (): VehicleDocument[] => getData(FLEET_KEYS.DOCUMENTS);
export const getFastags = () => getData(FLEET_KEYS.FASTAG);
export const getFastagTransactions = () => getData(FLEET_KEYS.FASTAG_TRANSACTIONS);
export const getEMIRecords = () => getData(FLEET_KEYS.EMI);

export const addMaintenance = (record: any) => addRecord(FLEET_KEYS.MAINTENANCE, record);
export const addDocument = (doc: VehicleDocument) => addRecord(FLEET_KEYS.DOCUMENTS, doc);
export const addFastag = (tag: any) => addRecord(FLEET_KEYS.FASTAG, tag);
export const addFastagTransaction = (tx: any) => addRecord(FLEET_KEYS.FASTAG_TRANSACTIONS, tx);
export const addEMIRecord = (emi: any) => addRecord(FLEET_KEYS.EMI, emi);

export const updateMaintenance = (id: string, updates: any) => updateRecord(FLEET_KEYS.MAINTENANCE, id, updates);
export const updateDocument = (id: string, updates: any) => updateRecord(FLEET_KEYS.DOCUMENTS, id, updates);
export const updateFastag = (id: string, updates: any) => updateRecord(FLEET_KEYS.FASTAG, id, updates);
export const updateEMIRecord = (id: string, updates: any) => updateRecord(FLEET_KEYS.EMI, id, updates);

export const deleteMaintenance = (id: string) => deleteRecord(FLEET_KEYS.MAINTENANCE, id);
export const deleteDocument = (id: string) => deleteRecord(FLEET_KEYS.DOCUMENTS, id);
export const deleteFastag = (id: string) => deleteRecord(FLEET_KEYS.FASTAG, id);
export const deleteEMIRecord = (id: string) => deleteRecord(FLEET_KEYS.EMI, id);

export const softDeleteMaintenance = (id: string): boolean => {
  const active = getMaintenance();
  const record = active.find((r: any) => r.id === id);
  if (!record) return false;
  const filtered = active.filter((r: any) => r.id !== id);
  setData(FLEET_KEYS.MAINTENANCE, filtered);
  const deleted = getDeletedMaintenance();
  deleted.push({ ...record, deletedAt: new Date().toISOString() });
  setData(FLEET_KEYS.DELETED_MAINTENANCE, deleted);
  return true;
};

export const getDeletedMaintenance = (): any[] => {
  return getData(FLEET_KEYS.DELETED_MAINTENANCE);
};

// Best-effort mirrors so the localStorage-backed dashboard/report/analytics
// hooks keep seeing records saved through the backend. The binary documents
// are NEVER stored here — only lightweight maintenance metadata.
export const mirrorMaintenance = (record: any): void => {
  const existing: any[] = getMaintenance();
  const idx = existing.findIndex((r: any) => String(r.id) === String(record.id));
  if (idx >= 0) existing[idx] = { ...existing[idx], ...record };
  else existing.unshift(record);
  setData(FLEET_KEYS.MAINTENANCE, existing);
};

// Update or create a document (excluding RC – we don't store RC in documents)
export const updateDocumentExpiry = (vehicleId: string, type: string, expiryDate: string): void => {
  if (type === 'rc') {
    console.warn('RC is not stored in documents; update vehicle.rcDate instead.');
    return;
  }
  const docs = getDocuments();
  const existing = docs.find((d) => d.vehicleId === vehicleId && d.type === type);
  if (existing) {
    existing.expiryDate = expiryDate;
    setData(FLEET_KEYS.DOCUMENTS, docs);
  } else {
    addDocument({
      id: generateId(),
      vehicleId,
      type: type as unknown as DocumentType,
      documentNumber: '',
      expiryDate,
      status: 'valid',
    });
  }
};