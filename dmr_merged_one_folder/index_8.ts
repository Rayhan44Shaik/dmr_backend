import { z } from 'zod';

// ---------- Enums / Static Lists ----------
export const MaintenanceTypeEnum = [
  'Engine Oil Change', 'Oil Filter Replacement', 'Air Filter Replacement',
  'Brake Service', 'Clutch Plate Replacement', 'Gear Oil Change',
  'Coolant Replacement', 'Battery Replacement', 'Suspension Repair',
  'General Service', 'AC Service', 'Electrical Repair', 'Engine Repair',
  'Tyre Rotation', 'Wheel Alignment', 'Wheel Balancing', 'Greasing',
  'Washing', 'Emergency Breakdown Repair', 'Other Maintenance'
] as const;
export type MaintenanceType = typeof MaintenanceTypeEnum[number];

export const DocumentTypeEnum = ['insurance', 'fitness', 'permit', 'puc', 'rc'] as const;
export type DocumentType = typeof DocumentTypeEnum[number];

export const DocumentStatusEnum = ['valid', 'expiring', 'expired'] as const;
export type DocumentStatus = typeof DocumentStatusEnum[number];

/** The five document types tracked by Fleet → Permits (backed by PostgreSQL). */
export const PermitDocumentTypeEnum = ['insurance', 'fitness', 'permit', 'puc', 'rc'] as const;
export type PermitDocumentType = typeof PermitDocumentTypeEnum[number];

export const FastagStatusEnum = ['good', 'low', 'critical'] as const;
export type FastagStatus = typeof FastagStatusEnum[number];

export const EMIStatusEnum = ['active', 'paid', 'overdue'] as const;
export type EMIStatus = typeof EMIStatusEnum[number];

// ---------- Schemas ----------
export const PartItemSchema = z.object({
  name: z.string().min(1, 'Part name required'),
  specification: z.string().optional(),
  quantity: z.number().int().positive(),
  rate: z.number().nonnegative(),
  amount: z.number().nonnegative(),
});

/** Bill / spare-part document attached to a maintenance entry (metadata only —
 * binary contents are served by the backend, never stored in the browser). */
export const MaintenanceDocumentSchema = z.object({
  id: z.number(),
  maintenanceId: z.number().optional(),
  fileName: z.string(),
  mimeType: z.string(),
  fileSize: z.number().optional(),
  createdAt: z.string().optional(),
});

export const MaintenanceEventSchema = z.object({
  id: z.string().optional(),
  vehicleId: z.string().min(1, 'Vehicle required'),
  /** Snapshot of the registered vehicle number taken from the Vehicle Master at
   * save time. Used as a fallback when the master row no longer exists. */
  vehicleNo: z.string().optional(),
  date: z.string().datetime(),
  billNumber: z.string().optional(),
  currentKM: z.number().nonnegative(),
  maintenanceType: z.string().min(1, 'Maintenance type required'),
  serviceType: z.string().min(1, 'Service type required'),
  garage: z.string().optional(),
  mechanic: z.string().optional(),
  nextServiceKM: z.number().nonnegative(),
  totalCost: z.number().nonnegative(),
  parts: z.array(PartItemSchema),
  remarks: z.string().optional(),
  createdAt: z.string().optional(),
  createdBy: z.string().optional(),
  updatedAt: z.string().optional(),
  approvedBy: z.string().optional(),
  approvedAt: z.string().optional(),
  driverId: z.string().optional(),
  driverName: z.string().optional(),
  deletedAt: z.string().datetime().optional(),
  // CHANGED: Replaced 'paid' with 'approved' to match the new UI logic
  paymentStatus: z.enum(['pending', 'approved']).default('pending').optional(),
  // Bill / spare-part documents attached to the maintenance entry (metadata only).
  documents: z.array(MaintenanceDocumentSchema).optional(),
});

/**
 * A vehicle permit / document expiry record from the backend (Fleet → Permits).
 * One current record per (vehicle, doc_type). The scan binary is served by the
 * backend; this DTO only carries metadata.
 */
export interface PermitDocument {
  id: number;
  vehicleId: number;
  vehicleNo: string;
  docType: PermitDocumentType;
  documentNumber: string;
  validFrom: string | null;
  /** YYYY-MM-DD */
  expiryDate: string;
  remarks: string | null;
  hasDocument: boolean;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  createdBy: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export const VehicleDocumentSchema = z.object({
  id: z.string().optional(),
  vehicleId: z.string().min(1),
  type: z.enum(DocumentTypeEnum),
  documentNumber: z.string().min(1),
  expiryDate: z.string().datetime(),
  status: z.enum(DocumentStatusEnum).default('valid'),
  uploadedFile: z.string().optional(),
});

export const FASTagSchema = z.object({
  id: z.string().optional(),
  vehicleId: z.string().min(1),
  tagNumber: z.string().min(1),
  provider: z.string().min(1),
  balance: z.number().nonnegative(),
  status: z.enum(FastagStatusEnum).default('good'),
});

export const FASTagTransactionSchema = z.object({
  id: z.string().optional(),
  fastagId: z.string().min(1),
  date: z.string().datetime(),
  plaza: z.string().min(1),
  amount: z.number().positive(),
});

export const EMIRecordSchema = z.object({
  id: z.string().optional(),
  vehicleId: z.string().min(1),
  financeCompany: z.string().min(1),
  loanAmount: z.number().positive(),
  emiAmount: z.number().positive(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  nextEMIDate: z.string().datetime(),
  status: z.enum(EMIStatusEnum).default('active'),
  paidEMIs: z.number().int().min(0).default(0),
  totalEMIs: z.number().int().positive(),
});

// ---------- Types ----------
export type PartItem = z.infer<typeof PartItemSchema>;
export type MaintenanceDocument = z.infer<typeof MaintenanceDocumentSchema>;
export type MaintenanceEvent = z.infer<typeof MaintenanceEventSchema>;
export type VehicleDocument = z.infer<typeof VehicleDocumentSchema>;
export type FASTag = z.infer<typeof FASTagSchema>;
export type FASTagTransaction = z.infer<typeof FASTagTransactionSchema>;
export type EMIRecord = z.infer<typeof EMIRecordSchema>;

// ---------- Fleet → EMI (matches GET/POST /api/fleet/emis) ----------
export type EmiStatus = 'active' | 'paid' | 'overdue';

export interface VehicleEmi {
  id: number;
  vehicleId: number;
  vehicleNo: string;
  financeCompany: string;
  loanAmount: number;
  emiAmount: number;
  startDate: string;
  endDate: string;
  nextEMIDate: string | null;
  status: EmiStatus;
  paidEMIs: number;
  pendingEMIs: number;
  totalEMIs: number;
  createdBy: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface VehicleEmiInstallment {
  id: number;
  vehicleEmiId: number;
  installmentNo: number;
  dueDate: string;
  amount: number;
  status: 'pending' | 'paid';
  paidAt: string | null;
}

export interface EmiCreateInput {
  vehicleId: number;
  financeCompany: string;
  loanAmount: number;
  totalEMIs: number;
  startDate: string;
  endDate?: string;
  emiAmount?: number;
}

export interface EmiUpdateInput {
  financeCompany?: string;
  loanAmount?: number;
  totalEMIs?: number;
  startDate?: string;
  endDate?: string;
  emiAmount?: number;
}

export interface EmiPayInput {
  paidBy?: string;
  idempotencyKey?: string;
  /** Used only to bind a stable retry key to the installment being paid. */
  paidEMIs?: number;
}

/** EMI payment status — restricted to the two meaningful states. */
export type EmiOverviewStatus = 'PENDING' | 'COMPLETED';

/**
 * Read-only EMI Management row. Derived from the Vehicle Master for vehicles
 * that have EMI information. EMI schedule and completion status are computed
 * automatically from due dates. The page never creates, edits or saves a vehicle.
 */
export interface EmiOverview {
  vehicleId: number;
  vehicleNo: string;
  vehicleNumber: string;
  purchaseAmount: number | null;
  totalEMIs: number | null;
  completedEMIs: number;
  pendingEMIs: number;
  emiDay: number | null;
  emiStartDate: string | null;
  status: EmiOverviewStatus;
}

/** Individual EMI installment for schedule detail view */
export interface EmiInstallment {
  installmentNo: number;
  dueDate: string; // YYYY-MM-DD
  amount: number | null;
  status: 'COMPLETED' | 'PENDING';
}

/** @deprecated Use VehicleEmi — kept for existing EMIRecordSchema consumers. */
export type EmiSchedule = VehicleEmi;

// ---------- Dashboard Types ----------
export interface FleetDashboardStats {
  totalVehicles: number;
  activeVehicles: number;
  fuelCostThisMonth: number;
  totalKMThisMonth: number;
  serviceDue: number;
  insuranceExpiring: number;
  fitnessExpiring: number;
  permitExpiring: number;
  fastagLowBalance: number;
  monthlyFuelTrend: { month: string; fuel: number }[];
  vehicleStatusDonut: { name: string; value: number }[];
  topMaintenanceCost: { vehicle: string; cost: number }[];
  kmToday: number;
  fuelToday: number;
  tollToday: number;
  documentsExpiring: number;
  avgFuelEfficiency: number;
}

// ---------- Fleet Overview Types ----------
// Derived fleet statuses follow the real backend contract:
// Inactive comes from the vehicle master record (Active/Inactive), On Trip
// from a current active trip, everything else is Available. There is no
// persisted "Maintenance" master state in the backend — service due is an
// alert/KPI, never a status.
export type FleetVehicleStatus = "On Trip" | "Available" | "Inactive";

export type FleetExpiryState = "expired" | "expiring" | "safe" | "none";

export interface FleetDocumentStatus {
  /** Expiry date in display form (dd MMM yyyy) when known. */
  expiry: string | null;
  state: FleetExpiryState;
}

export interface FleetVehicleOverview {
  id: number;
  vehicleNo: number;
  vehicleNumber: string;
  vehicleType: string;
  status: FleetVehicleStatus;
  driverName: string;
  currentTripNo: string;
  /** Latest known odometer reading from trip meters; null when unknown. */
  odometerKm: number | null;
  /** Fuel expense total for the current month. */
  fuelThisMonth: number;
  /** Most recent fuel entry. */
  lastFuel: { date: string; amount: number; litres: number } | null;
  maintenance: {
    lastServiceDate: string | null;
    nextServiceKm: number | null;
    serviceDue: boolean;
  };
  documents: {
    insurance: FleetDocumentStatus;
    permit: FleetDocumentStatus;
    fitness: FleetDocumentStatus;
  };
  emi: {
    financeCompany: string;
    emiAmount: number;
    nextDueDate: string;
    overdue: boolean;
  } | null;
  fastag: { provider: string; balance: number; lowBalance: boolean } | null;
}