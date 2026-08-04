import { query } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import type { ShopSale } from "../types/operations.js";
import { dateOnly, num, str } from "../utils/coerce.js";
import { nextDocNo } from "../utils/operationsHelpers.js";
import {
  approvalFields,
  assertOpsStatus,
  parseBody,
  shopSaleBodySchema,
} from "../validation/operations.js";

function mapShopSale(row: Record<string, unknown>): ShopSale {
  return {
    id: num(row.id),
    saleNo: str(row.sale_no),
    saleDate: dateOnly(row.sale_date) ?? "",
    shopId: row.shop_id == null ? null : num(row.shop_id),
    shopName: str(row.shop_name),
    birdTypeId: row.bird_type_id == null ? null : num(row.bird_type_id),
    birdType: str(row.bird_type),
    tripId: row.trip_id == null ? null : num(row.trip_id),
    birds: num(row.birds),
    weight: num(row.weight),
    rate: num(row.rate),
    amount: num(row.amount),
    mortality: num(row.mortality),
    remarks: str(row.remarks),
    status: str(row.status) as ShopSale["status"],
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
  };
}

export const shopSalesService = {
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
      clauses.push(`sale_date >= $${params.length}`);
    }
    if (filters.toDate) {
      params.push(filters.toDate);
      clauses.push(`sale_date <= $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      clauses.push(`status = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await query(
      `SELECT * FROM shop_sales ${where} ORDER BY sale_date DESC, id DESC`,
      params
    );
    return result.rows.map(mapShopSale);
  },

  async getById(id: number) {
    const result = await query(`SELECT * FROM shop_sales WHERE id = $1`, [id]);
    if (!result.rowCount) throw new AppError(404, "Shop sale not found");
    return mapShopSale(result.rows[0]);
  },

  async create(body: unknown) {
    const data = parseBody(shopSaleBodySchema, body);
    const birds = data.birds ?? 0;
    const weight = data.weight ?? 0;
    const rate = data.rate ?? 0;
    const amount = data.amount ?? Number((birds && rate ? weight * rate : weight * rate).toFixed(2));
    const saleNo = data.saleNo || (await nextDocNo(null, "SALE", "shop_sales", "sale_no"));

    const result = await query(
      `INSERT INTO shop_sales (
         sale_no, sale_date, shop_id, shop_name, bird_type_id, bird_type,
         trip_id, birds, weight, rate, amount, mortality, remarks, status, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [
        saleNo,
        data.saleDate,
        data.shopId ?? null,
        data.shopName ?? "",
        data.birdTypeId ?? null,
        data.birdType ?? "",
        data.tripId ?? null,
        birds,
        weight,
        rate,
        amount,
        data.mortality ?? 0,
        data.remarks ?? "",
        data.status ?? "Draft",
        data.createdBy ?? "",
      ]
    );
    return mapShopSale(result.rows[0]);
  },

  async update(id: number, body: unknown) {
    const data = parseBody(shopSaleBodySchema.partial(), body);
    const result = await query(
      `UPDATE shop_sales SET
         sale_date = COALESCE($2, sale_date),
         shop_id = COALESCE($3, shop_id),
         shop_name = COALESCE($4, shop_name),
         bird_type_id = COALESCE($5, bird_type_id),
         bird_type = COALESCE($6, bird_type),
         trip_id = COALESCE($7, trip_id),
         birds = COALESCE($8, birds),
         weight = COALESCE($9, weight),
         rate = COALESCE($10, rate),
         amount = COALESCE($11, amount),
         mortality = COALESCE($12, mortality),
         remarks = COALESCE($13, remarks),
         status = COALESCE($14, status),
         created_by = COALESCE($15, created_by)
       WHERE id = $1 AND deleted = FALSE
       RETURNING *`,
      [
        id,
        data.saleDate ?? null,
        data.shopId ?? null,
        data.shopName ?? null,
        data.birdTypeId ?? null,
        data.birdType ?? null,
        data.tripId ?? null,
        data.birds ?? null,
        data.weight ?? null,
        data.rate ?? null,
        data.amount ?? null,
        data.mortality ?? null,
        data.remarks ?? null,
        data.status ?? null,
        data.createdBy ?? null,
      ]
    );
    if (!result.rowCount) throw new AppError(404, "Shop sale not found");
    return mapShopSale(result.rows[0]);
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
      `UPDATE shop_sales SET
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
    if (!result.rowCount) throw new AppError(404, "Shop sale not found");
    return mapShopSale(result.rows[0]);
  },

  async softDelete(id: number, reason?: string) {
    return this.updateStatus(id, { status: "Deleted", reason });
  },
};
