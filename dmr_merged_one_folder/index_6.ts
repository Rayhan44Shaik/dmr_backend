import { z } from 'zod';

// ---------- Cash Book ----------
export const CashBookEntrySchema = z.object({
  id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  particulars: z.string().min(1, 'Particulars required'),
  receipt: z.number().min(0, 'Receipt cannot be negative'),
  payment: z.number().min(0, 'Payment cannot be negative'),
  mode: z.enum(['cash', 'bank', 'upi', 'card']),
  contraType: z.enum(['collection', 'expense', 'farmer-payment', 'emi-payment', 'salary', 'other']),
  contraId: z.string().optional(),
});
export type CashBookEntry = z.infer<typeof CashBookEntrySchema>;

// ---------- Bank Book ----------
export const BankBookEntrySchema = z.object({
  id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  particulars: z.string().min(1, 'Particulars required'),
  deposit: z.number().min(0),
  withdrawal: z.number().min(0),
  bankAccountId: z.string().uuid(),
  contraType: z.enum(['collection', 'expense', 'farmer-payment', 'emi-payment', 'salary', 'other']),
  contraId: z.string().optional(),
});
export type BankBookEntry = z.infer<typeof BankBookEntrySchema>;

// ---------- Farmer Purchase ----------
export const FarmerPurchaseSchema = z.object({
  id: z.string().uuid(),
  farmId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalBirds: z.number().int().min(1),
  totalWeight: z.number().positive(),
  rate: z.number().positive(),
  amount: z.number().nonnegative(),
  status: z.enum(['Paid', 'Partial', 'Pending']),
  paidAmount: z.number().nonnegative(),
  note: z.string().optional(),
});
export type FarmerPurchase = z.infer<typeof FarmerPurchaseSchema>;

// ---------- Farmer Payment ----------
export const FarmerPaymentSchema = z.object({
  id: z.string().uuid(),
  purchaseId: z.string().uuid(),
  farmId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  paymentMode: z.enum(['cash', 'bank', 'upi', 'cheque']),
  reference: z.string().optional(),
  note: z.string().optional(),
});
export type FarmerPayment = z.infer<typeof FarmerPaymentSchema>;

// ---------- Vehicle Loan ----------
export const VehicleLoanSchema = z.object({
  id: z.string().uuid(),
  vehicleId: z.string().uuid(),
  bankId: z.string().uuid(),
  loanAmount: z.number().positive(),
  interestRate: z.number().nonnegative(),
  tenureMonths: z.number().int().positive(),
  emiAmount: z.number().positive(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['Active', 'Paid']),
});
export type VehicleLoan = z.infer<typeof VehicleLoanSchema>;

// ---------- EMI Payment ----------
export const EMIPaymentSchema = z.object({
  id: z.string().uuid(),
  loanId: z.string().uuid(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount: z.number().positive(),
  status: z.enum(['Pending', 'Paid', 'Upcoming']),
});
export type EMIPayment = z.infer<typeof EMIPaymentSchema>;

// ---------- Other Expense ----------
export const OtherExpenseSchema = z.object({
  id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.string().min(1, 'Category required'),
  amount: z.number().positive(),
  description: z.string().min(1, 'Description required'),
  paymentMode: z.enum(['cash', 'bank', 'upi']),
});
export type OtherExpense = z.infer<typeof OtherExpenseSchema>;

// ---------- Dashboard Summary (interface only) ----------
export interface DashboardSummary {
  totalSales: number;
  totalCollections: number;
  cashInHand: number;
  bankBalance: number;
  farmerPayables: number;
  emiDue: number;
  todayExpenses: number;
  yesterdaySales: number;
  yesterdayCollections: number;
}