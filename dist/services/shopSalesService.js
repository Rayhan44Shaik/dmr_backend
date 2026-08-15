import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { dateOnly, isoOrNull, num, str } from "../utils/coerce.js";
import { assertBirdTypeExists, assertShopActive } from "../utils/fkValidation.js";
import { paginatedResult, } from "../utils/pagination.js";
import { rethrowIfAppError } from "../utils/pgErrors.js";
import { assertOpsStatus, assertShopSaleRateInRange, parseBody, shopSaleBodySchema, } from "../validation/operations.js";
import { assertTripCompletedForShopSales, assertTripEditable, assertWithinCapacity, editWindowExpiresAt, generateSaleNo, isTripEditable, recalcTripDeliveryTotals, sumActiveDeliveries, } from "../utils/tripDeliverySync.js";
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
function mapDeliverySale(row) {
    const tripStatus = str(row.trip_status);
    const tripDeleted = Boolean(row.trip_deleted);
    const saleDeleted = Boolean(row.deleted);
    const approvedAt = isoOrNull(row.approved_at);
    const tripDate = dateOnly(row.trip_date) ?? "";
    // Effective rate/amount: once an operator explicitly edits a sale's rate
    // it is persisted on the row (d.rate). Until then, a freshly-completed
    // trip's deliveries carry rate = 0 from Trip Entry — fall back to the
    // trip's single Rate Entry rate for display so Shop Sales shows a real
    // amount immediately after "Save & Lock", without ever writing to
    // rate_entry or trip_deliveries from here.
    const persistedRate = num(row.rate);
    const rate = persistedRate > 0 ? persistedRate : num(row.re_rate);
    const weight = num(row.weight);
    const persistedAmount = num(row.amount);
    const amount = persistedRate > 0 && persistedAmount > 0 ? persistedAmount : Number((weight * rate).toFixed(2));
    const tripForWindow = {
        status: tripStatus,
        deleted: tripDeleted,
        approvedAt,
        tripDate,
    };
    return {
        id: num(row.id),
        saleNo: str(row.sale_no),
        saleDate: tripDate,
        shopId: row.shop_id == null ? null : num(row.shop_id),
        shopName: str(row.shop_name),
        birdTypeId: row.bird_type_id == null ? null : num(row.bird_type_id),
        birdType: str(row.bird_type),
        tripId: row.trip_id == null ? null : num(row.trip_id),
        tripNo: str(row.trip_no),
        vehicleNo: row.vehicle_no == null ? null : str(row.vehicle_no),
        farmName: row.source_farm == null ? null : str(row.source_farm),
        birds: num(row.birds),
        weight,
        rate,
        amount,
        mortality: num(row.mortality),
        remarks: str(row.remarks),
        status: tripToOpsStatus(tripStatus, tripDeleted),
        deleted: saleDeleted,
        deletedReason: row.deleted_reason == null ? null : str(row.deleted_reason),
        tripDeleted,
        editable: !saleDeleted && isTripEditable(tripForWindow),
        windowExpiresAt: tripStatus === "Completed" ? editWindowExpiresAt(tripForWindow).toISOString() : null,
        approvedBy: row.approved_by == null ? null : str(row.approved_by),
        approvedAt,
        createdAt: row.created_at == null ? null : str(row.created_at),
        updatedAt: row.updated_at == null ? null : str(row.updated_at),
    };
}
const SALE_SELECT = `
  SELECT d.*,
         t.trip_no, t.trip_date, t.status AS trip_status, t.deleted AS trip_deleted,
         t.approved_by, t.approved_at, t.vehicle_no, t.source_farm,
         re.rate AS re_rate
  FROM trip_deliveries d
  INNER JOIN trips t ON t.id = d.trip_id
  LEFT JOIN rate_entry re ON re.trip_id = t.id
`;
/**
 * The trip's bird/weight capacity for Shop Sales validation.
 *
 * Step 3 Pickup (`total_birds`, `dc_weight`) is the authoritative,
 * mandatory-before-Completion source — every Completed trip has these set
 * (pickup_step_submitted is required by assertTripReadyForCompletion). Step
 * 2 Farm-load fields (`farm_bird_count`, `farm_load_weight`) were added
 * later and are not consistently populated on older trips; when they ARE
 * genuinely set (>0) they take precedence, exactly mirroring the same
 * farmBirdCount ?? totalBirds / farmLoadWeight ?? dcWeight fallback
 * `computeTripKpis()` (tripCalculations.ts) already uses at Trip Entry
 * time — this is not a new business rule, just applying the existing one
 * consistently to Shop Sales.
 */
async function lockTrip(client, tripId) {
    const result = await client.query(`SELECT id, trip_no, status, deleted, approved_at, trip_date,
            farm_bird_count, farm_load_weight, total_birds, dc_weight
       FROM trips WHERE id = $1 FOR UPDATE`, [tripId]);
    if (!result.rowCount)
        throw new AppError(404, `Trip ${tripId} not found`);
    const row = result.rows[0];
    const farmBirdCount = num(row.farm_bird_count);
    const farmLoadWeight = num(row.farm_load_weight);
    const totalBirds = num(row.total_birds);
    const dcWeight = num(row.dc_weight);
    return {
        id: num(row.id),
        tripNo: str(row.trip_no),
        status: str(row.status),
        deleted: Boolean(row.deleted),
        approvedAt: isoOrNull(row.approved_at),
        tripDate: dateOnly(row.trip_date) ?? "",
        capacityBirds: farmBirdCount > 0 ? farmBirdCount : totalBirds,
        capacityWeight: farmLoadWeight > 0 ? farmLoadWeight : dcWeight,
    };
}
async function getDeliveryTripId(client, saleId) {
    const result = await client.query(`SELECT trip_id FROM trip_deliveries WHERE id = $1`, [saleId]);
    if (!result.rowCount)
        throw new AppError(404, "Shop sale not found");
    return num(result.rows[0].trip_id);
}
/**
 * Backend enforcement of the Trip → Rate Entry → Shop Sales flow: Shop Sales
 * create/edit/delete is rejected unless the trip's Rate Entry has been
 * explicitly saved AND locked (rate_entry.locked = TRUE) — a saved-but-not-
 * yet-locked rate is not enough. This is the authoritative gate; Rate Entry
 * "Save" and "Lock" are separate backend actions (rateEntryService.create /
 * rateEntryService.lock), and only a successful lock flips this flag.
 */
async function assertRateEntryLocked(client, tripId, trip) {
    const result = await client.query(`SELECT id, locked FROM rate_entry WHERE trip_id = $1`, [tripId]);
    if (!result.rowCount || !result.rows[0].locked) {
        throw new AppError(409, `Trip ${trip.tripNo ?? ""} has no locked Rate Entry — ` +
            `Shop Sales requires the trip's Rate Entry to be saved & locked first.`.replace(/\s+/g, " "));
    }
}
/**
 * Shop sales are trip_deliveries rows (+ parent trip). No separate
 * shop_sales table — deliberately reusing the existing Trip → Delivery
 * relationship instead of duplicating it (see 023_shop_sales_hardening.sql).
 */
export const shopSalesService = {
    async list(filters = {}) {
        const clauses = [];
        const params = [];
        // Shop Sales is only available once the trip's Rate Entry has been saved
        // & explicitly LOCKED (rate_entry.locked = TRUE) — a saved-but-unlocked
        // rate does not unlock Shop Sales. A trip being Completed alone does NOT
        // unlock its deliveries either; the required flow is Trip Completed →
        // Rate Entry → Save → Lock → Shop Sales. This is the authoritative
        // backend enforcement (locked never flips back to false once set).
        clauses.push(`EXISTS (SELECT 1 FROM rate_entry WHERE trip_id = t.id AND locked = TRUE)`);
        // Historical requirement: sales for a deleted trip must remain visible
        // (they are the accounting record) — only a sale's own `deleted` flag
        // (soft-deleted within the edit window) is filtered by default.
        if (!filters.includeDeleted) {
            clauses.push(`COALESCE(d.deleted, FALSE) = FALSE`);
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
        // Same backend rule as list(): a sale is only reachable once its trip's
        // Rate Entry has been saved & locked.
        const result = await query(`${SALE_SELECT} WHERE d.id = $1 AND EXISTS (SELECT 1 FROM rate_entry WHERE trip_id = t.id AND locked = TRUE)`, [id]);
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
                const trip = await lockTrip(client, data.tripId);
                assertTripEditable(trip);
                assertTripCompletedForShopSales(trip);
                await assertRateEntryLocked(client, trip.id, trip);
                // Shop is a mandatory reference — a sale with no shop is not a
                // valid accounting record (Shop is also immutable once created,
                // so it must be right from the start).
                if (data.shopId == null) {
                    throw new AppError(400, "shopId is required to create a Shop Sale");
                }
                await assertShopActive(data.shopId, client);
                if (data.birdTypeId != null)
                    await assertBirdTypeExists(data.birdTypeId, client);
                const birds = data.birds ?? 0;
                const weight = data.weight ?? 0;
                const mortalityCount = data.mortality ?? 0;
                // Shop Sales doesn't carry a mortality-weight input — a new row
                // starts at 0 mort_kg (only Trip Step 4 ever sets it).
                const mortalityWeight = 0;
                // Duplicate-submission guard: a network retry, accidental
                // double-click, or a genuinely repeated create for the exact same
                // (trip, shop, birds, weight) must not silently produce a second
                // Shop Sale row. This pre-check gives a friendly error; the real,
                // concurrency-safe guarantee is the unique partial index
                // idx_trip_deliveries_no_dup_sale (029_shop_sales_duplicate_guard.sql)
                // — two requests racing each other both pass this SELECT, but only
                // one INSERT can win, and the loser's 23505 is mapped to 409 by
                // rethrowIfAppError/mapPgError below. No time window: unlike the
                // old 5-second check, a duplicate is rejected no matter how much
                // time has passed since the original.
                const duplicate = await client.query(`SELECT id FROM trip_deliveries
            WHERE trip_id = $1 AND shop_id = $2 AND birds = $3 AND weight = $4
              AND deleted = FALSE
            LIMIT 1`, [trip.id, data.shopId, birds, weight]);
                if (duplicate.rowCount) {
                    throw new AppError(409, `A matching Shop Sale already exists for this shop (id ${duplicate.rows[0].id}) — ` +
                        `not creating a duplicate. Edit the existing sale instead, or use a different ` +
                        `birds/weight value if this is a genuinely separate delivery.`);
                }
                // Farm capacity is consumed by delivered birds/weight AND
                // mortality together — a bird either reaches a shop or is recorded
                // as mortality, but either way it came out of the farm load.
                const existing = await sumActiveDeliveries(client, trip.id);
                assertWithinCapacity({
                    label: "birds",
                    available: trip.capacityBirds,
                    alreadyAllocated: existing.birds + existing.mortalityCount,
                    requested: birds + mortalityCount,
                });
                assertWithinCapacity({
                    label: "weight",
                    available: trip.capacityWeight,
                    alreadyAllocated: existing.weight + existing.mortalityWeight,
                    requested: weight + mortalityWeight,
                });
                // Fall back to the persisted Rate Entry for this trip when the
                // caller doesn't supply a rate explicitly.
                let rate = data.rate;
                if (rate == null) {
                    const rateRow = await client.query(`SELECT rate FROM rate_entry WHERE trip_id = $1`, [trip.id]);
                    rate = rateRow.rowCount ? Number(rateRow.rows[0].rate) : 0;
                }
                // amount is always server-computed — client-supplied amount is never read.
                const amount = Number((weight * rate).toFixed(2));
                const saleNo = await generateSaleNo(client, trip.id, trip.tripNo);
                const result = await client.query(`INSERT INTO trip_deliveries (
             trip_id, sale_no, shop_id, shop_name, bird_type_id, bird_type,
             birds, weight, mortality, rate, amount, remarks
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           RETURNING id`, [
                    trip.id,
                    saleNo,
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
                await recalcTripDeliveryTotals(client, trip.id);
                const row = await client.query(`${SALE_SELECT} WHERE d.id = $1`, [saleId]);
                return mapDeliverySale(row.rows[0]);
            }
            catch (err) {
                rethrowIfAppError(err);
                throw err;
            }
        });
    },
    /**
     * Rate Entry LOCKED only means "this trip has moved from Rate Entry into
     * Shop Sales" — it is NOT rate immutability. Within the 10-day Shop
     * Sales edit window (assertTripEditable below — the same window that
     * already gates birds/weight/delete), birds, weight, AND rate may all be
     * corrected, each subject to its own validation (capacity for
     * birds/weight, ₹50–₹300 for rate). Shop/trip reassignment remains
     * permanently blocked — the data model has no safe way to reassign a
     * delivery to a different shop/trip, independent of the edit window.
     * Once the 10-day window closes, assertTripEditable rejects the whole
     * update (birds, weight, rate, everything) — that is the real "Shop
     * Sales trip locked" state, not rate_entry.locked.
     */
    async update(id, body) {
        const data = parseBody(shopSaleBodySchema.partial(), body);
        const lockedFields = ["amount", "shopId", "shopName", "tripId"].filter((field) => data[field] !== undefined);
        if (lockedFields.length) {
            throw new AppError(409, `Cannot modify ${lockedFields.join(", ")} on a Shop Sale — the shop and trip relationship ` +
                `are permanently fixed once created. Birds, weight, rate, mortality, bird type, and ` +
                `remarks may be corrected within the 10-day edit window.`, { lockedFields });
        }
        if (data.rate != null)
            assertShopSaleRateInRange(data.rate);
        return withTransaction(async (client) => {
            try {
                const tripId = await getDeliveryTripId(client, id);
                const trip = await lockTrip(client, tripId);
                assertTripEditable(trip);
                assertTripCompletedForShopSales(trip);
                await assertRateEntryLocked(client, trip.id, trip);
                const currentResult = await client.query(`SELECT birds, weight, rate, mortality, mort_kg FROM trip_deliveries WHERE id = $1 AND deleted = FALSE FOR UPDATE`, [id]);
                if (!currentResult.rowCount)
                    throw new AppError(404, "Shop sale not found");
                const current = currentResult.rows[0];
                if (data.birdTypeId != null)
                    await assertBirdTypeExists(data.birdTypeId, client);
                const birds = data.birds ?? num(current.birds);
                const weight = data.weight ?? num(current.weight);
                // Rate is editable within the 10-day window (already asserted via
                // assertTripEditable above), range-checked above; otherwise carry
                // the existing persisted rate forward unchanged.
                const rate = data.rate ?? Number(current.rate ?? 0);
                const mortalityCount = data.mortality ?? num(current.mortality);
                // mort_kg isn't editable via Shop Sales — carry the row's existing
                // value forward into the capacity check unchanged.
                const mortalityWeight = num(current.mort_kg);
                // Exclude this row entirely from "others", then add back its own
                // (possibly edited) birds/weight/mortality — farm capacity is
                // consumed by delivered + mortality together, same as create().
                const others = await sumActiveDeliveries(client, trip.id, id);
                assertWithinCapacity({
                    label: "birds",
                    available: trip.capacityBirds,
                    alreadyAllocated: others.birds + others.mortalityCount,
                    requested: birds + mortalityCount,
                });
                assertWithinCapacity({
                    label: "weight",
                    available: trip.capacityWeight,
                    alreadyAllocated: others.weight + others.mortalityWeight,
                    requested: weight + mortalityWeight,
                });
                // amount is always server-computed from weight × the effective rate
                // (possibly just-edited above) — client-supplied amount is never read.
                const amount = Number((weight * rate).toFixed(2));
                const result = await client.query(`UPDATE trip_deliveries SET
             bird_type_id = COALESCE($2, bird_type_id),
             bird_type = COALESCE($3, bird_type),
             birds = $4,
             weight = $5,
             rate = $6,
             amount = $7,
             mortality = COALESCE($8, mortality),
             remarks = COALESCE($9, remarks)
           WHERE id = $1
           RETURNING id`, [
                    id,
                    data.birdTypeId ?? null,
                    data.birdType ?? null,
                    birds,
                    weight,
                    rate,
                    amount,
                    data.mortality ?? null,
                    data.remarks ?? null,
                ]);
                if (!result.rowCount)
                    throw new AppError(404, "Shop sale not found");
                await recalcTripDeliveryTotals(client, trip.id);
                const row = await client.query(`${SALE_SELECT} WHERE d.id = $1`, [id]);
                return mapDeliverySale(row.rows[0]);
            }
            catch (err) {
                rethrowIfAppError(err);
                throw err;
            }
        });
    },
    /**
     * Historically this endpoint mutated the *parent trip's* status
     * (Draft/Pending/Completed/Deleted) based on an ops-facing status value —
     * completely bypassing the validated trip status-transition table
     * (assertTripStatusTransition) and the wizard-completion gate
     * (assertTripReadyForCompletion) that the real trip status endpoint
     * (tripsService.updateStatus) enforces. That let a direct API call flip
     * an incomplete trip straight to "Completed". A Shop Sale has no
     * independent status of its own (Shop Sales is a projection of
     * trip_deliveries — see shopSalesService module comment) beyond whether
     * the row itself is soft-deleted, so this endpoint now only supports
     * that one real transition — soft-delete — under the exact same guards
     * softDelete() already uses (Rate Entry must be locked, trip must be
     * editable/Approved-or-Completed). Every other status value is rejected;
     * trip status must be changed through tripsService.updateStatus, never
     * through Shop Sales.
     */
    async updateStatus(id, body) {
        const status = String(body?.status ?? "");
        assertOpsStatus(status);
        const patch = body;
        if (status !== "Deleted") {
            throw new AppError(409, `Shop Sales cannot set status to "${status}" — a Shop Sale has no independent status ` +
                `beyond deleted/active. Trip status can only be changed via the Trip status API, ` +
                `never through Shop Sales.`);
        }
        return this.softDelete(id, patch.reason);
    },
    /** Soft-delete only — birds/weight/rate/amount are preserved for the
     * historical accounting record, never zeroed out. Allowed only within the
     * 10-day edit window. */
    async softDelete(id, reason) {
        return withTransaction(async (client) => {
            const tripId = await getDeliveryTripId(client, id);
            const trip = await lockTrip(client, tripId);
            assertTripEditable(trip);
            assertTripCompletedForShopSales(trip);
            await assertRateEntryLocked(client, trip.id, trip);
            const result = await client.query(`UPDATE trip_deliveries SET deleted = TRUE, deleted_at = NOW(), deleted_reason = $2
         WHERE id = $1 AND deleted = FALSE
         RETURNING id`, [id, reason ?? null]);
            if (!result.rowCount)
                throw new AppError(404, "Shop sale not found");
            await recalcTripDeliveryTotals(client, trip.id);
            const row = await client.query(`${SALE_SELECT} WHERE d.id = $1`, [id]);
            return mapDeliverySale(row.rows[0]);
        });
    },
};
//# sourceMappingURL=shopSalesService.js.map