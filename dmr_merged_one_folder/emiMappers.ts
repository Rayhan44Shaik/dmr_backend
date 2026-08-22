import type { EmiStatus, VehicleEmi, VehicleEmiInstallment } from '../types';

function requireNumber(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`EMI response is missing a valid ${field}.`);
  }
  return n;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`EMI response is missing ${field}.`);
  }
  return value;
}

function optionalString(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') {
    throw new Error('EMI response has an invalid date/string field.');
  }
  return value;
}

function mapStatus(value: unknown): EmiStatus {
  if (value === 'active' || value === 'paid' || value === 'overdue') return value;
  throw new Error(`EMI response has an unsupported status: ${String(value)}`);
}

function mapInstallmentStatus(value: unknown): 'pending' | 'paid' {
  if (value === 'pending' || value === 'paid') return value;
  throw new Error(`EMI installment has an unsupported status: ${String(value)}`);
}

/** Map the backend VehicleEMI DTO onto the frontend VehicleEmi model. */
export function mapEmiResponse(raw: unknown): VehicleEmi {
  if (!raw || typeof raw !== 'object') {
    throw new Error('EMI response is empty.');
  }
  const row = raw as Record<string, unknown>;
  return {
    id: requireNumber(row.id, 'id'),
    vehicleId: requireNumber(row.vehicleId, 'vehicleId'),
    vehicleNo: requireString(row.vehicleNo, 'vehicleNo'),
    financeCompany: requireString(row.financeCompany, 'financeCompany'),
    loanAmount: requireNumber(row.loanAmount, 'loanAmount'),
    emiAmount: requireNumber(row.emiAmount, 'emiAmount'),
    startDate: requireString(row.startDate, 'startDate'),
    endDate: requireString(row.endDate, 'endDate'),
    nextEMIDate: optionalString(row.nextEMIDate),
    status: mapStatus(row.status),
    paidEMIs: requireNumber(row.paidEMIs, 'paidEMIs'),
    pendingEMIs: requireNumber(row.pendingEMIs, 'pendingEMIs'),
    totalEMIs: requireNumber(row.totalEMIs, 'totalEMIs'),
    createdBy: typeof row.createdBy === 'string' ? row.createdBy : '',
    createdAt: optionalString(row.createdAt),
    updatedAt: optionalString(row.updatedAt),
  };
}

export function mapEmiListResponse(raw: unknown): VehicleEmi[] {
  if (!Array.isArray(raw)) {
    throw new Error('EMI list response must be an array.');
  }
  return raw.map(mapEmiResponse);
}

export function mapEmiInstallment(raw: unknown): VehicleEmiInstallment {
  if (!raw || typeof raw !== 'object') {
    throw new Error('EMI installment response is empty.');
  }
  const row = raw as Record<string, unknown>;
  return {
    id: requireNumber(row.id, 'id'),
    vehicleEmiId: requireNumber(row.vehicleEmiId, 'vehicleEmiId'),
    installmentNo: requireNumber(row.installmentNo, 'installmentNo'),
    dueDate: requireString(row.dueDate, 'dueDate'),
    amount: requireNumber(row.amount, 'amount'),
    status: mapInstallmentStatus(row.status),
    paidAt: optionalString(row.paidAt),
  };
}

export function mapEmiScheduleResponse(raw: unknown): VehicleEmiInstallment[] {
  if (!Array.isArray(raw)) {
    throw new Error('EMI schedule response must be an array.');
  }
  return raw.map(mapEmiInstallment);
}