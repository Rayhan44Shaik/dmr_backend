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
  remarks: z.string().optional(),
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

export function parseCollectionEntryBody(body: unknown): CollectionEntryBody {
  return parseBody(collectionEntryBodySchema, body);
}