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

/** Query params for GET /collection-entry/weekly-summary */
export const weeklySummaryQuerySchema = z.object({
  shopId: z.coerce.number().int().positive("shopId is required"),
  date: z.string().min(1, "date is required"),
});

export function parseWeeklySummaryQuery(query: unknown): { shopId: number; date: string } {
  return parseBody(weeklySummaryQuerySchema, query);
}

export const weeklySummariesQuerySchema = z.object({
  date: z.string().min(1, "date is required"),
});

export function parseWeeklySummariesQuery(query: unknown): { date: string } {
  return parseBody(weeklySummariesQuerySchema, query);
}

export const pendingSummaryQuerySchema = z.object({
  date: z.string().min(1, "date is required"),
});

export function parsePendingSummaryQuery(query: unknown): { date: string } {
  return parseBody(pendingSummaryQuerySchema, query);
}

export const pendingRecentQuerySchema = z.object({
  shopId: z.coerce.number().int().positive("shopId is required"),
  limit: z.coerce.number().int().positive().optional(),
});

export function parsePendingRecentQuery(query: unknown): { shopId: number; limit: number } {
  const parsed = parseBody(pendingRecentQuerySchema, query);
  const requested = parsed.limit ?? 10;
  return { shopId: parsed.shopId, limit: Math.min(requested, 10) };
}

/** Query params for GET /collection-entry/report (official Collection Report totals). */
export const collectionReportQuerySchema = z.object({
  fromDate: z.string().min(1, "fromDate is required"),
  toDate: z.string().min(1, "toDate is required"),
  shopId: z.coerce.number().int().positive().optional(),
  collector: z.string().optional(),
  paymentMode: z.string().optional(),
});

export type CollectionReportQuery = z.infer<typeof collectionReportQuerySchema>;

export function parseCollectionReportQuery(query: unknown): CollectionReportQuery {
  return parseBody(collectionReportQuerySchema, query);
}