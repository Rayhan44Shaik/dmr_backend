import { z } from "zod";
import { parseBody } from "./operations.js";

/** Server-owned Collection Entry payload. opening/closing balances and the
 * collection number are NEVER accepted from the client — the service derives
 * them from the database under lock. */
export const collectionEntryBodySchema = z.object({
  collectionDate: z.string().min(1, "collectionDate is required"),
  shopId: z.number().int().positive("shopId is required and must be a positive integer"),
  shopName: z.string().optional(),
  // Collector / actor who received the money.
  collector: z.string().optional(),
  paymentMode: z.string().optional(),
  referenceNo: z.string().optional(),
  // Stored and returned verbatim so Collection Entry remarks survive reloads.
  remarks: z.string().max(2000, "remarks must be 2000 characters or fewer").optional(),
  // The credit amount (> 0). amountCollected is never trusted from the client.
  amount: z.number().positive("amount must be greater than 0"),
  // Optional linkage to a delivery / trip for Rate-Entry + Shop-Sales gating.
  saleId: z.number().int().optional(),
  tripId: z.number().int().optional(),
  createdBy: z.string().optional(),
});

export type CollectionEntryBody = z.infer<typeof collectionEntryBodySchema>;

/** Partial update (editing a collection). amount is required when supplied. */
export const collectionEntryUpdateSchema = collectionEntryBodySchema
  .partial()
  .extend({
    amount: z.number().positive("amount must be greater than 0").optional(),
  });

export const collectionEntryStatusSchema = z.object({
  status: z.string().min(1),
  approvedBy: z.string().optional(),
  rejectedBy: z.string().optional(),
  reason: z.string().optional(),
  deletedBy: z.string().optional(),
});

/** Atomic spreadsheet import. Master values are resolved and canonicalised by
 * the service; clients cannot smuggle new shops, collectors, or banks in. */
export const collectionEntryImportSchema = z.object({
  batchId: z.string().uuid(),
  rows: z.array(z.object({
    sourceRow: z.number().int().min(2).max(1_000_002),
    collectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    shopName: z.string().trim().min(1).max(200),
    collector: z.string().trim().min(1).max(200),
    paymentMode: z.string().trim().min(1).max(200),
    amount: z.number().finite().positive().max(999_999_999_999.99),
    remarks: z.string().trim().max(2_000).default(""),
    referenceNo: z.string().trim().max(200).default(""),
  })).min(1).max(1_000),
});

export type CollectionEntryImport = z.infer<typeof collectionEntryImportSchema>;

export function parseCollectionEntryBody(body: unknown): CollectionEntryBody {
  return parseBody(collectionEntryBodySchema, body);
}
