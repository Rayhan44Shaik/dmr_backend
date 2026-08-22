import { v4 as uuidv4 } from 'uuid';
import { validate } from './validation';
import {
  type CashBookEntry,
  type BankBookEntry,
  type FarmerPurchase,
  type FarmerPayment,
  type VehicleLoan,
  type EMIPayment,
  type OtherExpense,
  CashBookEntrySchema,
  BankBookEntrySchema,
  FarmerPurchaseSchema,
  FarmerPaymentSchema,
  VehicleLoanSchema,
  EMIPaymentSchema,
  OtherExpenseSchema,
} from '../types';

// ---------- Generic safe helpers ----------
function safeGet<T>(key: string, fallback: T[] = []): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    console.error(`[Storage] Error reading ${key}`);
    return fallback;
  }
}

function safeSet<T>(key: string, data: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    console.error(`[Storage] Error writing ${key}`);
  }
}

// ---------- Storage Keys ----------
const CASH_BOOK_KEY = 'dmr-cash-book';
const BANK_BOOK_KEY = 'dmr-bank-book';
const FARMER_PURCHASES_KEY = 'dmr-farmer-purchases';
const FARMER_PAYMENTS_KEY = 'dmr-farmer-payments';
const VEHICLE_LOANS_KEY = 'dmr-vehicle-loans';
const EMI_PAYMENTS_KEY = 'dmr-emi-payments';
const OTHER_EXPENSES_KEY = 'dmr-other-expenses';

// ---------- Cash Book ----------
export function getCashBook(): CashBookEntry[] {
  return safeGet<CashBookEntry>(CASH_BOOK_KEY);
}

export function addCashEntry(entry: Omit<CashBookEntry, 'id'>): CashBookEntry | null {
  try {
    const validated = validate(CashBookEntrySchema.omit({ id: true }), entry);
    const entries = getCashBook();
    const newEntry = { ...validated, id: uuidv4() };
    entries.push(newEntry);
    safeSet(CASH_BOOK_KEY, entries);
    return newEntry;
  } catch {
    return null;
  }
}

export function updateCashEntry(id: string, updates: Partial<CashBookEntry>): boolean {
  try {
    const entries = getCashBook();
    const idx = entries.findIndex(e => e.id === id);
    if (idx === -1) return false;
    const updated = { ...entries[idx], ...updates };
    validate(CashBookEntrySchema, updated);
    entries[idx] = updated;
    safeSet(CASH_BOOK_KEY, entries);
    return true;
  } catch {
    return false;
  }
}

export function deleteCashEntry(id: string): boolean {
  try {
    const entries = getCashBook().filter(e => e.id !== id);
    safeSet(CASH_BOOK_KEY, entries);
    return true;
  } catch {
    return false;
  }
}

// ---------- Bank Book ----------
export function getBankBook(): BankBookEntry[] {
  return safeGet<BankBookEntry>(BANK_BOOK_KEY);
}

export function addBankEntry(entry: Omit<BankBookEntry, 'id'>): BankBookEntry | null {
  try {
    const validated = validate(BankBookEntrySchema.omit({ id: true }), entry);
    const entries = getBankBook();
    const newEntry = { ...validated, id: uuidv4() };
    entries.push(newEntry);
    safeSet(BANK_BOOK_KEY, entries);
    return newEntry;
  } catch {
    return null;
  }
}

export function updateBankEntry(id: string, updates: Partial<BankBookEntry>): boolean {
  try {
    const entries = getBankBook();
    const idx = entries.findIndex(e => e.id === id);
    if (idx === -1) return false;
    const updated = { ...entries[idx], ...updates };
    validate(BankBookEntrySchema, updated);
    entries[idx] = updated;
    safeSet(BANK_BOOK_KEY, entries);
    return true;
  } catch {
    return false;
  }
}

export function deleteBankEntry(id: string): boolean {
  try {
    const entries = getBankBook().filter(e => e.id !== id);
    safeSet(BANK_BOOK_KEY, entries);
    return true;
  } catch {
    return false;
  }
}

// ---------- Farmer Purchases ----------
export function getFarmerPurchases(): FarmerPurchase[] {
  return safeGet<FarmerPurchase>(FARMER_PURCHASES_KEY);
}

export function addFarmerPurchase(
  purchase: Omit<FarmerPurchase, 'id' | 'paidAmount' | 'status'>
): FarmerPurchase | null {
  try {
    const validated = validate(FarmerPurchaseSchema.omit({ id: true, paidAmount: true, status: true }), purchase);
    const purchases = getFarmerPurchases();
    const newPurchase: FarmerPurchase = {
      ...validated,
      id: uuidv4(),
      paidAmount: 0,
      status: 'Pending',
    };
    purchases.push(newPurchase);
    safeSet(FARMER_PURCHASES_KEY, purchases);
    return newPurchase;
  } catch {
    return null;
  }
}

export function updateFarmerPurchase(id: string, updates: Partial<FarmerPurchase>): boolean {
  try {
    const purchases = getFarmerPurchases();
    const idx = purchases.findIndex(p => p.id === id);
    if (idx === -1) return false;
    const updated = { ...purchases[idx], ...updates };
    validate(FarmerPurchaseSchema, updated);
    purchases[idx] = updated;
    safeSet(FARMER_PURCHASES_KEY, purchases);
    return true;
  } catch {
    return false;
  }
}

export function deleteFarmerPurchase(id: string): boolean {
  try {
    const purchases = getFarmerPurchases().filter(p => p.id !== id);
    safeSet(FARMER_PURCHASES_KEY, purchases);
    return true;
  } catch {
    return false;
  }
}

// ---------- Farmer Payments ----------
export function getFarmerPayments(): FarmerPayment[] {
  return safeGet<FarmerPayment>(FARMER_PAYMENTS_KEY);
}

export function addFarmerPayment(payment: Omit<FarmerPayment, 'id'>): FarmerPayment | null {
  try {
    const validated = validate(FarmerPaymentSchema.omit({ id: true }), payment);
    const payments = getFarmerPayments();
    const newPayment = { ...validated, id: uuidv4() };
    payments.push(newPayment);
    safeSet(FARMER_PAYMENTS_KEY, payments);

    // Recalculate purchase paidAmount and status
    const purchases = getFarmerPurchases();
    const purchase = purchases.find(p => p.id === payment.purchaseId);
    if (purchase) {
      const totalPaid = payments.filter(p => p.purchaseId === payment.purchaseId).reduce((sum, p) => sum + p.amount, 0);
      purchase.paidAmount = totalPaid;
      purchase.status = totalPaid >= purchase.amount ? 'Paid' : totalPaid > 0 ? 'Partial' : 'Pending';
      safeSet(FARMER_PURCHASES_KEY, purchases);
    }
    return newPayment;
  } catch {
    return null;
  }
}

export function updateFarmerPayment(id: string, updates: Partial<FarmerPayment>): boolean {
  try {
    const payments = getFarmerPayments();
    const idx = payments.findIndex(p => p.id === id);
    if (idx === -1) return false;
    const updated = { ...payments[idx], ...updates };
    validate(FarmerPaymentSchema, updated);
    payments[idx] = updated;
    safeSet(FARMER_PAYMENTS_KEY, payments);
    return true;
  } catch {
    return false;
  }
}

export function deleteFarmerPayment(id: string): boolean {
  try {
    const payments = getFarmerPayments().filter(p => p.id !== id);
    safeSet(FARMER_PAYMENTS_KEY, payments);
    return true;
  } catch {
    return false;
  }
}

// ---------- Vehicle Loans ----------
export function getVehicleLoans(): VehicleLoan[] {
  return safeGet<VehicleLoan>(VEHICLE_LOANS_KEY);
}

export function addVehicleLoan(loan: Omit<VehicleLoan, 'id'>): VehicleLoan | null {
  try {
    const validated = validate(VehicleLoanSchema.omit({ id: true }), loan);
    const loans = getVehicleLoans();
    const newLoan = { ...validated, id: uuidv4() };
    loans.push(newLoan);
    safeSet(VEHICLE_LOANS_KEY, loans);
    return newLoan;
  } catch {
    return null;
  }
}

export function updateVehicleLoan(id: string, updates: Partial<VehicleLoan>): boolean {
  try {
    const loans = getVehicleLoans();
    const idx = loans.findIndex(l => l.id === id);
    if (idx === -1) return false;
    const updated = { ...loans[idx], ...updates };
    validate(VehicleLoanSchema, updated);
    loans[idx] = updated;
    safeSet(VEHICLE_LOANS_KEY, loans);
    return true;
  } catch {
    return false;
  }
}

export function deleteVehicleLoan(id: string): boolean {
  try {
    const loans = getVehicleLoans().filter(l => l.id !== id);
    safeSet(VEHICLE_LOANS_KEY, loans);
    return true;
  } catch {
    return false;
  }
}

// ---------- EMI Payments ----------
export function getEMIPayments(): EMIPayment[] {
  return safeGet<EMIPayment>(EMI_PAYMENTS_KEY);
}

export function addEMIPayment(payment: Omit<EMIPayment, 'id'>): EMIPayment | null {
  try {
    const validated = validate(EMIPaymentSchema.omit({ id: true }), payment);
    const payments = getEMIPayments();
    const newPayment = { ...validated, id: uuidv4() };
    payments.push(newPayment);
    safeSet(EMI_PAYMENTS_KEY, payments);
    return newPayment;
  } catch {
    return null;
  }
}

export function updateEMIPayment(id: string, updates: Partial<EMIPayment>): boolean {
  try {
    const payments = getEMIPayments();
    const idx = payments.findIndex(p => p.id === id);
    if (idx === -1) return false;
    const updated = { ...payments[idx], ...updates };
    validate(EMIPaymentSchema, updated);
    payments[idx] = updated;
    safeSet(EMI_PAYMENTS_KEY, payments);
    return true;
  } catch {
    return false;
  }
}

export function deleteEMIPayment(id: string): boolean {
  try {
    const payments = getEMIPayments().filter(p => p.id !== id);
    safeSet(EMI_PAYMENTS_KEY, payments);
    return true;
  } catch {
    return false;
  }
}

// ---------- Other Expenses ----------
export function getOtherExpenses(): OtherExpense[] {
  return safeGet<OtherExpense>(OTHER_EXPENSES_KEY);
}

export function addOtherExpense(expense: Omit<OtherExpense, 'id'>): OtherExpense | null {
  try {
    const validated = validate(OtherExpenseSchema.omit({ id: true }), expense);
    const expenses = getOtherExpenses();
    const newExpense = { ...validated, id: uuidv4() };
    expenses.push(newExpense);
    safeSet(OTHER_EXPENSES_KEY, expenses);
    return newExpense;
  } catch {
    return null;
  }
}

export function updateOtherExpense(id: string, updates: Partial<OtherExpense>): boolean {
  try {
    const expenses = getOtherExpenses();
    const idx = expenses.findIndex(e => e.id === id);
    if (idx === -1) return false;
    const updated = { ...expenses[idx], ...updates };
    validate(OtherExpenseSchema, updated);
    expenses[idx] = updated;
    safeSet(OTHER_EXPENSES_KEY, expenses);
    return true;
  } catch {
    return false;
  }
}

export function deleteOtherExpense(id: string): boolean {
  try {
    const expenses = getOtherExpenses().filter(e => e.id !== id);
    safeSet(OTHER_EXPENSES_KEY, expenses);
    return true;
  } catch {
    return false;
  }
}