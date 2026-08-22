// src/modules/accounts/payment-book/PaymentService.ts

import type { Payment, PaymentAttachment, PaymentAudit } from '../types/payment.types';

const PAYMENTS_KEY = 'dmr-payments';
const ATTACHMENTS_KEY = 'dmr-payment-attachments';
const AUDIT_KEY = 'dmr-payment-audit';

// ----- helpers -----
function loadData<T>(key: string): T[] {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : [];
}

function saveData<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

function getNextPaymentNo(): string {
  const payments = loadData<Payment>(PAYMENTS_KEY);
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const existing = payments.filter((p) => p.paymentNo.startsWith(`PAY-${today}`));
  const count = existing.length + 1;
  return `PAY-${today}-${String(count).padStart(3, '0')}`;
}

// ----- main service -----
export const PaymentService = {
  // get all payments (optionally with filters)
  getPayments(filters?: {
    dateFrom?: string;
    dateTo?: string;
    paymentType?: string;
    paymentMode?: string;
    category?: string;
    status?: string;
    search?: string;
  }): Payment[] {
    let payments = loadData<Payment>(PAYMENTS_KEY);

    if (filters) {
      if (filters.dateFrom) {
        payments = payments.filter((p) => p.paymentDate >= filters.dateFrom!);
      }
      if (filters.dateTo) {
        payments = payments.filter((p) => p.paymentDate <= filters.dateTo!);
      }
      if (filters.paymentType) {
        payments = payments.filter((p) => p.paymentType === filters.paymentType);
      }
      if (filters.paymentMode) {
        payments = payments.filter((p) => p.paymentMode === filters.paymentMode);
      }
      if (filters.category) {
        payments = payments.filter((p) => p.category === filters.category);
      }
      if (filters.status) {
        payments = payments.filter((p) => p.status === filters.status);
      }
      if (filters.search) {
        const s = filters.search.toLowerCase();
        payments = payments.filter(
          (p) =>
            p.paymentNo.toLowerCase().includes(s) ||
            p.paidTo.toLowerCase().includes(s) ||
            p.referenceNo.toLowerCase().includes(s) ||
            p.remarks?.toLowerCase().includes(s) ||
            p.amount.toString().includes(s)
        );
      }
    }

    // sort by paymentDate descending, then by paymentNo descending
    return payments.sort((a, b) => {
      if (a.paymentDate !== b.paymentDate) return b.paymentDate.localeCompare(a.paymentDate);
      return b.paymentNo.localeCompare(a.paymentNo);
    });
  },

  getPaymentById(id: string): Payment | null {
    const payments = loadData<Payment>(PAYMENTS_KEY);
    return payments.find((p) => p.id === id) || null;
  },

  // ---- NEW: Get payments for a specific week (Monday to Sunday) ----
  getPaymentsForWeek(weekStart: Date): Payment[] {
    const start = new Date(weekStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    // Get all payments (already sorted) and filter by date
    const all = this.getPayments();
    return all.filter((p) => {
      const d = new Date(p.paymentDate);
      return d >= start && d <= end;
    });
  },

  createPayment(data: Omit<Payment, 'id' | 'paymentNo' | 'createdAt' | 'updatedAt' | 'attachments'>): Payment {
    const now = new Date().toISOString();
    const newPayment: Payment = {
      ...data,
      id: generateId(),
      paymentNo: getNextPaymentNo(),
      createdAt: now,
      updatedAt: now,
      attachments: [],
    };
    const payments = loadData<Payment>(PAYMENTS_KEY);
    payments.push(newPayment);
    saveData(PAYMENTS_KEY, payments);

    // audit log
    this.addAudit({
      paymentId: newPayment.id,
      action: 'CREATE',
      oldValue: '',
      newValue: JSON.stringify(newPayment),
      performedBy: data.createdBy || 'system',
      performedAt: now,
    });

    return newPayment;
  },

  updatePayment(id: string, data: Partial<Payment>): Payment | null {
    const payments = loadData<Payment>(PAYMENTS_KEY);
    const index = payments.findIndex((p) => p.id === id);
    if (index === -1) return null;

    const oldPayment = { ...payments[index] };
    const updated = { ...oldPayment, ...data, updatedAt: new Date().toISOString() };
    payments[index] = updated;
    saveData(PAYMENTS_KEY, payments);

    this.addAudit({
      paymentId: id,
      action: 'UPDATE',
      oldValue: JSON.stringify(oldPayment),
      newValue: JSON.stringify(updated),
      performedBy: data.createdBy || 'system',
      performedAt: new Date().toISOString(),
    });

    return updated;
  },

  deletePayment(id: string): boolean {
    let payments = loadData<Payment>(PAYMENTS_KEY);
    const found = payments.find((p) => p.id === id);
    if (!found) return false;
    payments = payments.filter((p) => p.id !== id);
    saveData(PAYMENTS_KEY, payments);

    this.addAudit({
      paymentId: id,
      action: 'DELETE',
      oldValue: JSON.stringify(found),
      newValue: '',
      performedBy: 'system',
      performedAt: new Date().toISOString(),
    });

    // remove attachments
    const attachments = loadData<PaymentAttachment>(ATTACHMENTS_KEY);
    saveData(
      ATTACHMENTS_KEY,
      attachments.filter((a) => a.paymentId !== id)
    );

    return true;
  },

  // ----- attachments -----
  addAttachment(attachment: Omit<PaymentAttachment, 'id'>): PaymentAttachment {
    const newAtt = { ...attachment, id: generateId() };
    const attachments = loadData<PaymentAttachment>(ATTACHMENTS_KEY);
    attachments.push(newAtt);
    saveData(ATTACHMENTS_KEY, attachments);
    return newAtt;
  },

  getAttachments(paymentId: string): PaymentAttachment[] {
    return loadData<PaymentAttachment>(ATTACHMENTS_KEY).filter((a) => a.paymentId === paymentId);
  },

  // ----- audit -----
  addAudit(audit: Omit<PaymentAudit, 'id'>): PaymentAudit {
    const newAudit = { ...audit, id: generateId() };
    const audits = loadData<PaymentAudit>(AUDIT_KEY);
    audits.push(newAudit);
    saveData(AUDIT_KEY, audits);
    return newAudit;
  },

  getAudit(paymentId: string): PaymentAudit[] {
    return loadData<PaymentAudit>(AUDIT_KEY).filter((a) => a.paymentId === paymentId);
  },

  // ----- seed demo data -----
  seedPayments(): void {
    const existing = loadData<Payment>(PAYMENTS_KEY);
    if (existing.length > 0) return;

    const samplePayments: Omit<Payment, 'id' | 'paymentNo' | 'createdAt' | 'updatedAt' | 'attachments'>[] = [
      {
        paymentDate: '2026-07-20',
        paymentType: 'Farmer Payment',
        paymentMode: 'Bank Transfer',
        paidTo: 'ABC Poultry Farm',
        amount: 235000,
        referenceNo: 'Trip #145',
        category: 'Farmer',
        remarks: 'Weekly settlement',
        status: 'Approved',
        createdBy: 'admin',
      },
      {
        paymentDate: '2026-07-20',
        paymentType: 'Fuel Payment',
        paymentMode: 'Cash',
        paidTo: 'Indian Oil Petrol Pump',
        amount: 8200,
        referenceNo: 'Fuel Bill #215',
        category: 'Fuel',
        remarks: 'Diesel - 120 Ltrs',
        status: 'Approved',
        createdBy: 'admin',
      },
      {
        paymentDate: '2026-07-20',
        paymentType: 'Vehicle Maintenance',
        paymentMode: 'Bank Transfer',
        paidTo: 'Sri Motors Garage',
        amount: 15000,
        referenceNo: 'INV-2026-215',
        category: 'Maintenance',
        remarks: 'Service & Parts',
        status: 'Approved',
        createdBy: 'admin',
      },
      {
        paymentDate: '2026-07-20',
        paymentType: 'Salary Payment',
        paymentMode: 'Bank Transfer',
        paidTo: 'Ravi Kumar (Driver)',
        amount: 18000,
        referenceNo: 'July Salary',
        category: 'Salary',
        remarks: 'Driver Salary',
        status: 'Paid',
        createdBy: 'admin',
      },
      {
        paymentDate: '2026-07-19',
        paymentType: 'EMI Payment',
        paymentMode: 'Bank Transfer',
        paidTo: 'HDFC Bank',
        amount: 35000,
        referenceNo: 'EMI-07-2026',
        category: 'Loan',
        remarks: 'Vehicle Loan EMI',
        status: 'Approved',
        createdBy: 'admin',
      },
      {
        paymentDate: '2026-07-19',
        paymentType: 'FASTag Recharge',
        paymentMode: 'UPI',
        paidTo: 'NHAI',
        amount: 5000,
        referenceNo: 'FASTAG-215',
        category: 'Other',
        remarks: 'TN04 AB 1234',
        status: 'Approved',
        createdBy: 'admin',
      },
      {
        paymentDate: '2026-07-19',
        paymentType: 'Office Expense',
        paymentMode: 'Cash',
        paidTo: 'Sundaram Stationery',
        amount: 1250,
        referenceNo: 'EXP-120',
        category: 'Office',
        remarks: 'Office Stationery',
        status: 'Approved',
        createdBy: 'admin',
      },
      {
        paymentDate: '2026-07-18',
        paymentType: 'Tax Payment',
        paymentMode: 'Bank Transfer',
        paidTo: 'Government (GST)',
        amount: 12000,
        referenceNo: 'GST-07-2026',
        category: 'Tax',
        remarks: 'Monthly GST',
        status: 'Approved',
        createdBy: 'admin',
      },
      {
        paymentDate: '2026-07-18',
        paymentType: 'Other Expense',
        paymentMode: 'Cash',
        paidTo: 'Miscellaneous',
        amount: 2000,
        referenceNo: 'OTH-018',
        category: 'Other',
        remarks: 'Other Expenses',
        status: 'Draft',
        createdBy: 'admin',
      },
    ];

    samplePayments.forEach((p) => {
      this.createPayment(p);
    });
  },

  // ----- KPI calculations -----
  getKPIs(filters?: { dateFrom?: string; dateTo?: string }): {
    totalPayments: number;
    cashPayments: number;
    bankPayments: number;
    totalTransactions: number;
    averagePayment: number;
  } {
    const payments = this.getPayments(filters);
    const total = payments.reduce((sum, p) => sum + p.amount, 0);
    const cash = payments
      .filter((p) => p.paymentMode === 'Cash')
      .reduce((sum, p) => sum + p.amount, 0);
    const bank = payments
      .filter((p) => ['Bank Transfer', 'NEFT', 'RTGS', 'UPI', 'IMPS'].includes(p.paymentMode))
      .reduce((sum, p) => sum + p.amount, 0);
    const count = payments.length;
    return {
      totalPayments: total,
      cashPayments: cash,
      bankPayments: bank,
      totalTransactions: count,
      averagePayment: count > 0 ? Math.round(total / count) : 0,
    };
  },
};