import { query } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import type { Collection, RunningBalanceRow } from "../types/operations.js";
import { dateOnly, num, str } from "../utils/coerce.js";
import { nextDocNo } from "../utils/operationsHelpers.js";
import {
  approvalFields,
  assertOpsStatus,
  collectionBodySchema,
  parseBody,
} from "../validation/operations.js";

function mapCollection(row: Record<string, unknown>): Collection {
  const amountDue = num(row.amount_due);
  const amountCollected = num(row.amount_collected);
  return {
    id: num(row.id),
    collectionNo: str(row.collection_no),
    collectionDate: dateOnly(row.collection_date) ?? "",
    shopId: row.shop_id == null ? null : num(row.shop_id),
    shopName: str(row.shop_name),
    saleId: row.sale_id == null ? null : num(row.sale_id),
    tripId: row.trip_id == null ? null : num(row.trip_id),
    amountDue,
    amountCollected,
    paymentMode: str(row.payment_mode),
    referenceNo: str(row.reference_no),
    remarks: str(row.remarks),
    status: str(row.status) as Collection["status"],
    deleted: Boolean(row.deleted),
    deletedReason: row.deleted_reason == null ? null : str(row.deleted_reason),
    approvedBy: row.approved_by == null ? null : str(row.approved_by),
    approvedAt: row.approved_at == null ? null : str(row.approved_at),
    rejectedBy: row.rejected_by == null ? null : str(row.rejected_by),
    rejectedAt: row.rejected_at == null ? null : str(row.rejected_at),
    rejectedReason: row.rejected_reason == null ? null : str(row.rejected_reason),
    createdBy: str(row.created_by),
    createdAt: row.created_at == null ? null : str(row.created_at),
    updatedAt: row.updated_at == null ? null : str(row.updated_at),
    balance: amountDue - amountCollected,
  };
}

export const collectionsService = {
  async list(filters: {
    shopId?: number;
    fromDate?: string;
    toDate?: string;
    status?: string;
    includeDeleted?: boolean;
  } = {}) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (!filters.includeDeleted) clauses.push(`deleted = FALSE`);
    if (filters.shopId) {
      params.push(filters.shopId);
      clauses.push(`shop_id = $${params.length}`);
    }
    if (filters.fromDate) {
      params.push(filters.fromDate);
      clauses.push(`collection_date >= $${params.length}`);
    }
    if (filters.toDate) {
      params.push(filters.toDate);
      clauses.push(`collection_date <= $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      clauses.push(`status = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await query(
      `SELECT * FROM collections ${where} ORDER BY collection_date DESC, id DESC`,
      params
    );
    return result.rows.map(mapCollection);
  },

  /** Pending = approved collections with remaining balance, plus approved sales without full collection */
  async pending(shopId?: number) {
    const params: unknown[] = [];
    let shopClause = "";
    if (shopId) {
      params.push(shopId);
      shopClause = `AND c.shop_id = $${params.length}`;
    }
    const result = await query(
      `SELECT c.*
       FROM collections c
       WHERE c.deleted = FALSE
         AND c.status = 'Approved'
         AND c.amount_due > c.amount_collected
         ${shopClause}
       ORDER BY c.collection_date DESC, c.id DESC`,
      params
    );
    return result.rows.map(mapCollection);
  },

  async register(filters: {
    fromDate?: string;
    toDate?: string;
    shopId?: number;
  } = {}) {
    return this.list({
      ...filters,
      status: "Approved",
      includeDeleted: false,
    });
  },

  async runningBalance(shopId?: number): Promise<RunningBalanceRow[]> {
    const params: unknown[] = [];
    let shopFilterSales = "";
    let shopFilterCollections = "";
    if (shopId) {
      params.push(shopId);
      shopFilterSales = `AND shop_id = $${params.length}`;
      shopFilterCollections = `AND shop_id = $${params.length}`;
    }

    const result = await query(
      `WITH sales AS (
         SELECT shop_id, COALESCE(shop_name, '') AS shop_name, COALESCE(SUM(amount), 0) AS total_sales
         FROM shop_sales
         WHERE deleted = FALSE AND status = 'Approved' ${shopFilterSales}
         GROUP BY shop_id, shop_name
       ),
       cols AS (
         SELECT shop_id, COALESCE(SUM(amount_collected), 0) AS total_collected
         FROM collections
         WHERE deleted = FALSE AND status = 'Approved' ${shopFilterCollections}
         GROUP BY shop_id
       )
       SELECT
         s.shop_id,
         s.shop_name,
         s.total_sales,
         COALESCE(c.total_collected, 0) AS total_collected,
         GREATEST(s.total_sales - COALESCE(c.total_collected, 0), 0) AS pending_amount,
         s.total_sales - COALESCE(c.total_collected, 0) AS running_balance
       FROM sales s
       LEFT JOIN cols c ON c.shop_id IS NOT DISTINCT FROM s.shop_id
       ORDER BY s.shop_name`,
      params
    );

    return result.rows.map((row) => ({
      shopId: row.shop_id == null ? null : num(row.shop_id),
      shopName: str(row.shop_name),
      totalSales: num(row.total_sales),
      totalCollected: num(row.total_collected),
      pendingAmount: num(row.pending_amount),
      runningBalance: num(row.running_balance),
    }));
  },

  async getById(id: number) {
    const result = await query(`SELECT * FROM collections WHERE id = $1`, [id]);
    if (!result.rowCount) throw new AppError(404, "Collection not found");
    return mapCollection(result.rows[0]);
  },

  async create(body: unknown) {
    const data = parseBody(collectionBodySchema, body);
    const collectionNo =
      data.collectionNo || (await nextDocNo(null, "COL", "collections", "collection_no"));
    const result = await query(
      `INSERT INTO collections (
         collection_no, collection_date, shop_id, shop_name, sale_id, trip_id,
         amount_due, amount_collected, payment_mode, reference_no, remarks, status, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        collectionNo,
        data.collectionDate,
        data.shopId ?? null,
        data.shopName ?? "",
        data.saleId ?? null,
        data.tripId ?? null,
        data.amountDue ?? 0,
        data.amountCollected ?? 0,
        data.paymentMode ?? "Cash",
        data.referenceNo ?? "",
        data.remarks ?? "",
        data.status ?? "Draft",
        data.createdBy ?? "",
      ]
    );
    return mapCollection(result.rows[0]);
  },

  async update(id: number, body: unknown) {
    const data = parseBody(collectionBodySchema.partial(), body);
    const result = await query(
      `UPDATE collections SET
         collection_date = COALESCE($2, collection_date),
         shop_id = COALESCE($3, shop_id),
         shop_name = COALESCE($4, shop_name),
         sale_id = COALESCE($5, sale_id),
         trip_id = COALESCE($6, trip_id),
         amount_due = COALESCE($7, amount_due),
         amount_collected = COALESCE($8, amount_collected),
         payment_mode = COALESCE($9, payment_mode),
         reference_no = COALESCE($10, reference_no),
         remarks = COALESCE($11, remarks),
         status = COALESCE($12, status),
         created_by = COALESCE($13, created_by)
       WHERE id = $1 AND deleted = FALSE
       RETURNING *`,
      [
        id,
        data.collectionDate ?? null,
        data.shopId ?? null,
        data.shopName ?? null,
        data.saleId ?? null,
        data.tripId ?? null,
        data.amountDue ?? null,
        data.amountCollected ?? null,
        data.paymentMode ?? null,
        data.referenceNo ?? null,
        data.remarks ?? null,
        data.status ?? null,
        data.createdBy ?? null,
      ]
    );
    if (!result.rowCount) throw new AppError(404, "Collection not found");
    return mapCollection(result.rows[0]);
  },

  async updateStatus(id: number, body: unknown) {
    const status = String((body as { status?: string })?.status ?? "");
    assertOpsStatus(status);
    const patch = body as {
      approvedBy?: string;
      rejectedBy?: string;
      rejectedReason?: string;
      reason?: string;
    };
    const fields = approvalFields(status, patch);
    const result = await query(
      `UPDATE collections SET
         status = $2,
         approved_by = COALESCE($3, approved_by),
         approved_at = COALESCE($4, approved_at),
         rejected_by = COALESCE($5, rejected_by),
         rejected_at = COALESCE($6, rejected_at),
         rejected_reason = COALESCE($7, rejected_reason),
         deleted = COALESCE($8, deleted),
         deleted_reason = COALESCE($9, deleted_reason)
       WHERE id = $1
       RETURNING *`,
      [
        id,
        status,
        "approved_by" in fields ? fields.approved_by : null,
        "approved_at" in fields ? fields.approved_at : null,
        "rejected_by" in fields ? fields.rejected_by : null,
        "rejected_at" in fields ? fields.rejected_at : null,
        "rejected_reason" in fields ? fields.rejected_reason : null,
        "deleted" in fields ? fields.deleted : null,
        "deleted_reason" in fields ? fields.deleted_reason : null,
      ]
    );
    if (!result.rowCount) throw new AppError(404, "Collection not found");
    return mapCollection(result.rows[0]);
  },

  async softDelete(id: number, reason?: string) {
    return this.updateStatus(id, { status: "Deleted", reason });
  },
};
