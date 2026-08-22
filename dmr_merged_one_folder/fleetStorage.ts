// Fleet storage keys
export const FLEET_KEYS = {
  MAINTENANCE: 'dmr-vehicle-maintenance',
  DOCUMENTS: 'dmr-vehicle-documents',
  FASTAG: 'dmr-vehicle-fastag',
  EMI: 'dmr-vehicle-emi',
  EXPENSES: 'dmr-vehicle-expenses',
} as const;

// Types
export interface MaintenanceEvent {
  id: string;
  vehicleId: string; // references dmr-vehicles
  date: string; // ISO
  currentKM: number;
  maintenanceType: string;
  serviceType: string;
  garage: string;
  mechanic: string;
  nextServiceKM: number;
  totalCost: number;
  parts: PartItem[];
  remarks: string;
}

export interface PartItem {
  name: string;
  specification: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface VehicleDocument {
  id: string;
  vehicleId: string;
  type: 'insurance' | 'fitness' | 'permit' | 'puc' | 'rc';
  documentNumber: string;
  expiryDate: string; // ISO
  status: 'valid' | 'expiring' | 'expired';
  uploadedFile?: string; // base64 or file name
}

export interface FASTag {
  id: string;
  vehicleId: string;
  tagNumber: string;
  provider: string;
  balance: number;
  status: 'good' | 'low' | 'critical';
}

export interface FASTagTransaction {
  id: string;
  fastagId: string;
  date: string;
  plaza: string;
  amount: number;
}

export interface EMIRecord {
  id: string;
  vehicleId: string;
  financeCompany: string;
  loanAmount: number;
  emiAmount: number;
  startDate: string;
  endDate: string;
  nextEMIDate: string;
  status: 'active' | 'paid' | 'overdue';
  paidEMIs: number;
  totalEMIs: number;
}

// Generic CRUD helpers (same pattern as existing masters)
export const getFleetData = <T>(key: string): T[] => {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : [];
};

export const setFleetData = <T>(key: string, data: T[]): void => {
  localStorage.setItem(key, JSON.stringify(data));
};

export const addFleetRecord = <T extends { id: string }>(key: string, record: T): T[] => {
  const existing = getFleetData<T>(key);
  const updated = [...existing, record];
  setFleetData(key, updated);
  return updated;
};

export const updateFleetRecord = <T extends { id: string }>(key: string, id: string, updates: Partial<T>): T[] => {
  const existing = getFleetData<T>(key);
  const updated = existing.map(item => item.id === id ? { ...item, ...updates } : item);
  setFleetData(key, updated);
  return updated;
};

export const deleteFleetRecord = <T extends { id: string }>(key: string, id: string): T[] => {
  const existing = getFleetData<T>(key);
  const updated = existing.filter(item => item.id !== id);
  setFleetData(key, updated);
  return updated;
};