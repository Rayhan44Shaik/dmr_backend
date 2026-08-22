import { z } from 'zod';
import {
  CashBookEntrySchema,
  BankBookEntrySchema,
  FarmerPurchaseSchema,
  FarmerPaymentSchema,
  VehicleLoanSchema,
  EMIPaymentSchema,
  OtherExpenseSchema,
} from '../types';

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new Error(`Validation failed: ${messages}`);
    }
    throw error;
  }
}

export const CashBookUpdateSchema = CashBookEntrySchema.partial();
export const BankBookUpdateSchema = BankBookEntrySchema.partial();
export const FarmerPurchaseUpdateSchema = FarmerPurchaseSchema.partial();
export const FarmerPaymentUpdateSchema = FarmerPaymentSchema.partial();
export const VehicleLoanUpdateSchema = VehicleLoanSchema.partial();
export const EMIPaymentUpdateSchema = EMIPaymentSchema.partial();
export const OtherExpenseUpdateSchema = OtherExpenseSchema.partial();