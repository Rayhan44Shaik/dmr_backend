import type pg from "pg";
import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import type { CollectionEntry } from "../types/operations.js";
import { dateOnly, num, str } from "../utils/coerce.js";
import { assertShopExists } from "../utils/fkValidation.js";
import {
  paginatedResult,
  type PaginatedResult,
  type PaginationParams,
} from "../utils/pagination.js";
import { isPgError, rethrowIfAppError } from "../utils/pgErrors.js";
import {
  applyCorrection,
  applyCredit,
  applyDebit,
  lockShop,
} from "../utils/shopLedger.js";
import { parseBody } from "../validation/operations.js";
import { collectionEntryUpdateSchema } from "../validation/collectionEntry.js";
import { parseCollectionEntryBody } from "../validation/collectionEntry.js";
import { collectionEntryImportSchema, type CollectionEntryImport } from "../validation/collectionEntry.js";
import { isCollectionApprovedDeleteWindowOpen, assertCollectionApprovedDeleteWindowOpen } from "../utils/collectionDeleteWindow.js";

type Client = pg.PoolClient;

const SEL = `
  SELECT id, collection_no, collection_date, shop_id, shop_name,
         trip_id, amount_due, amount_collected, amount, collector,
         payment_mode, reference_no, remarks, status, deleted, deleted_by,
         deleted_at, is_financial, opening_balance, closing_balance,
         approved_by, approved_at, created_by, created_at, updated_at
  FROM collections
`;

function mapEntry(row: Record<string, unknown>): CollectionEntry {
  const amount = num(row.amount ?? row.amount_collected);
  const collectionNo = str(row.collection_no).replace(/^col-/i, "COL-");
  return {
    id: num(row.id),
    collectionNo,
    collectionDate: dateOnly(row.collection_date) ?? "",
    shopId: row.shop_id == null ? null : num(row.shop_id),
    shopName: str(row.shop_name),
    tripId: row.trip_id == null ? null : num(row.trip_id),
    amountDue: num(row.amount_due),
    amount,
    amountCollected: num(row.amount_collected),
    collector: str(row.collector),
    paymentMode: str(row.payment_mode) || "Cash",
    referenceNo: str(row.reference_no),
    remarks: str(row.remarks),
    openingBalance: row.opening_balance == null ? null : num(row.opening_balance),
    closingBalance: row.closing_balance == null ? null : num(row.closing_balance),
    status: str(row.status) as CollectionEntry["status"],
    deleted: Boolean(row.deleted),
    deletedBy: row.deleted_by == null ? null : str(row.deleted_by),
    deletedAt: row.deleted_at == null ? null : str(row.deleted_at),
    isFinancial: Boolean(row.is_financial),
    approvedBy: row.approved_by == null ? null : str(row.approved_by),
    approvedAt: row.approved_at == null ? null : str(row.approved_at),
    createdBy: str(row.created_by),
    createdAt: row.created_at == null ? null : str(row.created_at),
    updatedAt: row.updated_at == null ? null : str(row.updated_at),
  };
}

/** Inclusive last-14-days window used by Pending Collections when no dates
 *  are applied, so "Recent Sales / Recent Collections" follow the same two
 *  weeks as the post-approval delete window rather than the current Mon–Sun. */
export function pendingRecentBounds(input?: string) {
  const iso = (value: Date) => value.toISOString().slice(0, 10);
  const today = iso(new Date());
  const asOfDate = input && /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : today;
  const end = new Date(`${asOfDate}T00:00:00Z`);
  if (Number.isNaN(end.getTime())) throw new AppError(400, "Invalid date");
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 13);
  return { asOfDate, weekStart: iso(start), weekEnd: asOfDate };
}

export function collectionWeekBounds(input?: string, weekOffset = 0) {
  const parsed = input && /^\d{4}-\d{2}-\d{2}$/.test(input) ? new Date(`${input}T00:00:00Z`) : new Date();
  if (Number.isNaN(parsed.getTime())) throw new AppError(400, "Invalid date");
  const day = parsed.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(parsed);
  start.setUTCDate(start.getUTCDate() + mondayOffset + weekOffset * 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const iso = (value: Date) => value.toISOString().slice(0, 10);
  const today = new Date();
  const todayText = iso(today);
  return { asOfDate: iso(parsed), weekStart: iso(start), weekEnd: iso(end), isCurrentWeek: todayText >= iso(start) && todayText <= iso(end) };
}

/**
 * Requirement 7 — prerequisite gate. A collection may only be raised against a
 * delivery/trip once the business flow has reached it: Completed Trip →
 * Rate Entry saved & locked → Shop Sales exists. Runs on the backend in the
 * same transaction so direct API calls cannot bypass it. Returns the resolved
 * trip id (or null when no sale/trip linkage is provided).
 */
async function assertPrerequisite(
  client: Client,
  body: { saleId?: number; tripId?: number }
): Promise<number | null> {
  let tripId: number | null = body.tripId ?? null;

  if (body.saleId) {
    const sale = await client.query<{ trip_id: number }>(
      `SELECT trip_id FROM trip_deliveries WHERE id = $1 AND COALESCE(deleted, FALSE) = FALSE`,
      [body.saleId]
    );
    if (!sale.rowCount) {
      throw new AppError(404, "Shop sale not found for collection");
    }
    tripId = num(sale.rows[0].trip_id);
  }

  if (tripId != null) {
    const trip = await client.query<{
      status: string;
      deleted: boolean;
      rate_completed: boolean;
    }>(
      `SELECT status, COALESCE(deleted,FALSE) AS deleted,
              COALESCE(rate_completed,FALSE) AS rate_completed
         FROM trips WHERE id = $1`,
      [tripId]
    );
    if (!trip.rowCount) throw new AppError(404, `Trip ${tripId} not found`);
    const t = trip.rows[0];
    if (t.status !== "Completed" || t.deleted) {
      throw new AppError(
        409,
        `Collection requires a Completed, non-deleted trip (found status '${t.status}')`
      );
    }
    if (!t.rate_completed) {
      throw new AppError(
        409,
        "Collection requires the trip's Rate Entry to be locked before a collection can be raised"
      );
    }
    const linkedDelivery = await client.query<{ id: number }>(
      `SELECT id FROM trip_deliveries
        WHERE trip_id = $1 AND COALESCE(deleted,FALSE) = FALSE
        ORDER BY id LIMIT 1`,
      [tripId]
    );
    if (!linkedDelivery.rowCount) {
      throw new AppError(409, "Collection requires at least one Shop Sale on the trip");
    }
  }

  return tripId;
}

async function isImportedCollection(client: Client, id: number): Promise<boolean> {
  try {
    const result = await client.query<{ import_batch_id: string | null }>(
      `SELECT import_batch_id FROM collections WHERE id = $1`,
      [id]
    );
    return result.rows[0]?.import_batch_id != null;
  } catch (err) {
    if (isPgError(err) && err.code === "42703") return false;
    throw err;
  }
}

async function loadOne(client: Client, id: number): Promise<CollectionEntry> {
  const result = await client.query(`${SEL} WHERE id = $1`, [id]);
  if (!result.rowCount) throw new AppError(404, "Collection not found");
  return mapEntry(result.rows[0]);
}

async function loadCollectionImportMasters(client: Client) {
  const [shopsResult, collectorsResult, banksResult, referencesResult] = await Promise.all([
    client.query<{ shop_name: string }>(`SELECT shop_name FROM shops ORDER BY shop_name`),
    client.query<{ employee_name: string }>(
      `SELECT employee_name FROM employees
        WHERE status = 'Active' AND LOWER(BTRIM(department)) = 'collection'
        ORDER BY employee_name`
    ),
    client.query<{ bank_name: string }>(`SELECT bank_name FROM banks WHERE status = 'Active' ORDER BY bank_name`),
    client.query<{ reference_no: string }>(
      `SELECT reference_no FROM collections WHERE BTRIM(COALESCE(reference_no, '')) <> ''`
    ),
  ]);
  return {
    shops: shopsResult.rows.map((row) => row.shop_name),
    collectors: collectorsResult.rows.map((row) => row.employee_name),
    modes: ["Cash", ...banksResult.rows.map((row) => row.bank_name)],
    existingReferences: referencesResult.rows.map((row) => row.reference_no),
  };
}

async function validateCollectionImportRows(
  client: Client,
  rows: Array<Omit<CollectionEntryImport["rows"][number], "remarks" | "referenceNo"> & { remarks?: string; referenceNo?: string }>
) {
  const masters = await loadCollectionImportMasters(client);
  const key = (value: string) => value.trim().toLocaleLowerCase("en-IN");
  const shops = new Set(masters.shops.map(key));
  const collectors = new Set(masters.collectors.map(key));
  const modes = new Set(masters.modes.map(key));
  const existingReferences = new Set(masters.existingReferences.map(key));
  const batchReferenceCounts = new Map<string, number>();
  rows.forEach((row) => {
    const reference = key(row.referenceNo ?? "");
    if (reference) batchReferenceCounts.set(reference, (batchReferenceCounts.get(reference) ?? 0) + 1);
  });
  const issues: Array<{ sourceRow: number; fields: string[] }> = [];
  for (const row of rows) {
    const fields: string[] = [];
    if (!shops.has(key(row.shopName))) fields.push("shopName");
    if (!collectors.has(key(row.collector))) fields.push("collector");
    if (!modes.has(key(row.paymentMode))) fields.push("paymentMode");
    const reference = key(row.referenceNo ?? "");
    if (reference && (existingReferences.has(reference) || (batchReferenceCounts.get(reference) ?? 0) > 1)) fields.push("referenceNo");
    const parsedDate = new Date(`${row.collectionDate}T00:00:00Z`);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== row.collectionDate) fields.push("collectionDate");
    if (fields.length) issues.push({ sourceRow: row.sourceRow, fields });
  }
  return issues;
}

export { deletePendingCollection, deletePendingCollectionForRouter } from "./collectionEntryService.pendingDelete.js";
export const collectionEntryService = {
  async importMasters() {
    return withTransaction((client) => loadCollectionImportMasters(client));
  },
  async validateImport(body: unknown) {
    const data = parseBody(collectionEntryImportSchema, body);
    return withTransaction(async (client) => ({ issues: await validateCollectionImportRows(client, data.rows) }));
  },
  /**
   * Import only rows already accepted by the spreadsheet review. The entire
   * batch is one transaction, master names are matched case-insensitively and
   * rewritten to their canonical spelling, and batchId makes a retry safe.
   */
  async importMany(body: unknown, actor = ""): Promise<{ imported: number; entries: CollectionEntry[]; replayed: boolean }> {
    const data = parseBody(collectionEntryImportSchema, body);
    return withTransaction(async (client) => {
      const prior = await client.query<{ row_count: number }>(
        `SELECT row_count FROM collection_import_batches WHERE batch_id = $1 FOR UPDATE`,
        [data.batchId]
      );
      if (prior.rowCount) {
        const existing = await client.query(
          `${SEL} WHERE import_batch_id = $1 ORDER BY import_source_row`,
          [data.batchId]
        );
        if (existing.rowCount !== prior.rows[0].row_count) {
          throw new AppError(409, "Import batch is incomplete; contact support before retrying");
        }
        return { imported: existing.rowCount, entries: existing.rows.map(mapEntry), replayed: true };
      }

      const [shopsResult, collectorsResult, banksResult] = await Promise.all([
        client.query<{ id: number; shop_name: string }>(`SELECT id, shop_name FROM shops`),
        client.query<{ employee_name: string }>(`SELECT employee_name FROM employees WHERE status = 'Active' AND LOWER(BTRIM(department)) = 'collection'`),
        client.query<{ bank_name: string }>(`SELECT bank_name FROM banks WHERE status = 'Active'`),
      ]);
      const key = (value: string) => value.trim().toLocaleLowerCase("en-IN");
      const shops = new Map(shopsResult.rows.map((row) => [key(row.shop_name), row]));
      const collectors = new Map(collectorsResult.rows.map((row) => [key(row.employee_name), row.employee_name]));
      const modes = new Map<string, string>([["cash", "Cash"]]);
      banksResult.rows.forEach((row) => modes.set(key(row.bank_name), row.bank_name));
      const existingReferencesResult = await client.query<{ reference_no: string }>(
        `SELECT reference_no FROM collections WHERE BTRIM(COALESCE(reference_no, '')) <> ''`
      );
      const existingReferences = new Set(existingReferencesResult.rows.map((row) => key(row.reference_no)));
      const batchReferenceCounts = new Map<string, number>();
      data.rows.forEach((row) => {
        const reference = key(row.referenceNo ?? "");
        if (reference) batchReferenceCounts.set(reference, (batchReferenceCounts.get(reference) ?? 0) + 1);
      });

      const issues: Array<{ sourceRow: number; fields: string[] }> = [];
      for (const row of data.rows) {
        const fields: string[] = [];
        if (!shops.has(key(row.shopName))) fields.push("shopName");
        if (!collectors.has(key(row.collector))) fields.push("collector");
        if (!modes.has(key(row.paymentMode))) fields.push("paymentMode");
        const reference = key(row.referenceNo ?? "");
        if (reference && (existingReferences.has(reference) || (batchReferenceCounts.get(reference) ?? 0) > 1)) fields.push("referenceNo");
        const parsedDate = new Date(`${row.collectionDate}T00:00:00Z`);
        if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== row.collectionDate) fields.push("collectionDate");
        if (fields.length) issues.push({ sourceRow: row.sourceRow, fields });
      }
      if (issues.length) throw new AppError(422, "Some collection import rows need review", { issues });

      await client.query(
        `INSERT INTO collection_import_batches(batch_id, row_count, created_by) VALUES ($1,$2,$3)`,
        [data.batchId, data.rows.length, actor]
      );
      const entries: CollectionEntry[] = [];
      for (const row of data.rows) {
        const shop = shops.get(key(row.shopName))!;
        const canonicalCollector = collectors.get(key(row.collector))!;
        const canonicalMode = modes.get(key(row.paymentMode))!;
        const numberResult = await client.query<{ collection_no_for_date: string }>(
          `SELECT collection_no_for_date($1)`, [row.collectionDate]
        );
        const inserted = await client.query<{ id: number }>(
          `INSERT INTO collections (
             collection_no, collection_date, shop_id, shop_name, amount_due,
             amount_collected, amount, collector, payment_mode, reference_no,
             remarks, status, created_by, import_batch_id, import_source_row
           ) VALUES ($1,$2,$3,$4,$5,$5,$5,$6,$7,$8,$9,'Pending Approval',$10,$11,$12)
           RETURNING id`,
          [numberResult.rows[0].collection_no_for_date, row.collectionDate, shop.id,
           shop.shop_name, row.amount, canonicalCollector, canonicalMode,
           row.referenceNo, row.remarks, actor, data.batchId, row.sourceRow]
        );
        entries.push(await loadOne(client, num(inserted.rows[0].id)));
      }
      return { imported: entries.length, entries, replayed: false };
    });
  },

  async recent(filters: { shopId: number; limit?: number; includeDeleted?: boolean }) {
    if (!Number.isInteger(filters.shopId) || filters.shopId <= 0) {
      throw new AppError(400, "A valid shopId is required");
    }
    const requestedLimit = Number.isFinite(filters.limit) ? Math.trunc(filters.limit as number) : 10;
    const limit = Math.min(Math.max(requestedLimit, 1), 100);
    const result = await query(
      `${SEL}
       WHERE shop_id = $1
         AND ($2::boolean = TRUE OR COALESCE(deleted, FALSE) = FALSE)
       ORDER BY collection_date DESC, created_at DESC, id DESC
       LIMIT $3`,
      [filters.shopId, Boolean(filters.includeDeleted), limit]
    );
    return result.rows.map((row) => {
      const entry = mapEntry(row);
      const pending = String(entry.status ?? "").toLowerCase().startsWith("pending");
      const canDelete = !entry.deleted && (
        pending
          ? true
          : isCollectionApprovedDeleteWindowOpen(entry.approvedAt ?? entry.createdAt)
      );
      return { ...entry, canDelete };
    });
  },

  async weeklySummary(shopId: number, date?: string) {
    if (!Number.isInteger(shopId) || shopId <= 0) {
      throw new AppError(400, "A valid shopId is required");
    }
    const summaries = await this.weeklySummaries(date, shopId);
    if (!summaries.length) throw new AppError(404, "Shop not found");
    return summaries[0];
  },

  async weeklySummaries(date?: string, shopId?: number) {
    // Collection Entry reconciles against the last fully completed business
    // week. Example: an entry dated Mon 05-Oct reads Mon 28-Sep–Sun 04-Oct.
    const bounds = collectionWeekBounds(date, -1);
    const collectionBounds = collectionWeekBounds(date);
    const result = await query(
      `SELECT s.id AS shop_id, s.shop_name,
              COALESCE(s.current_balance, 0) AS balance,
              COALESCE(s.current_balance, 0) - COALESCE(sales.amount, 0) + COALESCE(approved.amount, 0) AS opening_balance,
              COALESCE(sales.amount, 0) AS weekly_sales,
              COALESCE(sales.row_count, 0) AS sales_count,
              COALESCE(approved.amount, 0) AS approved_collections,
              COALESCE(approved.row_count, 0) AS approved_collections_count,
              COALESCE(pending.amount, 0) AS pending_collections,
              COALESCE(pending.row_count, 0) AS pending_collections_count
         FROM shops s
         LEFT JOIN LATERAL (
           SELECT SUM(COALESCE(d.amount, 0)) AS amount, COUNT(*)::int AS row_count
             FROM trip_deliveries d
             JOIN trips t ON t.id = d.trip_id
            WHERE d.shop_id = s.id
              AND COALESCE(d.deleted, FALSE) = FALSE
              AND COALESCE(t.deleted, FALSE) = FALSE
              AND t.status = 'Completed' AND COALESCE(t.rate_completed, FALSE) = TRUE
              AND t.trip_date BETWEEN $1::date AND $2::date
         ) sales ON TRUE
         LEFT JOIN LATERAL (
           SELECT SUM(COALESCE(c.amount, c.amount_collected, 0)) AS amount,
                  COUNT(*)::int AS row_count
             FROM collections c
            WHERE c.shop_id = s.id AND COALESCE(c.deleted, FALSE) = FALSE
              AND COALESCE(c.is_financial, FALSE) = TRUE
              AND c.collection_date BETWEEN $3::date AND $4::date
         ) approved ON TRUE
         LEFT JOIN LATERAL (
           SELECT SUM(COALESCE(c.amount, c.amount_collected, 0)) AS amount,
                  COUNT(*)::int AS row_count
             FROM collections c
            WHERE c.shop_id = s.id AND COALESCE(c.deleted, FALSE) = FALSE
              AND COALESCE(c.is_financial, FALSE) = FALSE
              AND c.status = 'Pending Approval'
              AND c.collection_date BETWEEN $3::date AND $4::date
         ) pending ON TRUE
        WHERE ($5::int IS NULL OR s.id = $5)
          AND ($5::int IS NOT NULL OR s.status = 'Active')
        ORDER BY s.shop_name`,
      [bounds.weekStart, bounds.weekEnd, collectionBounds.weekStart, collectionBounds.weekEnd, shopId ?? null]
    );
    const previousWeekEnd = new Date(`${bounds.weekStart}T00:00:00Z`);
    previousWeekEnd.setUTCDate(previousWeekEnd.getUTCDate() - 1);
    return result.rows.map((row) => {
      const openingBalance = num(row.opening_balance);
      const weeklySales = num(row.weekly_sales);
      const approvedCollections = num(row.approved_collections);
      return {
        shopId: num(row.shop_id),
        shopName: str(row.shop_name),
        weekStart: bounds.weekStart,
        weekEnd: bounds.weekEnd,
        collectionWeekStart: collectionBounds.weekStart,
        collectionWeekEnd: collectionBounds.weekEnd,
        previousWeekEnd: previousWeekEnd.toISOString().slice(0, 10),
        openingBalance,
        balance: num(row.balance),
        closingBalance: openingBalance + weeklySales - approvedCollections,
        weeklySales,
        pendingSales: 0,
        salesCount: num(row.sales_count),
        approvedCollections,
        pendingCollections: num(row.pending_collections),
        approvedCollectionsCount: num(row.approved_collections_count),
        pendingCollectionsCount: num(row.pending_collections_count),
        isCurrentWeek: bounds.isCurrentWeek,
      };
    });
  },

  async report(filters: {
    fromDate?: string;
    toDate?: string;
    shopId?: number;
    collector?: string;
    paymentMode?: string;
  }) {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!filters.fromDate || !datePattern.test(filters.fromDate) || !filters.toDate || !datePattern.test(filters.toDate)) {
      throw new AppError(400, "Valid fromDate and toDate are required");
    }
    if (filters.fromDate > filters.toDate) {
      throw new AppError(400, "fromDate cannot be after toDate");
    }

    const params: unknown[] = [filters.fromDate, filters.toDate];
    const clauses = [
      `collection_date BETWEEN $1::date AND $2::date`,
      `COALESCE(deleted, FALSE) = FALSE`,
      `COALESCE(is_financial, FALSE) = TRUE`,
    ];
    if (filters.shopId) {
      params.push(filters.shopId);
      clauses.push(`shop_id = $${params.length}`);
    }
    if (filters.collector?.trim()) {
      params.push(filters.collector.trim());
      clauses.push(`collector = $${params.length}`);
    }
    if (filters.paymentMode?.trim()) {
      params.push(filters.paymentMode.trim());
      clauses.push(`payment_mode = $${params.length}`);
    }

    const result = await query(
      `SELECT COALESCE(NULLIF(BTRIM(payment_mode), ''), 'Cash') AS payment_mode,
              COALESCE(NULLIF(BTRIM(collector), ''), 'Unassigned') AS collector,
              COUNT(*)::int AS count,
              COALESCE(SUM(COALESCE(amount, amount_collected, 0)), 0) AS amount
         FROM collections
        WHERE ${clauses.join(" AND ")}
        GROUP BY 1, 2
        ORDER BY 1, 2`,
      params
    );

    const paymentModes = new Map<string, { count: number; amount: number; collectors: Set<string> }>();
    const collectors = new Map<string, Record<string, number>>();
    let totalAmount = 0;
    let totalCount = 0;
    for (const row of result.rows) {
      const paymentMode = str(row.payment_mode) || "Cash";
      const collector = str(row.collector) || "Unassigned";
      const count = num(row.count);
      const amount = num(row.amount);
      const mode = paymentModes.get(paymentMode) ?? { count: 0, amount: 0, collectors: new Set<string>() };
      mode.count += count;
      mode.amount += amount;
      mode.collectors.add(collector);
      paymentModes.set(paymentMode, mode);
      const collectorAmounts = collectors.get(collector) ?? {};
      collectorAmounts[paymentMode] = (collectorAmounts[paymentMode] ?? 0) + amount;
      collectors.set(collector, collectorAmounts);
      totalCount += count;
      totalAmount += amount;
    }

    return {
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      totalAmount,
      totalCount,
      totalCollectors: collectors.size,
      paymentModeSummary: [...paymentModes.entries()].map(([paymentMode, value]) => ({
        paymentMode,
        count: value.count,
        amount: value.amount,
        percentage: totalAmount > 0 ? Number(((value.amount / totalAmount) * 100).toFixed(2)) : 0,
      })),
      collectorsByPaymentMode: [...paymentModes.entries()].map(([paymentMode, value]) => ({
        paymentMode,
        collectorCount: value.collectors.size,
      })),
      collectorSummary: [...collectors.entries()].map(([collector, amounts]) => ({
        collector,
        amounts,
        total: Object.values(amounts).reduce((sum, amount) => sum + amount, 0),
      })),
    };
  },

  async weekBounds(date?: string, previousCompleted = false) {
    return collectionWeekBounds(date, previousCompleted ? -1 : 0);
  },

  async pendingSummary(date?: string, range?: { fromDate?: string; toDate?: string }) {
    const today = new Date().toISOString().slice(0, 10);
    const bounds =
      range?.fromDate && range?.toDate
        ? {
            weekStart: range.fromDate,
            weekEnd: range.toDate,
            asOfDate: range.toDate < today ? range.toDate : today,
          }
        : pendingRecentBounds(date);
    const result = await query(
      `SELECT s.id AS shop_id, s.shop_name, COALESCE(s.current_balance, 0) AS balance,
              COALESCE(ws.amount, 0) AS weekly_sales,
              COALESCE(ac.amount, 0) AS approved_collections,
              COALESCE(pc.amount, 0) AS pending_collections,
              COALESCE(lca.amount, 0) AS last_collection_amount,
              lc.last_collection_date
         FROM shops s
         LEFT JOIN LATERAL (
           SELECT SUM(COALESCE(d.amount, 0)) AS amount
             FROM trip_deliveries d JOIN trips t ON t.id = d.trip_id
            WHERE d.shop_id = s.id AND COALESCE(d.deleted, FALSE) = FALSE
              AND COALESCE(t.deleted, FALSE) = FALSE AND COALESCE(t.rate_completed, FALSE) = TRUE
              AND t.trip_date BETWEEN $1::date AND $2::date
         ) ws ON TRUE
         LEFT JOIN LATERAL (
           SELECT SUM(COALESCE(c.amount, c.amount_collected, 0)) AS amount,
                  COUNT(*)::int AS row_count
             FROM collections c WHERE c.shop_id = s.id AND COALESCE(c.deleted, FALSE) = FALSE
              AND (COALESCE(c.is_financial, FALSE) = TRUE OR c.status = 'Approved')
              AND c.collection_date BETWEEN $1::date AND $2::date
         ) ac ON TRUE
         LEFT JOIN LATERAL (
           SELECT SUM(COALESCE(c.amount, c.amount_collected, 0)) AS amount,
                  COUNT(*)::int AS row_count
             FROM collections c WHERE c.shop_id = s.id AND COALESCE(c.deleted, FALSE) = FALSE
              AND COALESCE(c.is_financial, FALSE) = FALSE AND c.status = 'Pending Approval'
              AND c.collection_date BETWEEN $1::date AND $2::date
         ) pc ON TRUE
         LEFT JOIN LATERAL (
           SELECT MAX(c.collection_date) AS last_collection_date
             FROM collections c WHERE c.shop_id = s.id AND COALESCE(c.deleted, FALSE) = FALSE
              AND (COALESCE(c.is_financial, FALSE) = TRUE OR c.status = 'Approved')
         ) lc ON TRUE
         LEFT JOIN LATERAL (
           SELECT SUM(COALESCE(c.amount, c.amount_collected, 0)) AS amount
             FROM collections c WHERE c.shop_id = s.id AND COALESCE(c.deleted, FALSE) = FALSE
              AND (COALESCE(c.is_financial, FALSE) = TRUE OR c.status = 'Approved')
              AND lc.last_collection_date IS NOT NULL
              AND c.collection_date = lc.last_collection_date
         ) lca ON TRUE
        WHERE s.status = 'Active'
           OR COALESCE(s.opening_balance, 0) <> 0
           OR COALESCE(s.current_balance, 0) <> 0
           OR COALESCE(pc.row_count, 0) > 0
        ORDER BY s.shop_name`,
      [bounds.weekStart, bounds.weekEnd]
    );
    const shops = result.rows.map((row) => {
      const weeklySales = num(row.weekly_sales);
      const windowApproved = num(row.approved_collections);
      const lastDayApproved = num(row.last_collection_amount);
      // Recent Collections must match the shop view's latest approved day.
      // A week with no collections used to print ₹0 while Last Collection
      // still showed 19/10 with money in the view.
      const approved = windowApproved > 0 ? windowApproved : lastDayApproved;
      const lastDate = dateOnly(row.last_collection_date);
      const overdueDays = lastDate ? Math.max(0, Math.floor((new Date(`${bounds.asOfDate}T00:00:00Z`).getTime() - new Date(`${lastDate}T00:00:00Z`).getTime()) / 86_400_000)) : null;
      return {
        shopId: num(row.shop_id), shopName: str(row.shop_name), weekStart: bounds.weekStart, weekEnd: bounds.weekEnd,
        balance: num(row.balance), weeklySales, weeklyApprovedCollections: approved,
        weeklyPendingCollections: num(row.pending_collections),
        recoveryPercentage: weeklySales > 0 ? Number(((approved / weeklySales) * 100).toFixed(2)) : 0,
        overdueDays, hasPendingCollections: num(row.pending_collections) > 0, lastCollectionDate: lastDate,
      };
    });
    const totals = shops.reduce((acc, row) => ({
      weeklySales: acc.weeklySales + row.weeklySales,
      weeklyApprovedCollections: acc.weeklyApprovedCollections + row.weeklyApprovedCollections,
      weeklyPendingCollections: acc.weeklyPendingCollections + row.weeklyPendingCollections,
      balance: acc.balance + row.balance,
      recoveryPercentage: 0,
    }), { weeklySales: 0, weeklyApprovedCollections: 0, weeklyPendingCollections: 0, balance: 0, recoveryPercentage: 0 });
    totals.recoveryPercentage = totals.weeklySales > 0 ? Number(((totals.weeklyApprovedCollections / totals.weeklySales) * 100).toFixed(2)) : 0;
    return { weekStart: bounds.weekStart, weekEnd: bounds.weekEnd, shops, totals };
  },

  async list(filters: {
    shopId?: number;
    fromDate?: string;
    toDate?: string;
    status?: string;
    includeDeleted?: boolean;
    pagination?: PaginationParams | null;
  } = {}): Promise<CollectionEntry[] | PaginatedResult<CollectionEntry>> {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (!filters.includeDeleted) {
      clauses.push(`COALESCE(collections.deleted, FALSE) = FALSE`);
    }
    if (filters.shopId) {
      params.push(filters.shopId);
      clauses.push(`collections.shop_id = $${params.length}`);
    }
    if (filters.fromDate) {
      params.push(filters.fromDate);
      clauses.push(`collections.collection_date >= $${params.length}`);
    }
    if (filters.toDate) {
      params.push(filters.toDate);
      clauses.push(`collections.collection_date <= $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      clauses.push(`collections.status::text = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const mapRows = (rows: Record<string, unknown>[]) =>
      rows.flatMap((row) => {
        try {
          return [mapEntry(row)];
        } catch {
          return [];
        }
      });

    const readRows = async (sql: string, values: unknown[]) => {
      try {
        return await query(sql, values);
      } catch (err) {
        if (!isPgError(err) || err.code !== "42703") throw err;
        return await query(
          sql.replace(SEL, "SELECT * FROM collections"),
          values,
        );
      }
    };

    if (filters.pagination) {
      const countResult = await query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM collections ${where}`,
        params
      );
      const total = Number(countResult.rows[0]?.c ?? 0);
      const pagedParams = [...params, filters.pagination.limit, filters.pagination.offset];
      const result = await readRows(
        `${SEL} ${where}
         ORDER BY collections.collection_date DESC, collections.id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        pagedParams
      );
      return paginatedResult(mapRows(result.rows), total, filters.pagination);
    }

    const result = await readRows(
      `${SEL} ${where} ORDER BY collections.collection_date DESC, collections.id DESC`,
      params
    );
    return mapRows(result.rows);
  },

  async getById(id: number): Promise<CollectionEntry> {
    const result = await query(`${SEL} WHERE id = $1`, [id]);
    if (!result.rowCount) throw new AppError(404, "Collection not found");
    return mapEntry(result.rows[0]);
  },

  /**
   * Create a pending collection — NO financial effect. The collection number is
   * generated server-side and is permanent. Opening/closing snapshots are
   * captured at approval when the credit is actually applied.
   */
  async create(body: unknown): Promise<CollectionEntry> {
    const data = parseCollectionEntryBody(body);

    return withTransaction(async (client) => {
      try {
        await assertShopExists(data.shopId, client);
        const tripId = await assertPrerequisite(client, data);

        const shop = await lockShop(client, data.shopId);
        if (!shop) throw new AppError(422, "Shop not found", { shopId: data.shopId });
        if (shop.status !== "Active") {
          throw new AppError(422, "Shop is inactive and cannot receive a collection", {
            shopId: data.shopId,
          });
        }
        const collectionDate = dateOnly(data.collectionDate);
        if (!collectionDate) throw new AppError(400, "Invalid collection date");

        const numberResult = await client.query<{ collection_no_for_date: string }>(
          `SELECT collection_no_for_date($1)`,
          [collectionDate]
        );
        const collectionNo = String(numberResult.rows[0].collection_no_for_date);

        const result = await client.query<{ id: number }>(
          `INSERT INTO collections (
             collection_no, collection_date, shop_id, shop_name, trip_id,
             amount_due, amount_collected, amount, collector, payment_mode,
             reference_no, remarks, status, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Pending Approval',$13)
           RETURNING id`,
          [
            collectionNo,
            collectionDate,
            data.shopId,
            data.shopName ?? shop.shopName,
            tripId,
            data.amount,
            data.amount,
            data.amount,
            data.collector ?? "",
            data.paymentMode ?? "Cash",
            data.referenceNo ?? "",
            data.remarks ?? "",
            data.createdBy ?? "",
          ]
        );
        return await loadOne(client, num(result.rows[0].id));
      } catch (err) {
        rethrowIfAppError(err);
        throw err;
      }
    });
  },

  /**
   * Edit a collection. A never-applied (pending/rejected) collection is a plain
   * field update. An APPLIED (approved) collection adjusts the Shop balance by
   * the DIFFERENCE only (never the whole new amount) via one differential
   * correction entry, keeping the ledger reconciled. Deleted records are
   * protected.
   */
  async update(id: number, body: unknown): Promise<CollectionEntry> {
    const data = parseBody(collectionEntryUpdateSchema, body);

    return withTransaction(async (client) => {
      try {
        const lockRow = await client.query(
          `${SEL} WHERE id = $1 FOR UPDATE`,
          [id]
        );
        if (!lockRow.rowCount) throw new AppError(404, "Collection not found");
        const existing = mapEntry(lockRow.rows[0]);
        const imported = await isImportedCollection(client, id);
        if (existing.deleted) throw new AppError(409, "Cannot edit a deleted collection");

        const newAmount = data.amount !== undefined ? data.amount : existing.amount;
        const newDate = data.collectionDate !== undefined ? dateOnly(data.collectionDate) : existing.collectionDate;
        if (!newDate) throw new AppError(400, "Invalid collection date");
        const shopId = existing.shopId;
        const targetShopId = data.shopId ?? shopId;
        const shopChanged = targetShopId !== shopId;
        let targetShopName = existing.shopName;

        if (shopChanged) {
          if (existing.isFinancial) {
            throw new AppError(409, "An approved collection cannot be moved to another shop");
          }
          if (targetShopId == null) throw new AppError(422, "A valid shop is required");
          const targetShop = await lockShop(client, targetShopId);
          if (!targetShop) throw new AppError(422, "Shop not found", { shopId: targetShopId });
          if (targetShop.status !== "Active" && !imported) {
            throw new AppError(422, "Shop is inactive and cannot receive a collection", { shopId: targetShopId });
          }
          targetShopName = targetShop.shopName;
        }

        if (existing.isFinancial && data.amount !== undefined && newAmount !== existing.amount) {
          if (shopId == null) throw new AppError(422, "Collection has no linked shop");
          const shop = await lockShop(client, shopId);
          if (!shop) throw new AppError(422, "Shop not found", { shopId });
          // Outstanding falls as the (credit) amount grows:
          //   newAmount > oldAmount → outstanding −= diff (extra credit)
          //   newAmount < oldAmount → outstanding += diff (returned credit)
          await applyCorrection(
            client,
            shopId,
            {
              entryDate: newDate,
              entryType: "correction",
              referenceType: "collection",
              referenceId: id,
              note: `Collection edit difference (₹${existing.amount} → ₹${newAmount})`,
            },
            -(newAmount - existing.amount)
          );
        }

        await client.query(
          `UPDATE collections SET
             collection_date = $2,
             amount_due      = $3,
             amount_collected= $3,
             amount          = $3,
             collector       = COALESCE($4, collector),
             payment_mode    = COALESCE($5, payment_mode),
             reference_no    = COALESCE($6, reference_no),
             remarks         = COALESCE($7, remarks),
             shop_id         = $8,
             shop_name       = $9,
             updated_at      = NOW()
           WHERE id = $1`,
          [
            id,
            newDate,
            newAmount,
            data.collector ?? null,
            data.paymentMode ?? null,
            data.referenceNo ?? null,
            data.remarks ?? null,
            targetShopId,
            targetShopName,
          ]
        );

        if (existing.isFinancial && existing.openingBalance != null && data.amount !== undefined) {
          await client.query(
            `UPDATE collections SET closing_balance = $2 WHERE id = $1`,
            [id, existing.openingBalance - newAmount]
          );
        }

        return await loadOne(client, id);
      } catch (err) {
        rethrowIfAppError(err);
        throw err;
      }
    });
  },

  /**
   * Approve = the financial event. Applies the CREDIT exactly once (idempotent:
   * re-approving a financial collection returns unchanged and never credits
   * twice). Opening/closing snapshots captured under shop row lock.
   */
  async approve(id: number, body: { approvedBy?: string } = {}): Promise<CollectionEntry> {
    return withTransaction(async (client) => {
      try {
        const lockRow = await client.query(
          `${SEL} WHERE id = $1 FOR UPDATE`,
          [id]
        );
        if (!lockRow.rowCount) throw new AppError(404, "Collection not found");
        const existing = mapEntry(lockRow.rows[0]);
        const imported = await isImportedCollection(client, id);

        if (existing.deleted) throw new AppError(409, "Cannot approve a deleted collection");
        if (existing.isFinancial) return existing; // idempotent

        const shopId = existing.shopId;
        if (shopId == null) throw new AppError(422, "Collection has no linked shop");
        const shop = await lockShop(client, shopId);
        if (!shop) throw new AppError(422, "Shop not found", { shopId });
        if (shop.status !== "Active" && !imported) {
          throw new AppError(422, "Shop is inactive and cannot receive a collection", { shopId });
        }

        const opening = shop.currentBalance;
        const closing = Number((opening - existing.amount).toFixed(2));
        const approvedBy = body.approvedBy ?? "system";

        await applyCredit(
          client,
          shopId,
          {
            entryDate: existing.collectionDate,
            entryType: "collection",
            referenceType: "collection",
            referenceId: id,
            note: "Collection credit (approved)",
          },
          existing.amount
        );

        await client.query(
          `UPDATE collections SET
             status='Approved', is_financial=TRUE,
             approved_by=$2, approved_at=NOW(),
             opening_balance=$3, closing_balance=$4
           WHERE id = $1`,
          [id, approvedBy, opening, closing]
        );
        return await loadOne(client, id);
      } catch (err) {
        rethrowIfAppError(err);
        throw err;
      }
    });
  },

  /** Approve a selected set in order; each approval remains idempotent and
   * uses the same shop-ledger transaction and authorization rules as one row. */
  async approveMany(ids: number[], body: { approvedBy?: string } = {}): Promise<CollectionEntry[]> {
    const uniqueIds = [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
    const approved: CollectionEntry[] = [];
    for (const id of uniqueIds) approved.push(await this.approve(id, body));
    return approved;
  },

  /** Reject = no financial effect. If it was previously credit-applied, the
   * credit is reversed exactly once first. */
  async reject(id: number, body: { rejectedBy?: string; reason?: string } = {}): Promise<CollectionEntry> {
    return withTransaction(async (client) => {
      try {
        const lockRow = await client.query<{ id: number }>(
          `${SEL} WHERE id = $1 FOR UPDATE`,
          [id]
        );
        if (!lockRow.rowCount) throw new AppError(404, "Collection not found");
        const existing = mapEntry(lockRow.rows[0]);
        if (existing.deleted) throw new AppError(409, "Cannot reject a deleted collection");

        if (existing.isFinancial && existing.shopId != null) {
          const shop = await lockShop(client, existing.shopId);
          if (!shop) throw new AppError(422, "Shop not found", { shopId: existing.shopId });
          await applyDebit(
            client,
            existing.shopId,
            {
              entryDate: existing.collectionDate,
              entryType: "correction",
              referenceType: "collection",
              referenceId: id,
              note: "Collection credit reversed (rejected)",
            },
            existing.amount
          );
        }

        await client.query(
          `UPDATE collections SET
             status='Rejected', is_financial=FALSE,
             rejected_by=$2, rejected_at=NOW(), rejected_reason=$3,
             approved_by=NULL, approved_at=NULL
           WHERE id = $1`,
          [id, body.rejectedBy ?? "system", body.reason ?? null]
        );
        return await loadOne(client, id);
      } catch (err) {
        rethrowIfAppError(err);
        throw err;
      }
    });
  },

  /** Soft delete — idempotent. If financially effective, reverses the credit
   * exactly once; a second delete never reverses again. */
  async softDelete(id: number, body: { reason?: string; deletedBy?: string } = {}): Promise<CollectionEntry> {
    return withTransaction(async (client) => {
      try {
        const lockRow = await client.query<{ id: number }>(
          `${SEL} WHERE id = $1 FOR UPDATE`,
          [id]
        );
        if (!lockRow.rowCount) throw new AppError(404, "Collection not found");
        const existing = mapEntry(lockRow.rows[0]);

        if (existing.deleted && !existing.isFinancial) {
          return existing; // idempotent — already soft-deleted, nothing to reverse
        }

        const approved = existing.status === "Approved" || existing.isFinancial;
        if (approved) {
          assertCollectionApprovedDeleteWindowOpen(
            existing.approvedAt ?? existing.createdAt,
            existing.collectionNo
          );
        }

        if (existing.isFinancial && existing.shopId != null) {
          const shop = await lockShop(client, existing.shopId);
          if (!shop) throw new AppError(422, "Shop not found", { shopId: existing.shopId });
          await applyDebit(
            client,
            existing.shopId,
            {
              entryDate: existing.collectionDate,
              entryType: "correction",
              referenceType: "collection",
              referenceId: id,
              note: "Collection credit reversed (deleted)",
            },
            existing.amount
          );
        }

        await client.query(
          `UPDATE collections SET
             deleted=TRUE, is_financial=FALSE, status='Deleted',
             deleted_by=$2, deleted_at=NOW(), deleted_reason=$3,
             approved_by=NULL, approved_at=NULL
           WHERE id = $1`,
          [id, body.deletedBy ?? "system", body.reason ?? null]
        );
        return await loadOne(client, id);
      } catch (err) {
        rethrowIfAppError(err);
        throw err;
      }
    });
  },

  /** Dispatch a status patch to the typed, idempotent transitions. */
  async updateStatus(id: number, body: unknown): Promise<CollectionEntry> {
    const patch = body as { status?: string; approvedBy?: string; rejectedBy?: string; reason?: string; deletedBy?: string };
    const status = String(patch?.status ?? "");
    if (status === "Approved") return this.approve(id, { approvedBy: patch?.approvedBy });
    if (status === "Rejected") return this.reject(id, { rejectedBy: patch?.rejectedBy, reason: patch?.reason });
    if (status === "Deleted") return this.softDelete(id, { reason: patch?.reason, deletedBy: patch?.deletedBy });
    if (status === "Pending Approval" || status === "Pending") {
      return withTransaction(async (client) => {
        await client.query(
          `UPDATE collections SET status='Pending Approval', is_financial=FALSE,
             rejected_by=NULL, rejected_at=NULL, rejected_reason=NULL, deleted=FALSE
           WHERE id = $1 AND deleted=FALSE`,
          [id]
        );
        return loadOne(client, id);
      });
    }
    if (status === "Draft") {
      return withTransaction(async (client) => {
        await client.query(
          `UPDATE collections SET status='Draft' WHERE id = $1 AND deleted=FALSE`,
          [id]
        );
        return loadOne(client, id);
      });
    }
    throw new AppError(400, `Invalid status. Use: Pending Approval | Approved | Rejected | Deleted | Draft`);
  },
};
