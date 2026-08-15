import { query } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { dateOnly, num, str } from "../utils/coerce.js";
import { paginatedResult, } from "../utils/pagination.js";
/**
 * Collections are a read-only, derived view over trip_deliveries — there is
 * no collections table.
 *   - amount_due   = delivery.amount
 *   - amount_collected = amount_due once the trip's Rate Entry is LOCKED,
 *     else 0.
 *
 * The single authoritative "is this delivery's amount finalized/collectible"
 * signal is rate_entry.locked (joined below as `re.locked`) — never
 * trips.rate_completed directly. This module used to write trips.rate_completed
 * (and even promote trips.status) itself, independently of Rate Entry —
 * that let a Collection be "recorded" for a trip that never went through
 * Rate Entry at all, and left Dashboard/Collections permanently
 * disagreeing with Shop Sales about which trips were rate-complete. That
 * write path has been removed entirely (see create/update/updateStatus
 * below): Collections can now only ever read the Rate Entry lock state,
 * never independently declare it.
 */
function mapCollection(row) {
    const amountDue = num(row.amount);
    const rateLocked = Boolean(row.re_locked);
    const amountCollected = rateLocked ? amountDue : 0;
    const tripStatus = str(row.trip_status);
    const deleted = Boolean(row.trip_deleted);
    let status = "Draft";
    if (deleted || tripStatus === "Deleted")
        status = "Deleted";
    else if ((tripStatus === "Completed" || tripStatus === "Approved") && rateLocked)
        status = "Approved";
    else if (tripStatus === "Completed" || tripStatus === "Approved")
        status = "Pending Approval";
    else if (tripStatus === "Pending")
        status = "Pending Approval";
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
         t.deleted AS trip_deleted, t.approved_by, t.approved_at,
         re.locked AS re_locked
  FROM trip_deliveries d
  INNER JOIN trips t ON t.id = d.trip_id
  LEFT JOIN rate_entry re ON re.trip_id = t.id
`;
/** Shared "is this trip's Rate Entry locked" predicate, correlated against
 * the `t` alias used throughout this file's queries — kept in one place so
 * every filter (list/pending/register/runningBalance) reads the exact same
 * authoritative signal as Shop Sales does. */
const RATE_LOCKED_EXISTS = `EXISTS (SELECT 1 FROM rate_entry re WHERE re.trip_id = t.id AND re.locked = TRUE)`;
export const collectionsService = {
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
        if (filters.status === "Approved") {
            clauses.push(`t.status IN ('Approved', 'Completed') AND ${RATE_LOCKED_EXISTS}`);
        }
        else if (filters.status === "Pending Approval") {
            clauses.push(`t.status IN ('Pending', 'Approved', 'Completed') AND NOT ${RATE_LOCKED_EXISTS}`);
        }
        else if (filters.status === "Draft") {
            clauses.push(`t.status = 'Draft'`);
        }
        else if (filters.status === "Deleted") {
            clauses.push(`(t.status = 'Deleted' OR t.deleted = TRUE)`);
        }
        const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
        if (filters.pagination) {
            const countResult = await query(`SELECT COUNT(*)::text AS c FROM trip_deliveries d
         INNER JOIN trips t ON t.id = d.trip_id ${where}`, params);
            const total = Number(countResult.rows[0]?.c ?? 0);
            const pagedParams = [...params, filters.pagination.limit, filters.pagination.offset];
            const result = await query(`${COL_SELECT} ${where}
         ORDER BY t.trip_date DESC, d.id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, pagedParams);
            return paginatedResult(result.rows.map(mapCollection), total, filters.pagination);
        }
        const result = await query(`${COL_SELECT} ${where} ORDER BY t.trip_date DESC, d.id DESC`, params);
        return result.rows.map(mapCollection);
    },
    async pending(shopId) {
        const params = [];
        let shopClause = "";
        if (shopId) {
            params.push(shopId);
            shopClause = `AND d.shop_id = $${params.length}`;
        }
        const result = await query(`${COL_SELECT}
       WHERE COALESCE(t.deleted, FALSE) = FALSE
         AND t.status IN ('Approved', 'Completed')
         AND NOT ${RATE_LOCKED_EXISTS}
         AND COALESCE(d.amount, 0) > 0
         ${shopClause}
       ORDER BY t.trip_date DESC, d.id DESC`, params);
        return result.rows.map(mapCollection);
    },
    async register(filters = {}) {
        return this.list({
            ...filters,
            status: "Approved",
            includeDeleted: false,
        });
    },
    async runningBalance(shopId) {
        const params = [];
        let shopFilter = "";
        if (shopId) {
            params.push(shopId);
            shopFilter = `AND d.shop_id = $${params.length}`;
        }
        const result = await query(`SELECT
         d.shop_id,
         COALESCE(d.shop_name, s.shop_name, '') AS shop_name,
         COALESCE(SUM(d.amount), 0) AS total_sales,
         COALESCE(SUM(d.amount) FILTER (WHERE re.locked = TRUE), 0) AS total_collected,
         COALESCE(SUM(d.amount) FILTER (WHERE COALESCE(re.locked, FALSE) = FALSE), 0)
           AS pending_amount
       FROM trip_deliveries d
       INNER JOIN trips t ON t.id = d.trip_id
       LEFT JOIN shops s ON s.id = d.shop_id
       LEFT JOIN rate_entry re ON re.trip_id = t.id
       WHERE t.status IN ('Approved', 'Completed')
         AND COALESCE(t.deleted, FALSE) = FALSE
         ${shopFilter}
       GROUP BY d.shop_id, COALESCE(d.shop_name, s.shop_name, '')
       ORDER BY 2`, params);
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
    async getById(id) {
        const result = await query(`${COL_SELECT} WHERE d.id = $1`, [id]);
        if (!result.rowCount)
            throw new AppError(404, "Collection not found");
        return mapCollection(result.rows[0]);
    },
    /**
     * Collections has no state of its own to write — "collected" is derived
     * entirely from rate_entry.locked (see mapCollection above). Previously
     * this endpoint set trips.rate_completed directly (and even promoted
     * trips.status Draft→Pending) based on a client-supplied amountCollected,
     * completely bypassing Rate Entry — a trip could be marked "collected"
     * having never been through Rate Entry or Shop Sales at all. That
     * workflow is removed: use Rate Entry's save/lock endpoints to make a
     * trip's amount collectible; Collections only reports on that state.
     */
    async create(_body) {
        throw new AppError(409, "Collections status is derived automatically from Rate Entry (lock the trip's Rate Entry " +
            "to make it collectible) and can no longer be set independently. There is no separate " +
            "Collection record to create.");
    },
    /** See create() — Collections has no independently-writable state. */
    async update(_id, _body) {
        throw new AppError(409, "Collections status is derived automatically from Rate Entry and cannot be modified " +
            "directly. Use the Rate Entry or Shop Sales APIs to change the underlying data.");
    },
    /** See create() — Collections has no independently-writable status,
     * including "Deleted": a delivery/sale can only be soft-deleted through
     * the Shop Sales API, and a trip's status can only be changed through
     * the Trip status API. */
    async updateStatus(_id, _body) {
        throw new AppError(409, "Collection status cannot be set directly — it is derived from Rate Entry lock state. " +
            "To delete a sale, use the Shop Sales API; to change trip status, use the Trip status API.");
    },
    async softDelete(id, reason) {
        return this.updateStatus(id, { status: "Deleted", reason });
    },
};
//# sourceMappingURL=collectionsService.js.map