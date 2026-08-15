import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import type { ShopRate } from "../types/operations.js";
import { dateOnly, num, str } from "../utils/coerce.js";
import {
  assertBirdTypeExists,
  assertShopExists,
} from "../utils/fkValidation.js";
import {
  paginatedResult,
  type PaginatedResult,
  type PaginationParams,
} from "../utils/pagination.js";
import { rethrowIfAppError } from "../utils/pgErrors.js";
import {
  assertOpsStatus,
  parseBody,
  shopRateBodySchema,
} from "../validation/operations.js";

function mapRate(row: Record<string, unknown>): ShopRate {
  const tripStatus = str(row.trip_status || "Completed");
  const deleted = Boolean(row.trip_deleted);
  let status: ShopRate["status"] = "Approved";
  if (deleted || tripStatus === "Deleted") status = "Deleted";
  else if (tripStatus === "Pending") status = "Pending Approval";
  else if (tripStatus === "Draft") status = "Draft";
  else if (tripStatus === "Completed") status = "Approved";

  return {
    id: num(row.id),
    shopId: row.shop_id == null ? null : num(row.shop_id),
    shopName: str(row.shop_name),
    birdTypeId: row.bird_type_id == null ? null : num(row.bird_type_id),
    birdType: str(row.bird_type),
    rate: num(row.rate),
    effectiveFrom: dateOnly(row.effective_from) ?? dateOnly(row.trip_date) ?? "",
    effectiveTo: null,
    remarks: str(row.remarks),
    status,
    deleted,
    createdAt: row.created_at == null ? null : str(row.created_at),
    updatedAt: row.updated_at == null ? null : str(row.updated_at),
  };
}

/**
 * Shop rates derived from trip_deliveries historical rates.
 * No shop_rates table.
 */
export const shopRatesService = {
  async list(
    filters: {
      shopId?: number;
      status?: string;
      includeDeleted?: boolean;
      pagination?: PaginationParams | null;
    } = {}
  ): Promise<ShopRate[] | PaginatedResult<ShopRate>> {
    const clauses: string[] = [`d.rate IS NOT NULL`];
    const params: unknown[] = [];

    if (!filters.includeDeleted) {
      clauses.push(`COALESCE(t.deleted, FALSE) = FALSE`);
      clauses.push(`t.status <> 'Deleted'`);
    }
    if (filters.shopId) {
      params.push(filters.shopId);
      clauses.push(`d.shop_id = $${params.length}`);
    }
    if (filters.status === "Approved") clauses.push(`t.status = 'Completed'`);
    else if (filters.status === "Pending Approval") clauses.push(`t.status = 'Pending'`);
    else if (filters.status === "Draft") clauses.push(`t.status = 'Draft'`);
    else if (filters.status === "Deleted") {
      clauses.push(`(t.status = 'Deleted' OR t.deleted = TRUE)`);
    }

    const where = `WHERE ${clauses.join(" AND ")}`;

    if (filters.pagination) {
      const countSql = `
        SELECT COUNT(*)::text AS c FROM (
          SELECT DISTINCT ON (d.shop_id, d.bird_type_id, d.rate) d.id
          FROM trip_deliveries d
          INNER JOIN trips t ON t.id = d.trip_id
          ${where}
          ORDER BY d.shop_id, d.bird_type_id, d.rate, t.trip_date DESC, d.id DESC
        ) sub`;
      const countResult = await query<{ c: string }>(countSql, params);
      const total = Number(countResult.rows[0]?.c ?? 0);
      const pagedParams = [...params, filters.pagination.limit, filters.pagination.offset];
      const result = await query(
        `SELECT DISTINCT ON (d.shop_id, d.bird_type_id, d.rate)
           d.id, d.shop_id, d.shop_name, d.bird_type_id, d.bird_type, d.rate,
           d.remarks, d.created_at, d.updated_at,
           t.trip_date AS effective_from, t.trip_date, t.status AS trip_status,
           t.deleted AS trip_deleted
         FROM trip_deliveries d
         INNER JOIN trips t ON t.id = d.trip_id
         ${where}
         ORDER BY d.shop_id, d.bird_type_id, d.rate, t.trip_date DESC, d.id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        pagedParams
      );
      return paginatedResult(result.rows.map(mapRate), total, filters.pagination);
    }

    const result = await query(
      `SELECT DISTINCT ON (d.shop_id, d.bird_type_id, d.rate)
         d.id, d.shop_id, d.shop_name, d.bird_type_id, d.bird_type, d.rate,
         d.remarks, d.created_at, d.updated_at,
         t.trip_date AS effective_from, t.trip_date, t.status AS trip_status,
         t.deleted AS trip_deleted
       FROM trip_deliveries d
       INNER JOIN trips t ON t.id = d.trip_id
       ${where}
       ORDER BY d.shop_id, d.bird_type_id, d.rate, t.trip_date DESC, d.id DESC`,
      params
    );
    return result.rows.map(mapRate);
  },

  async getById(id: number) {
    const result = await query(
      `SELECT d.id, d.shop_id, d.shop_name, d.bird_type_id, d.bird_type, d.rate,
              d.remarks, d.created_at, d.updated_at,
              t.trip_date AS effective_from, t.trip_date, t.status AS trip_status,
              t.deleted AS trip_deleted
       FROM trip_deliveries d
       INNER JOIN trips t ON t.id = d.trip_id
       WHERE d.id = $1`,
      [id]
    );
    if (!result.rowCount) throw new AppError(404, "Shop rate not found");
    return mapRate(result.rows[0]);
  },

  async create(body: unknown) {
    const data = parseBody(shopRateBodySchema, body);

    return withTransaction(async (client) => {
      try {
        if (data.shopId != null) await assertShopExists(data.shopId, client);
        if (data.birdTypeId != null) await assertBirdTypeExists(data.birdTypeId, client);

        const trip = await client.query(
          `SELECT id FROM trips
           WHERE COALESCE(deleted, FALSE) = FALSE
             AND status IN ('Draft', 'Pending', 'Completed')
           ORDER BY trip_date DESC, id DESC
           LIMIT 1`
        );
        if (!trip.rowCount) {
          throw new AppError(400, "No active trip available to attach shop rate (uses trip_deliveries)");
        }
        const tripId = num(trip.rows[0].id);
        const inserted = await client.query(
          `INSERT INTO trip_deliveries (
             trip_id, shop_id, shop_name, bird_type_id, bird_type, rate, amount, remarks, birds, weight
           ) VALUES ($1,$2,$3,$4,$5,$6,0,$7,0,0)
           RETURNING id`,
          [
            tripId,
            data.shopId ?? null,
            data.shopName ?? "",
            data.birdTypeId ?? null,
            data.birdType ?? "",
            data.rate,
            data.remarks ?? `Rate effective ${data.effectiveFrom}`,
          ]
        );
        const rateId = num(inserted.rows[0].id);
        const row = await client.query(
          `SELECT d.id, d.shop_id, d.shop_name, d.bird_type_id, d.bird_type, d.rate,
                  d.remarks, d.created_at, d.updated_at,
                  t.trip_date AS effective_from, t.trip_date, t.status AS trip_status,
                  t.deleted AS trip_deleted
           FROM trip_deliveries d
           INNER JOIN trips t ON t.id = d.trip_id
           WHERE d.id = $1`,
          [rateId]
        );
        return mapRate(row.rows[0]);
      } catch (err) {
        rethrowIfAppError(err);
        throw err;
      }
    });
  },

  async update(id: number, body: unknown) {
    const data = parseBody(shopRateBodySchema.partial(), body);

    if (data.rate !== undefined) {
      const parent = await query<{ rate_completed: boolean }>(
        `SELECT COALESCE(t.rate_completed, FALSE) AS rate_completed
         FROM trip_deliveries d
         INNER JOIN trips t ON t.id = d.trip_id
         WHERE d.id = $1`,
        [id]
      );
      if (!parent.rowCount) throw new AppError(404, "Shop rate not found");
      if (parent.rows[0].rate_completed) {
        throw new AppError(
          409,
          "Cannot modify rate — trip rates are locked by Rate Entry"
        );
      }
    }

    const result = await query(
      `UPDATE trip_deliveries SET
         shop_id = COALESCE($2, shop_id),
         shop_name = COALESCE($3, shop_name),
         bird_type_id = COALESCE($4, bird_type_id),
         bird_type = COALESCE($5, bird_type),
         rate = COALESCE($6, rate),
         remarks = COALESCE($7, remarks)
       WHERE id = $1
       RETURNING id`,
      [
        id,
        data.shopId ?? null,
        data.shopName ?? null,
        data.birdTypeId ?? null,
        data.birdType ?? null,
        data.rate ?? null,
        data.remarks ?? null,
      ]
    );
    if (!result.rowCount) throw new AppError(404, "Shop rate not found");
    return this.getById(id);
  },

  async updateStatus(id: number, body: unknown) {
    const status = String((body as { status?: string })?.status ?? "");
    assertOpsStatus(status);
    const patch = body as { approvedBy?: string; reason?: string };

    return withTransaction(async (client) => {
      const delivery = await client.query<{ trip_id: number }>(
        `SELECT trip_id FROM trip_deliveries WHERE id = $1`,
        [id]
      );
      if (!delivery.rowCount) throw new AppError(404, "Shop rate not found");
      const tripId = num(delivery.rows[0].trip_id);

      if (status === "Approved") {
        await client.query(
          `UPDATE trips SET status = 'Completed', deleted = FALSE,
             approved_by = COALESCE($2, approved_by), approved_at = NOW()
           WHERE id = $1`,
          [tripId, patch.approvedBy ?? "system"]
        );
      } else if (status === "Pending Approval") {
        await client.query(
          `UPDATE trips SET status = 'Pending', deleted = FALSE,
             rate_completed = COALESCE(rate_completed, FALSE)
           WHERE id = $1`,
          [tripId]
        );
      } else if (status === "Deleted") {
        const locked = await client.query<{ rate_completed: boolean }>(
          `SELECT COALESCE(rate_completed, FALSE) AS rate_completed FROM trips WHERE id = $1`,
          [tripId]
        );
        if (locked.rowCount && locked.rows[0].rate_completed) {
          throw new AppError(
            409,
            "Cannot clear a rate whose trip is locked by Rate Entry"
          );
        }
        await client.query(`UPDATE trip_deliveries SET rate = NULL WHERE id = $1`, [id]);
      } else if (status === "Draft" || status === "Rejected") {
        await client.query(
          `UPDATE trips SET status = 'Draft', deleted = FALSE,
             rate_completed = COALESCE(rate_completed, FALSE)
           WHERE id = $1`,
          [tripId]
        );
      }

      const row = await client.query(
        `SELECT d.id, d.shop_id, d.shop_name, d.bird_type_id, d.bird_type, d.rate,
                d.remarks, d.created_at, d.updated_at,
                t.trip_date AS effective_from, t.trip_date, t.status AS trip_status,
                t.deleted AS trip_deleted
         FROM trip_deliveries d
         INNER JOIN trips t ON t.id = d.trip_id
         WHERE d.id = $1`,
        [id]
      );
      return mapRate(row.rows[0]);
    });
  },

  async softDelete(id: number, reason?: string) {
    return this.updateStatus(id, { status: "Deleted", reason });
  },
};
