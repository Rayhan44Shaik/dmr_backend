import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { dateOnly, num, str } from "../utils/coerce.js";
import { assertBirdTypeExists, assertShopExists, assertTripExists, } from "../utils/fkValidation.js";
import { paginatedResult, } from "../utils/pagination.js";
import { rethrowIfAppError } from "../utils/pgErrors.js";
import { assertOpsStatus, parseBody, shopSaleBodySchema, } from "../validation/operations.js";
/** Map trip_status → ops-facing status for API contract */
function tripToOpsStatus(tripStatus, deleted) {
    if (deleted || tripStatus === "Deleted")
        return "Deleted";
    if (tripStatus === "Completed")
        return "Approved";
    if (tripStatus === "Pending")
        return "Pending Approval";
    return "Draft";
}
function opsToTripStatus(status) {
    if (status === "Approved")
        return "Completed";
    if (status === "Pending Approval")
        return "Pending";
    if (status === "Deleted")
        return "Deleted";
    if (status === "Rejected")
        return "Draft";
    return "Draft";
}
function mapDeliverySale(row) {
    const tripStatus = str(row.trip_status);
    const deleted = Boolean(row.trip_deleted);
    return {
        id: num(row.id),
        saleNo: `TD-${num(row.id)}`,
        saleDate: dateOnly(row.trip_date) ?? "",
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
        status: tripToOpsStatus(tripStatus, deleted),
        deleted,
        deletedReason: row.deleted_reason == null ? null : str(row.deleted_reason),
        approvedBy: row.approved_by == null ? null : str(row.approved_by),
        approvedAt: row.approved_at == null ? null : str(row.approved_at),
        createdAt: row.created_at == null ? null : str(row.created_at),
        updatedAt: row.updated_at == null ? null : str(row.updated_at),
    };
}
const SALE_SELECT = `
  SELECT d.*,
         t.trip_date, t.status AS trip_status, t.deleted AS trip_deleted,
         t.deleted_reason, t.approved_by, t.approved_at
  FROM trip_deliveries d
  INNER JOIN trips t ON t.id = d.trip_id
`;
/**
 * Shop sales backed by trip_deliveries (+ parent trips).
 * No shop_sales table.
 */
export const shopSalesService = {
    async list(filters = {}) {
        const clauses = [];
        const params = [];
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
        if (filters.status) {
            if (filters.status === "Approved")
                clauses.push(`t.status = 'Completed'`);
            else if (filters.status === "Pending Approval")
                clauses.push(`t.status = 'Pending'`);
            else if (filters.status === "Deleted")
                clauses.push(`(t.status = 'Deleted' OR t.deleted = TRUE)`);
            else if (filters.status === "Draft")
                clauses.push(`t.status = 'Draft'`);
            else if (filters.status === "Rejected")
                clauses.push(`FALSE`);
        }
        const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
        if (filters.pagination) {
            const countResult = await query(`SELECT COUNT(*)::text AS c FROM trip_deliveries d
         INNER JOIN trips t ON t.id = d.trip_id ${where}`, params);
            const total = Number(countResult.rows[0]?.c ?? 0);
            const pagedParams = [...params, filters.pagination.limit, filters.pagination.offset];
            const result = await query(`${SALE_SELECT} ${where}
         ORDER BY t.trip_date DESC, d.id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, pagedParams);
            return paginatedResult(result.rows.map(mapDeliverySale), total, filters.pagination);
        }
        const result = await query(`${SALE_SELECT} ${where} ORDER BY t.trip_date DESC, d.id DESC`, params);
        return result.rows.map(mapDeliverySale);
    },
    async getById(id) {
        const result = await query(`${SALE_SELECT} WHERE d.id = $1`, [id]);
        if (!result.rowCount)
            throw new AppError(404, "Shop sale not found");
        return mapDeliverySale(result.rows[0]);
    },
    async create(body) {
        const data = parseBody(shopSaleBodySchema, body);
        if (!data.tripId) {
            throw new AppError(400, "tripId is required (sales are stored on trip_deliveries)");
        }
        return withTransaction(async (client) => {
            try {
                await assertTripExists(data.tripId, client);
                if (data.shopId != null)
                    await assertShopExists(data.shopId, client);
                if (data.birdTypeId != null)
                    await assertBirdTypeExists(data.birdTypeId, client);
                const birds = data.birds ?? 0;
                const weight = data.weight ?? 0;
                const rate = data.rate ?? 0;
                const amount = data.amount ?? Number((weight * rate).toFixed(2));
                const result = await client.query(`INSERT INTO trip_deliveries (
             trip_id, shop_id, shop_name, bird_type_id, bird_type,
             birds, weight, mortality, rate, amount, remarks
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING id`, [
                    data.tripId,
                    data.shopId ?? null,
                    data.shopName ?? "",
                    data.birdTypeId ?? null,
                    data.birdType ?? "",
                    birds,
                    weight,
                    data.mortality ?? 0,
                    rate,
                    amount,
                    data.remarks ?? "",
                ]);
                const saleId = num(result.rows[0].id);
                const row = await client.query(`${SALE_SELECT} WHERE d.id = $1`, [saleId]);
                return mapDeliverySale(row.rows[0]);
            }
            catch (err) {
                rethrowIfAppError(err);
                throw err;
            }
        });
    },
    async update(id, body) {
        const data = parseBody(shopSaleBodySchema.partial(), body);
        const result = await query(`UPDATE trip_deliveries SET
         shop_id = COALESCE($2, shop_id),
         shop_name = COALESCE($3, shop_name),
         bird_type_id = COALESCE($4, bird_type_id),
         bird_type = COALESCE($5, bird_type),
         birds = COALESCE($6, birds),
         weight = COALESCE($7, weight),
         rate = COALESCE($8, rate),
         amount = COALESCE($9, amount),
         mortality = COALESCE($10, mortality),
         remarks = COALESCE($11, remarks)
       WHERE id = $1
       RETURNING id`, [
            id,
            data.shopId ?? null,
            data.shopName ?? null,
            data.birdTypeId ?? null,
            data.birdType ?? null,
            data.birds ?? null,
            data.weight ?? null,
            data.rate ?? null,
            data.amount ?? null,
            data.mortality ?? null,
            data.remarks ?? null,
        ]);
        if (!result.rowCount)
            throw new AppError(404, "Shop sale not found");
        return this.getById(id);
    },
    async updateStatus(id, body) {
        const status = String(body?.status ?? "");
        assertOpsStatus(status);
        const tripStatus = opsToTripStatus(status);
        const patch = body;
        return withTransaction(async (client) => {
            const delivery = await client.query(`SELECT trip_id FROM trip_deliveries WHERE id = $1`, [id]);
            if (!delivery.rowCount)
                throw new AppError(404, "Shop sale not found");
            const tripId = num(delivery.rows[0].trip_id);
            if (tripStatus === "Deleted") {
                await client.query(`UPDATE trip_deliveries SET amount = 0, birds = 0, weight = 0 WHERE id = $1`, [id]);
            }
            else if (tripStatus === "Completed") {
                await client.query(`UPDATE trips SET status = 'Completed', deleted = FALSE,
             approved_by = COALESCE($2, approved_by), approved_at = NOW()
           WHERE id = $1`, [tripId, patch.approvedBy ?? "system"]);
            }
            else {
                await client.query(`UPDATE trips SET status = $2::trip_status, deleted = FALSE WHERE id = $1`, [
                    tripId,
                    tripStatus,
                ]);
            }
            const row = await client.query(`${SALE_SELECT} WHERE d.id = $1`, [id]);
            return mapDeliverySale(row.rows[0]);
        });
    },
    async softDelete(id, reason) {
        return this.updateStatus(id, { status: "Deleted", reason });
    },
};
//# sourceMappingURL=shopSalesService.js.map