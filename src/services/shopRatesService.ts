import { query } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import type { ShopRate } from "../types/operations.js";
import { dateOnly, num, str } from "../utils/coerce.js";
import {
  approvalFields,
  assertOpsStatus,
  parseBody,
  shopRateBodySchema,
} from "../validation/operations.js";

function mapShopRate(row: Record<string, unknown>): ShopRate {
  return {
    id: num(row.id),
    shopId: row.shop_id == null ? null : num(row.shop_id),
    shopName: str(row.shop_name),
    birdTypeId: row.bird_type_id == null ? null : num(row.bird_type_id),
    birdType: str(row.bird_type),
    rate: num(row.rate),
    effectiveFrom: dateOnly(row.effective_from) ?? "",
    effectiveTo: dateOnly(row.effective_to),
    remarks: str(row.remarks),
    status: str(row.status) as ShopRate["status"],
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

export const shopRatesService = {
  async list(filters: {
    shopId?: number;
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
    if (filters.status) {
      params.push(filters.status);
      clauses.push(`status = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await query(
      `SELECT * FROM shop_rates ${where} ORDER BY effective_from DESC, id DESC`,
      params
    );
    return result.rows.map(mapShopRate);
  },

  async getById(id: number) {
    const result = await query(`SELECT * FROM shop_rates WHERE id = $1`, [id]);
    if (!result.rowCount) throw new AppError(404, "Shop rate not found");
    return mapShopRate(result.rows[0]);
  },

  async create(body: unknown) {
    const data = parseBody(shopRateBodySchema, body);
    const result = await query(
      `INSERT INTO shop_rates (
         shop_id, shop_name, bird_type_id, bird_type, rate,
         effective_from, effective_to, remarks, status, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        data.shopId ?? null,
        data.shopName ?? "",
        data.birdTypeId ?? null,
        data.birdType ?? "",
        data.rate,
        data.effectiveFrom,
        data.effectiveTo ?? null,
        data.remarks ?? "",
        data.status ?? "Draft",
        data.createdBy ?? "",
      ]
    );
    return mapShopRate(result.rows[0]);
  },

  async update(id: number, body: unknown) {
    const data = parseBody(shopRateBodySchema.partial(), body);
    const result = await query(
      `UPDATE shop_rates SET
         shop_id = COALESCE($2, shop_id),
         shop_name = COALESCE($3, shop_name),
         bird_type_id = COALESCE($4, bird_type_id),
         bird_type = COALESCE($5, bird_type),
         rate = COALESCE($6, rate),
         effective_from = COALESCE($7, effective_from),
         effective_to = COALESCE($8, effective_to),
         remarks = COALESCE($9, remarks),
         status = COALESCE($10, status),
         created_by = COALESCE($11, created_by)
       WHERE id = $1 AND deleted = FALSE
       RETURNING *`,
      [
        id,
        data.shopId ?? null,
        data.shopName ?? null,
        data.birdTypeId ?? null,
        data.birdType ?? null,
        data.rate ?? null,
        data.effectiveFrom ?? null,
        data.effectiveTo ?? null,
        data.remarks ?? null,
        data.status ?? null,
        data.createdBy ?? null,
      ]
    );
    if (!result.rowCount) throw new AppError(404, "Shop rate not found");
    return mapShopRate(result.rows[0]);
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
      `UPDATE shop_rates SET
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
    if (!result.rowCount) throw new AppError(404, "Shop rate not found");
    return mapShopRate(result.rows[0]);
  },

  async softDelete(id: number, reason?: string) {
    return this.updateStatus(id, { status: "Deleted", reason });
  },
};
