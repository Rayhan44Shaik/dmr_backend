/** Fleet module types (Fleet → Entry / History). */
import type { OpsRecordStatus } from "./operations.js";

/** A single line item on a vehicle maintenance bill. */
export interface FleetMaintenancePart {
  name: string;
  specification: string;
  quantity: number;
  rate: number;
  amount: number;
}

/** Frontend-compatible payment status derived from the ops status. */
export type MaintenancePaymentStatus = "pending" | "approved";

/** Lightweight metadata for a bill / spare-part document on a maintenance entry.
 * Binary contents are never returned by the history list — only this metadata. */
export interface FleetMaintenanceDocument {
  id: number;
  maintenanceId: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt?: string | null;
}

/**
 * A vehicle maintenance entry — the record captured by the Fleet → Entry form
 * and listed by Fleet → History. vehicleId references the existing Vehicle
 * Master (vehicles.id); driverId references the existing Employee/Staff master
 * (employees.id). No duplicate masters are created.
 */
export interface FleetMaintenance {
  id: number;
  billNo: string;
  date: string;
  vehicleId: number | null;
  vehicleNo: string | null;
  driverId: number | null;
  driverName: string | null;
  currentKM: number;
  nextServiceKM: number | null;
  /** Comma-separated string of maintenance types, matching the UI contract. */
  maintenanceType: string;
  serviceType: string;
  garage: string;
  mechanic: string;
  totalCost: number;
  parts: FleetMaintenancePart[];
  remarks: string | null;
  status: OpsRecordStatus;
  paymentStatus: MaintenancePaymentStatus;
  deleted: boolean;
  deletedReason: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  rejectedReason?: string | null;
  createdBy?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  /** Bill / spare-part documents attached to the maintenance entry (metadata only). */
  documents?: FleetMaintenanceDocument[];
}
