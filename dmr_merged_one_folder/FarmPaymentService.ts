// D:\Development\DMR-Poultries-ERP\frontend\dmr-poultries-web\src\modules\accounts\services\FarmPaymentService.ts

import type { FarmPayment } from '../types/farmPayment.types';

const STORAGE_KEY = 'farm_payments';

class FarmPaymentServiceClass {
  private payments: FarmPayment[] = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        this.payments = JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load farm payments from storage:', error);
      this.payments = [];
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.payments));
    } catch (error) {
      console.error('Failed to save farm payments to storage:', error);
    }
  }

  getAll(): FarmPayment[] {
    return [...this.payments];
  }

  getByTripId(tripId: string | number): FarmPayment | undefined {
    return this.payments.find(p => p.tripId === String(tripId));
  }

  getPaymentById(id: string): FarmPayment | undefined {
    return this.payments.find(p => p.id === id);
  }

  createPayment(payment: FarmPayment): FarmPayment {
    const newPayment: FarmPayment = {
      ...payment,
      id: this.generateId(),
      createdAt: payment.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.payments.push(newPayment);
    this.saveToStorage();
    return newPayment;
  }

  updatePayment(tripId: string | number, updates: Partial<FarmPayment>): FarmPayment | undefined {
    const index = this.payments.findIndex(
      p => p.tripId === String(tripId)
    );

    if (index === -1) return undefined;

    const updatedPayment: FarmPayment = {
      ...this.payments[index],
      ...updates,
      id: this.payments[index].id,
      tripId: this.payments[index].tripId,
      updatedAt: new Date().toISOString(),
    };

    this.payments[index] = updatedPayment;
    this.saveToStorage();
    return updatedPayment;
  }

  deletePayment(tripId: string | number): boolean {
    const initialLength = this.payments.length;
    this.payments = this.payments.filter(
      p => p.tripId !== String(tripId)
    );
    
    if (this.payments.length !== initialLength) {
      this.saveToStorage();
      return true;
    }
    return false;
  }

  getPaymentsByStatus(status: FarmPayment['paymentStatus']): FarmPayment[] {
    return this.payments.filter(p => p.paymentStatus === status);
  }

  getTotalPaidAmount(): number {
    return this.payments.reduce((total, p) => total + (p.amountPaid || 0), 0);
  }

  getTotalPendingAmount(): number {
    return this.payments.reduce((total, p) => {
      const totalAmount = p.totalAmount || 0;
      const paidAmount = p.amountPaid || 0;
      return total + (totalAmount - paidAmount);
    }, 0);
  }

  clear(): void {
    this.payments = [];
    this.saveToStorage();
  }

  private generateId(): string {
    return 'fp_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
  }
}

export const FarmPaymentService = new FarmPaymentServiceClass();