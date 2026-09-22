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
import { rethrowIfAppError } from "../utils/pgErrors.js";
import {
  applyCorrection,
  applyCredit,
  applyDebit,
  lockShop,
} from "../utils/shopLedger.js";
import { parseBody } from "../validation/operations.js";
import { collectionEntryUpdateSchema } from "../validation/collectionEntry.js";
import { parseCollectionEntryBody } from "../validation/collectionEntry.js";

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
  return {
    id: num(row.id),
    collectionNo: str(row.collection_no),
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

function collectionWeekBounds(input?: string) {
  const parsed = input && /^\d{4}-\d{2}-\d{2}$/.test(input) ? new Date(`${input}T00:00:00Z`) : new Date();
  if (Number.isNaN(parsed.getTime())) throw new AppError(400, "Invalid date");
  const day = parsed.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(parsed);
  start.setUTCDate(start.getUTCDate() + mondayOffset);
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

async function loadOne(client: Client, id: number): Promise<CollectionEntry> {
  const result = await client.query(`${SEL} WHERE id = $1`, [id]);
  if (!result.rowCount) throw new AppError(404, "Collection not found");
  return mapEntry(result.rows[0]);
}

export const collectionEntryService = {
  async weekBounds(date?: string) {
    return collectionWeekBounds(date);
  },

  async pendingSummary(date?: string) {
    const bounds = collectionWeekBounds(date);
    const result = await query(
      `SELECT s.id AS shop_id, s.shop_name, COALESCE(s.current_balance, 0) AS balance,
              COALESCE(ws.amount, 0) AS weekly_sales,
              COALESCE(ac.amount, 0) AS approved_collections,
              COALESCE(pc.amount, 0) AS pending_collections,
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
           SELECT SUM(COALESCE(c.amount, c.amount_collected, 0)) AS amount
             FROM collections c WHERE c.shop_id = s.id AND COALESCE(c.deleted, FALSE) = FALSE
              AND COALESCE(c.is_financial, FALSE) = TRUE
              AND c.collection_date BETWEEN $1::date AND $2::date
         ) ac ON TRUE
         LEFT JOIN LATERAL (
           SELECT SUM(COALESCE(c.amount, c.amount_collected, 0)) AS amount
             FROM collections c WHERE c.shop_id = s.id AND COALESCE(c.deleted, FALSE) = FALSE
              AND COALESCE(c.is_financial, FALSE) = FALSE AND c.status = 'Pending Approval'
              AND c.collection_date BETWEEN $1::date AND $2::date
         ) pc ON TRUE
         LEFT JOIN LATERAL (
           SELECT MAX(c.collection_date) AS last_collection_date
             FROM collections c WHERE c.shop_id = s.id AND COALESCE(c.deleted, FALSE) = FALSE
              AND COALESCE(c.is_financial, FALSE) = TRUE
         ) lc ON TRUE
        WHERE s.status = 'Active'
        ORDER BY s.shop_name`,
      [bounds.weekStart, bounds.weekEnd]
    );
    const shops = result.rows.map((row) => {
      const weeklySales = num(row.weekly_sales);
      const approved = num(row.approved_collections);
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
      clauses.push(`collections.status = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    if (filters.pagination) {
      const countResult = await query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM collections ${where}`,
        params
      );
      const total = Number(countResult.rows[0]?.c ?? 0);
      const pagedParams = [...params, filters.pagination.limit, filters.pagination.offset];
      const result = await query(
        `${SEL} ${where}
         ORDER BY collections.collection_date DESC, collections.id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        pagedParams
      );
      return paginatedResult(result.rows.map(mapEntry), total, filters.pagination);
    }

    const result = await query(
      `${SEL} ${where} ORDER BY collections.collection_date DESC, collections.id DESC`,
      params
    );
    return result.rows.map(mapEntry);
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
        const currentOutstanding = shop.currentBalance;
        if (data.amount > currentOutstanding) {
          throw new AppError(
            409,
            `Collection ₹${data.amount} exceeds the shop's outstanding balance ₹${currentOutstanding}`
          );
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
        const lockRow = await client.query<{ id: number }>(
          `${SEL} WHERE id = $1 FOR UPDATE`,
          [id]
        );
        if (!lockRow.rowCount) throw new AppError(404, "Collection not found");
        const existing = mapEntry(lockRow.rows[0]);
        if (existing.deleted) throw new AppError(409, "Cannot edit a deleted collection");

        const newAmount = data.amount !== undefined ? data.amount : existing.amount;
        const newDate = data.collectionDate !== undefined ? dateOnly(data.collectionDate) : existing.collectionDate;
        if (!newDate) throw new AppError(400, "Invalid collection date");
        const shopId = existing.shopId;

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
        const lockRow = await client.query<{ id: number }>(
          `${SEL} WHERE id = $1 FOR UPDATE`,
          [id]
        );
        if (!lockRow.rowCount) throw new AppError(404, "Collection not found");
        const existing = mapEntry(lockRow.rows[0]);

        if (existing.deleted) throw new AppError(409, "Cannot approve a deleted collection");
        if (existing.isFinancial) return existing; // idempotent

        const shopId = existing.shopId;
        if (shopId == null) throw new AppError(422, "Collection has no linked shop");
        const shop = await lockShop(client, shopId);
        if (!shop) throw new AppError(422, "Shop not found", { shopId });
        if (shop.status !== "Active") {
          throw new AppError(422, "Shop is inactive and cannot receive a collection", { shopId });
        }

        const opening = shop.currentBalance;
        if (existing.amount > opening) {
          throw new AppError(
            409,
            `Collection ₹${existing.amount} exceeds the shop's outstanding balance ₹${opening}`
          );
        }
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
