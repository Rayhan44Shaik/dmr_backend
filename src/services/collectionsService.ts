import { query } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import type { Collection, RunningBalanceRow } from "../types/operations.js";
import { dateOnly, num, str } from "../utils/coerce.js";
import {
  assertOpsStatus,
  collectionBodySchema,
  parseBody,
} from "../validation/operations.js";

/**
 * Collections are derived from trip_deliveries on completed trips.
 * - amount_due = delivery.amount
 * - amount_collected = amount when trip.rate_completed, else 0
 * No collections table.
 */
function mapCollection(row: Record<string, unknown>): Collection {
  const amountDue = num(row.amount);
  const rateCompleted = Boolean(row.rate_completed);
  const amountCollected = rateCompleted ? amountDue : 0;
  const tripStatus = str(row.trip_status);
  const deleted = Boolean(row.trip_deleted);
  let status: Collection["status"] = "Draft";
  if (deleted || tripStatus === "Deleted") status = "Deleted";
  else if (tripStatus === "Completed" && rateCompleted) status = "Approved";
  else if (tripStatus === "Completed") status = "Pending Approval";
  else if (tripStatus === "Pending") status = "Pending Approval";

  return {
    id: num(row.id),
    collectionNo: `COL-TD-${num(row.id)}`,
    collectionDate: dateOnly(row.trip_date) ?? "",
    shopId: row.shop_id == null ? null : num(row.shop_id),
    shopName: str(row.shop_name),
    saleId: num(row.id),
    tripId: row.trip_id == null ? null : num(row.trip_id),
    amountDue,
    amountCollected,
    paymentMode: "Trip Delivery",
    referenceNo: str(row.trip_no),
    remarks: str(row.remarks),
    status,
    deleted,
    approvedBy: row.approved_by == null ? null : str(row.approved_by),
    approvedAt: row.approved_at == null ? null : str(row.approved_at),
    createdAt: row.created_at == null ? null : str(row.created_at),
    updatedAt: row.updated_at == null ? null : str(row.updated_at),
    balance: amountDue - amountCollected,
  };
}

const COL_SELECT = `
  SELECT d.*, t.trip_date, t.trip_no, t.status AS trip_status,
         t.deleted AS trip_deleted, t.rate_completed, t.approved_by, t.approved_at
  FROM trip_deliveries d
  INNER JOIN trips t ON t.id = d.trip_id
`;

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

    if (!filters.includeDeleted) {
      clauses.push(`COALESCE(t.deleted, FALSE) = FALSE`);
      clauses.push(`t.status <> 'Deleted'`);
    }
    if (filters.shopId) {
      params.push(filters.shopId);
      clauses.push(`d.shop_id = $${params.length}`);
    }
    if (filters.fromDate) {
      params.push(filters.fromDate);
      clauses.push(`t.trip_date >= $${params.length}`);
    }
    if (filters.toDate) {
      params.push(filters.toDate);
      clauses.push(`t.trip_date <= $${params.length}`);
    }
    if (filters.status === "Approved") {
      clauses.push(`t.status = 'Completed' AND t.rate_completed = TRUE`);
    } else if (filters.status === "Pending Approval") {
      clauses.push(`t.status IN ('Pending', 'Completed') AND COALESCE(t.rate_completed, FALSE) = FALSE`);
    } else if (filters.status === "Draft") {
      clauses.push(`t.status = 'Draft'`);
    } else if (filters.status === "Deleted") {
      clauses.push(`(t.status = 'Deleted' OR t.deleted = TRUE)`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await query(
      `${COL_SELECT} ${where} ORDER BY t.trip_date DESC, d.id DESC`,
      params
    );
    return result.rows.map(mapCollection);
  },

  async pending(shopId?: number) {
    const params: unknown[] = [];
    let shopClause = "";
    if (shopId) {
      params.push(shopId);
      shopClause = `AND d.shop_id = $${params.length}`;
    }
    const result = await query(
      `${COL_SELECT}
       WHERE COALESCE(t.deleted, FALSE) = FALSE
         AND t.status = 'Completed'
         AND COALESCE(t.rate_completed, FALSE) = FALSE
         AND COALESCE(d.amount, 0) > 0
         ${shopClause}
       ORDER BY t.trip_date DESC, d.id DESC`,
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
    let shopFilter = "";
    if (shopId) {
      params.push(shopId);
      shopFilter = `AND d.shop_id = $${params.length}`;
    }

    const result = await query(
      `SELECT
         d.shop_id,
         COALESCE(d.shop_name, s.shop_name, '') AS shop_name,
         COALESCE(SUM(d.amount), 0) AS total_sales,
         COALESCE(SUM(d.amount) FILTER (WHERE t.rate_completed = TRUE), 0) AS total_collected,
         COALESCE(SUM(d.amount) FILTER (WHERE COALESCE(t.rate_completed, FALSE) = FALSE), 0)
           AS pending_amount
       FROM trip_deliveries d
       INNER JOIN trips t ON t.id = d.trip_id
       LEFT JOIN shops s ON s.id = d.shop_id
       WHERE t.status = 'Completed'
         AND COALESCE(t.deleted, FALSE) = FALSE
         ${shopFilter}
       GROUP BY d.shop_id, COALESCE(d.shop_name, s.shop_name, '')
       ORDER BY 2`,
      params
    );

    return result.rows.map((row) => {
      const totalSales = num(row.total_sales);
      const totalCollected = num(row.total_collected);
      return {
        shopId: row.shop_id == null ? null : num(row.shop_id),
        shopName: str(row.shop_name),
        totalSales,
        totalCollected,
        pendingAmount: num(row.pending_amount),
        runningBalance: totalSales - totalCollected,
      };
    });
  },

  async getById(id: number) {
    const result = await query(`${COL_SELECT} WHERE d.id = $1`, [id]);
    if (!result.rowCount) throw new AppError(404, "Collection not found");
    return mapCollection(result.rows[0]);
  },

  async create(body: unknown) {
    const data = parseBody(collectionBodySchema, body);
    if (!data.tripId && !data.saleId) {
      throw new AppError(
        400,
        "tripId or saleId (trip_deliveries.id) is required — collections are derived from deliveries"
      );
    }

    let tripId = data.tripId ?? null;
    if (data.saleId) {
      const delivery = await query<{ trip_id: number }>(
        `SELECT trip_id FROM trip_deliveries WHERE id = $1`,
        [data.saleId]
      );
      if (!delivery.rowCount) throw new AppError(404, "Delivery/sale not found");
      tripId = num(delivery.rows[0].trip_id);
    }

    // Mark trip rates completed when a collection is recorded
    const collected = data.amountCollected ?? 0;
    const due = data.amountDue ?? 0;
    const rateCompleted = due > 0 ? collected >= due : collected > 0;

    await query(
      `UPDATE trips SET rate_completed = $2, status = CASE
         WHEN status = 'Draft' THEN 'Pending'::trip_status
         ELSE status
       END
       WHERE id = $1`,
      [tripId, rateCompleted]
    );

    if (data.saleId) return this.getById(data.saleId);

    const first = await query(
      `SELECT id FROM trip_deliveries WHERE trip_id = $1 ORDER BY id LIMIT 1`,
      [tripId]
    );
    if (!first.rowCount) {
      throw new AppError(404, "No trip deliveries found for collection");
    }
    return this.getById(num(first.rows[0].id));
  },

  async update(id: number, body: unknown) {
    const data = parseBody(collectionBodySchema.partial(), body);
    const delivery = await query<{ trip_id: number }>(
      `SELECT trip_id FROM trip_deliveries WHERE id = $1`,
      [id]
    );
    if (!delivery.rowCount) throw new AppError(404, "Collection not found");
    const tripId = num(delivery.rows[0].trip_id);

    if (data.amountDue != null || data.shopId != null || data.shopName != null) {
      await query(
        `UPDATE trip_deliveries SET
           amount = COALESCE($2, amount),
           shop_id = COALESCE($3, shop_id),
           shop_name = COALESCE($4, shop_name)
         WHERE id = $1`,
        [id, data.amountDue ?? null, data.shopId ?? null, data.shopName ?? null]
      );
    }

    if (data.amountCollected != null || data.amountDue != null) {
      const current = await this.getById(id);
      const due = data.amountDue ?? current.amountDue;
      const collected = data.amountCollected ?? current.amountCollected;
      await query(`UPDATE trips SET rate_completed = $2 WHERE id = $1`, [
        tripId,
        due > 0 && collected >= due,
      ]);
    }

    return this.getById(id);
  },

  async updateStatus(id: number, body: unknown) {
    const status = String((body as { status?: string })?.status ?? "");
    assertOpsStatus(status);
    const delivery = await query<{ trip_id: number }>(
      `SELECT trip_id FROM trip_deliveries WHERE id = $1`,
      [id]
    );
    if (!delivery.rowCount) throw new AppError(404, "Collection not found");
    const tripId = num(delivery.rows[0].trip_id);
    const patch = body as { approvedBy?: string; reason?: string };

    if (status === "Approved") {
      await query(
        `UPDATE trips SET status = 'Completed', rate_completed = TRUE, deleted = FALSE,
           approved_by = COALESCE($2, approved_by), approved_at = NOW()
         WHERE id = $1`,
        [tripId, patch.approvedBy ?? "system"]
      );
    } else if (status === "Pending Approval") {
      await query(
        `UPDATE trips SET status = 'Pending', rate_completed = FALSE, deleted = FALSE WHERE id = $1`,
        [tripId]
      );
    } else if (status === "Deleted") {
      await query(
        `UPDATE trips SET status = 'Deleted', deleted = TRUE, deleted_reason = $2 WHERE id = $1`,
        [tripId, patch.reason ?? null]
      );
    } else {
      await query(
        `UPDATE trips SET status = 'Draft', rate_completed = FALSE, deleted = FALSE WHERE id = $1`,
        [tripId]
      );
    }
    return this.getById(id);
  },

  async softDelete(id: number, reason?: string) {
    return this.updateStatus(id, { status: "Deleted", reason });
  },
};
