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
/** The five document types tracked by Fleet → Permits. */
export declare const PERMIT_DOC_TYPES: readonly ["insurance", "fitness", "permit", "puc", "rc"];
export type PermitDocType = (typeof PERMIT_DOC_TYPES)[number];
/**
 * A vehicle EMI record (Fleet → EMI). One current record per vehicle — the
 * EMI page is a per-vehicle summary table that joins the Vehicle Master for
 * the registration number. vehicleId references vehicles.id; the vehicle
 * number shown in the EMI table is always resolved from the master.
 *
 * The schedule lives in vehicle_emi_installments and is the single source of
 * truth for paid/pending/next/status. loanAmount + totalEMIs + startDate are
 * the authoritative inputs; the frontend sees exactly the same derived fields
 * (emiAmount / endDate / paidEMIs / pendingEMIs / nextEMIDate / status) it
 * already displays, so no client-side recalculation is needed.
 */
export type EMIStatus = "active" | "paid" | "overdue";
export interface VehicleEMI {
    id: number;
    vehicleId: number;
    /** Registration number resolved from the Vehicle Master (e.g. "AP 39 AB 1234"). */
    vehicleNo: string;
    financeCompany: string;
    loanAmount: number;
    emiAmount: number;
    startDate: string;
    endDate: string;
    nextEMIDate: string | null;
    status: EMIStatus;
    /** Number of installments marked paid. */
    paidEMIs: number;
    /** totalEMIs - paidEMIs, provided so the EMI table's "Pending EMIs" column
     * never reimplements the derivation. */
    pendingEMIs: number;
    totalEMIs: number;
    createdBy: string;
    createdAt: string | null;
    updatedAt: string | null;
}
/**
 * A read-only EMI row for the EMI Management page.
 *
 * Unlike VehicleEMI (which represents an EMI record that exists in
 * vehicle_emis), EmiOverview is derived FROM the Vehicle Master for EVERY
 * Active vehicle. Vehicle facts (vehicle number, purchase amount, purchase
 * date, total EMI, EMI day) come straight from `vehicles`; the completed /
 * payment state comes from the existing EMI payment schedule (vehicle_emis +
 * vehicle_emi_installments) when one exists. The page never creates, edits or
 * saves a separate vehicle — this DTO only reads the authoritative master and
 * joins the payment history onto it.
 *
 * Status is intentionally restricted to the two meaningful EMI states:
 *   'pending'   -> completedEMIs < totalEMIs
 *   'completed' -> completedEMIs >= totalEMIs (nothing left to pay)
 * Vehicle Active/Inactive is a separate Vehicle Master concern; this page only
 * ever sees Active vehicles.
 */
export type EmiOverviewStatus = "pending" | "completed";
export interface EmiOverview {
    /** vehicles.id — always present (every Active vehicle is listed). */
    vehicleId: number;
    /** Registration number resolved from the Vehicle Master. */
    vehicleNo: string;
    /** Finance company from the EMI record if one exists, otherwise ''. */
    financeCompany: string;
    /** Purchase amount from the Vehicle Master. */
    purchaseAmount: number;
    /** Purchase date from the Vehicle Master (fallback: EMI start date). */
    purchaseDate: string | null;
    /** EMI due day of the month from the Vehicle Master. */
    emiDay: number | null;
    /** Total EMI months from the Vehicle Master (fallback: EMI record tenure). */
    totalEMIs: number;
    /** Number of installments actually paid (from the payment schedule). */
    completedEMIs: number;
    /** totalEMIs - completedEMIs, never negative. */
    pendingEMIs: number;
    /**
     * Next unpaid EMI date. When a payment schedule exists this is the earliest
     * pending installment (MIN due_date WHERE status='pending'); otherwise it is
     * the next occurrence of the vehicle's EMI day. Null when completed.
     */
    emiDate: string | null;
    /** 'pending' | 'completed' only. */
    status: EmiOverviewStatus;
    /** Monthly EMI installment amount (from the EMI record, else derived). */
    monthlyEmi: number;
    /** vehicle_emis.id when a payment schedule exists, else null. */
    emiRecordId: number | null;
    /** EMI schedule start date (from the EMI record, else vehicle master). */
    startDate: string | null;
    /** EMI schedule end date (from the EMI record when present). */
    endDate: string | null;
}
/** One persisted installment of a vehicle EMI schedule. */
export interface VehicleEMIInstallment {
    id: number;
    vehicleEmiId: number;
    installmentNo: number;
    dueDate: string;
    amount: number;
    status: "pending" | "paid";
    paidAt: string | null;
}
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
/**
 * A vehicle permit / document expiry record (Fleet → Permits). One current row
 * per (vehicle_id, doc_type). The optional scan is stored as BYTEA on the
 * backend — this DTO only carries metadata; hasDocument + fileName tell the UI
 * whether a scan exists and how to fetch it.
 */
export interface VehiclePermitDocument {
    id: number;
    vehicleId: number;
    /** Snapshot of the registered vehicle number, resolved from the Vehicle Master. */
    vehicleNo: string;
    docType: PermitDocType;
    documentNumber: string;
    validFrom: string | null;
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
