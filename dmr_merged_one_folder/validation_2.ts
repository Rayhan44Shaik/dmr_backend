import { z, ZodError } from 'zod';
import {
  MaintenanceEventSchema,
  VehicleDocumentSchema,
  FASTagSchema,
  FASTagTransactionSchema,
  EMIRecordSchema
} from '../types';

export const validateMaintenance = (data: unknown) => MaintenanceEventSchema.parse(data);
export const validateDocument = (data: unknown) => VehicleDocumentSchema.parse(data);
export const validateFastag = (data: unknown) => FASTagSchema.parse(data);
export const validateFastagTx = (data: unknown) => FASTagTransactionSchema.parse(data);
export const validateEMI = (data: unknown) => EMIRecordSchema.parse(data);

export const safeParse = <T>(schema: z.ZodSchema<T>, data: unknown) => {
  try {
    return { success: true, data: schema.parse(data) };
  } catch (err) {
    let errorMessage = 'Validation failed';
    if (err instanceof ZodError) {
      errorMessage = err.issues.map((issue: z.ZodIssue) => 
        `${issue.path.join('.')}: ${issue.message}`
      ).join(', ');
    }
    return { success: false, error: errorMessage };
  }
};