import { MaintenanceTypeEnum, DocumentTypeEnum, FastagStatusEnum, EMIStatusEnum } from '../types';

export const MAINTENANCE_TYPES = [...MaintenanceTypeEnum] as string[];
export const DOCUMENT_TYPES = [...DocumentTypeEnum] as string[];

export const DOCUMENT_LABELS: Record<string, string> = {
  insurance: 'Insurance',
  fitness: 'Fitness',
  permit: 'Permit',
  puc: 'PUC',
  rc: 'RC',
};

export const DOCUMENT_TYPE_ORDER = ['rc', 'insurance', 'fitness', 'permit', 'puc'] as const;
export type DocumentType = typeof DOCUMENT_TYPE_ORDER[number];

export const FASTAG_STATUSES = [...FastagStatusEnum] as string[];
export const FASTAG_STATUS_LABELS: Record<string, string> = {
  good: 'Good',
  low: 'Low Balance',
  critical: 'Critical',
};

export const EMI_STATUSES = [...EMIStatusEnum] as string[];
export const EMI_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  paid: 'Paid',
  overdue: 'Overdue',
};

export const DEFAULT_PAGE_SIZE = 15;
export const DATE_FORMAT = 'yyyy-MM-dd';
export const DATE_DISPLAY_FORMAT = 'dd/MM/yyyy';
export const DATE_TIME_DISPLAY_FORMAT = 'dd/MM/yyyy HH:mm';

export const FLEET_STORAGE_KEYS = {
  MAINTENANCE: 'dmr-vehicle-maintenance',
  DOCUMENTS: 'dmr-vehicle-documents',
  FASTAG: 'dmr-vehicle-fastag',
  FASTAG_TRANSACTIONS: 'dmr-vehicle-fastag-transactions',
  EMI: 'dmr-vehicle-emi',
} as const;