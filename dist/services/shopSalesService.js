import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { dateOnly, isoOrNull, num, str } from "../utils/coerce.js";
import { assertBirdTypeExists, assertShopActive } from "../utils/fkValidation.js";
import { paginatedResult, } from "../utils/pagination.js";
import { rethrowIfAppError } from "../utils/pgErrors.js";
import { evaluateRateLock } from "../utils/rateLock.js";
import { assertOpsStatus, assertShopSaleRateInRange, parseBody, shopSaleBodySchema, } from "../validation/operations.js";
import { assertTripCompletedForShopSales, assertTripEditable, assertWithinCapacity, editWindowExpiresAt, generateSaleNo, isTripEditable, recalcTripDeliveryTotals, sumActiveDeliveries, } from "../utils/tripDeliverySync.js";
import { applyCorrection, applyCredit, applyDebit, } from "../utils/shopLedger.js";
function computeAmount(weight, rate) {
    return Number((Number(weight) * Number(rate)).toFixed(2));
}
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
    const rateCompleted = Boolean(row.rate_completed);
    const rateLockedAt = row.rate_locked_at == null ? null : new Date(str(row.rate_locked_at));
    const lock = evaluateRateLock({
        rate_completed: rateCompleted,
        rate_locked_at: rateLockedAt,
    });
    return {
        id: num(row.id),
        saleNo: str(row.sale_no),
        saleDate: tripDate,
        shopId: row.shop_id == null ? null : num(row.shop_id),
        shopName: str(row.shop_name),
        subShopName: str(row.sub_shop_name),
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
        rateCompleted,
        rateLockedAt: lock.rateLockedAt,
        rateLockedBy: row.rate_locked_by == null ? null : str(row.rate_locked_by),
        correctionWindowExpired: lock.correctionWindowExpired,
        correctionWindowClosesAt: lock.correctionWindowClosesAt,
    };
}
const SALE_SELECT = `
  SELECT d.*,
         t.trip_no, t.trip_date, t.status AS trip_status, t.deleted AS trip_deleted,
         t.deleted_reason, t.approved_by, t.approved_at, t.vehicle_no, t.source_farm,
         t.rate_completed, t.rate_locked_at, t.rate_locked_by,
         re.rate AS re_rate
  FROM trip_deliveries d
  INNER JOIN trips t ON t.id = d.trip_id
  LEFT JOIN rate_entry re ON re.trip_id = t.id
`;
const PROTECTED_FIELDS = ["birds", "weight", "rate", "amount"];
async function lockTrip(client, tripId, legId) {
    const result = await client.query(`SELECT id, trip_no, status, deleted, approved_at, trip_date,
            total_birds, dc_weight
       FROM trips WHERE id = $1 FOR UPDATE`, [tripId]);
    if (!result.rowCount)
        throw new AppError(404, `Trip ${tripId} not found`);
    const row = result.rows[0];
    let totalBirds = num(row.total_birds);
    let dcWeight = num(row.dc_weight);
    if (legId != null) {
        const leg = await client.query(`SELECT total_birds, dc_weight
         FROM trip_legs
        WHERE id = $1 AND trip_id = $2`, [legId, tripId]);
        if (!leg.rowCount)
            throw new AppError(422, `Trip load for Shop Sale ${tripId} was not found`);
        totalBirds = num(leg.rows[0].total_birds);
        dcWeight = num(leg.rows[0].dc_weight);
    }
    return {
        id: num(row.id),
        tripNo: str(row.trip_no),
        status: str(row.status),
        deleted: Boolean(row.deleted),
        approvedAt: isoOrNull(row.approved_at),
        tripDate: dateOnly(row.trip_date) ?? "",
        // The Pickup step is authoritative for the Shop Sales ceiling: total_birds
        // (totalBirds) and dc_weight (dcWeight) are the mandatory-before-Completion
        // Step 3 values. Step 2 farm_load_* fields are NOT used as the Shop Sales cap.
        capacityBirds: totalBirds,
        capacityWeight: dcWeight,
    };
}
async function getDeliveryTripId(client, saleId) {
    const result = await client.query(`SELECT trip_id FROM trip_deliveries WHERE id = $1`, [saleId]);
    if (!result.rowCount)
        throw new AppError(404, "Shop sale not found");
    return num(result.rows[0].trip_id);
}
async function assertRateEntryLocked(client, tripId, trip) {
    const result = await client.query(`SELECT COALESCE(rate_completed, FALSE) AS rate_completed FROM trips WHERE id = $1`, [tripId]);
    if (!result.rowCount || !result.rows[0].rate_completed) {
        throw new AppError(409, `Trip ${trip.tripNo ?? ""} has no locked Rate Entry — ` +
            `Shop Sales requires the trip's Rate Entry to be saved & locked first.`.replace(/\s+/g, " "));
    }
}
export const shopSalesService = {
    async list(filters = {}) {
        const clauses = [];
        const params = [];
        clauses.push(`t.status = 'Completed' AND COALESCE(t.deleted, FALSE) = FALSE AND COALESCE(t.rate_completed, FALSE) = TRUE`);
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
        const result = await query(`${SALE_SELECT} WHERE d.id = $1 AND t.status = 'Completed' AND COALESCE(t.deleted, FALSE) = FALSE AND COALESCE(t.rate_completed, FALSE) = TRUE`, [id]);
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
                if (data.shopId == null) {
                    throw new AppError(400, "shopId is required to create a Shop Sale");
                }
                await assertShopActive(data.shopId, client);
                if (data.birdTypeId != null)
                    await assertBirdTypeExists(data.birdTypeId, client);
                const birds = data.birds ?? 0;
                const weight = data.weight ?? 0;
                const mortalityCount = data.mortality ?? 0;
                const mortalityWeight = 0;
                const duplicate = await client.query(`SELECT id FROM trip_deliveries
            WHERE trip_id = $1 AND shop_id = $2 AND birds = $3 AND weight = $4
              AND deleted = FALSE
            LIMIT 1`, [trip.id, data.shopId, birds, weight]);
                if (duplicate.rowCount) {
                    throw new AppError(409, `A matching Shop Sale already exists for this shop (id ${duplicate.rows[0].id}) — ` +
                        `not creating a duplicate. Edit the existing sale instead, or use a different ` +
                        `birds/weight value if this is a genuinely separate delivery.`);
                }
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
                let rate = data.rate;
                if (rate == null) {
                    const rateRow = await client.query(`SELECT rate FROM trip_deliveries WHERE trip_id = $1 AND rate IS NOT NULL ORDER BY id LIMIT 1`, [trip.id]);
                    rate = rateRow.rowCount ? Number(rateRow.rows[0].rate) : 0;
                }
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
                if (data.shopId != null) {
                    // Shop Sale = DEBIT on the shop's ledger + outstanding. Because a
                    // Shop Sale is only creatable on a rate-locked Completed trip, this
                    // new (post-lock) sale has its authoritative amount now.
                    await applyDebit(client, data.shopId, {
                        entryDate: dateOnly(trip.tripDate) ?? "",
                        entryType: "sale",
                        referenceType: "shop_sale",
                        referenceId: saleId,
                        note: "Shop sale debit (created via Shop Sales)",
                    }, amount);
                }
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
    async update(id, body) {
        const data = parseBody(shopSaleBodySchema.partial(), body);
        const current = await query(`${SALE_SELECT} WHERE d.id = $1`, [id]);
        if (!current.rowCount)
            throw new AppError(404, "Shop sale not found");
        const cur = current.rows[0];
        // Shop Sales is only visible/editable once the trip's Rate Entry is locked
        // (trips.rate_completed = TRUE). A sale on a trip that was never rate-locked
        // must not be reachable or editable — same visibility rule as list/getById.
        if (!Boolean(cur.rate_completed)) {
            throw new AppError(404, "Shop sale not found");
        }
        const lock = evaluateRateLock({
            rate_completed: cur.rate_completed,
            rate_locked_at: cur.rate_locked_at == null ? null : new Date(str(cur.rate_locked_at)),
        });
        const touchesProtected = PROTECTED_FIELDS.some((f) => data[f] !== undefined);
        if (lock.rateCompleted && touchesProtected && lock.correctionWindowExpired) {
            throw new AppError(409, "Rate correction window expired - editing locked after 10 days", {
                tripId: num(cur.trip_id),
                rateLockedAt: lock.rateLockedAt,
                correctionWindowClosesAt: lock.correctionWindowClosesAt,
            });
        }
        if (data.rate != null)
            assertShopSaleRateInRange(data.rate);
        const effectiveWeight = data.weight ?? num(cur.weight);
        const effectiveRate = data.rate ?? num(cur.rate);
        const nextAmount = computeAmount(effectiveWeight, effectiveRate);
        const oldAmount = num(cur.amount);
        const saleShopId = num(cur.shop_id);
        return withTransaction(async (client) => {
            const tripId = await getDeliveryTripId(client, id);
            const legId = cur.leg_id == null ? null : num(cur.leg_id);
            const trip = await lockTrip(client, tripId, legId);
            const birds = data.birds ?? num(cur.birds);
            const weight = data.weight ?? num(cur.weight);
            const mortalityCount = data.mortality ?? num(cur.mortality);
            const mortalityWeight = num(cur.mort_kg ?? 0);
            // Quantity constraints are relevant only when a quantity changes.
            // Re-validating unchanged quantities during a rate-only correction can
            // reject legitimate legacy/multi-load rows whose trip header contains
            // only the active load's pickup totals.
            if (data.birds != null || data.weight != null || data.mortality != null) {
                const others = await sumActiveDeliveries(client, trip.id, id, legId);
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
            }
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
                effectiveRate,
                nextAmount,
                data.mortality ?? null,
                data.remarks ?? null,
            ]);
            if (!result.rowCount)
                throw new AppError(404, "Shop sale not found");
            if (saleShopId > 0) {
                // Shop Sales correction sync: a sale amount change moves the shop
                // outstanding by the DIFFERENCE only (₹5,000 → ₹5,500 bumps
                // outstanding by exactly +₹500), never by re-applying the whole amount.
                const diff = nextAmount - oldAmount;
                await applyCorrection(client, saleShopId, {
                    entryDate: trip.tripDate,
                    entryType: "correction",
                    referenceType: "shop_sale",
                    referenceId: id,
                    note: `Shop sale correction (₹${oldAmount.toFixed(2)} → ₹${nextAmount.toFixed(2)})`,
                }, diff);
            }
            await recalcTripDeliveryTotals(client, trip.id);
            const row = await client.query(`${SALE_SELECT} WHERE d.id = $1`, [id]);
            return mapDeliverySale(row.rows[0]);
        });
    },
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
    async softDelete(id, reason) {
        return withTransaction(async (client) => {
            const tripId = await getDeliveryTripId(client, id);
            const trip = await lockTrip(client, tripId);
            assertTripEditable(trip);
            assertTripCompletedForShopSales(trip);
            await assertRateEntryLocked(client, trip.id, trip);
            const deliveryRow = await client.query(`SELECT shop_id, amount FROM trip_deliveries WHERE id = $1`, [id]);
            const saleShopId = deliveryRow.rowCount ? num(deliveryRow.rows[0].shop_id) : 0;
            const saleAmount = deliveryRow.rowCount ? num(deliveryRow.rows[0].amount) : 0;
            // Permanent-lock rule (mirrors trg_trip_deliveries_rate_lock): a
            // delivery on a rate-locked trip may never be removed — the 10-day
            // correction window only ever permits in-place edits of
            // birds/weight/rate (and the derived amount), never deletion. This
            // soft-delete path performs an UPDATE (deleted = TRUE) rather than a
            // hard DELETE, so it would otherwise evade the trigger's DELETE arm and
            // wrongly allow removal even after the window has closed. Reject it
            // explicitly with the same 409 pattern used by update(), using the
            // existing evaluateRateLock helper (no duplicated 10-day math).
            const rateRow = await client.query(`SELECT rate_locked_at FROM trips WHERE id = $1`, [tripId]);
            const rateLock = evaluateRateLock({
                rate_completed: true,
                rate_locked_at: rateRow.rows[0]?.rate_locked_at ?? null,
            });
            if (rateLock.rateCompleted) {
                throw new AppError(409, "Rate correction window expired - deleting locked after Rate Entry", {
                    tripId: trip.id,
                    rateLockedAt: rateLock.rateLockedAt,
                    correctionWindowClosesAt: rateLock.correctionWindowClosesAt,
                });
            }
            // Unreachable: assertRateEntryLocked already guarantees rate_completed =
            // TRUE for every reachable Shop Sale. Kept as the protective gate above
            // so the service layer cannot be tricked into deleting an unlocked trip.
            const result = await client.query(`UPDATE trip_deliveries SET deleted = TRUE, deleted_at = NOW(), deleted_reason = $2
         WHERE id = $1 AND deleted = FALSE
         RETURNING id`, [id, reason ?? null]);
            if (!result.rowCount)
                throw new AppError(404, "Shop sale not found");
            if (saleShopId > 0) {
                // Deleting a sale removes its DEBIT → credit the shop back by the full
                // amount so outstanding no longer includes this sale.
                await applyCredit(client, saleShopId, {
                    entryDate: trip.tripDate,
                    entryType: "correction",
                    referenceType: "shop_sale",
                    referenceId: id,
                    note: "Shop sale debit reversed (deleted)",
                }, saleAmount);
            }
            await recalcTripDeliveryTotals(client, trip.id);
            const row = await client.query(`${SALE_SELECT} WHERE d.id = $1`, [id]);
            return mapDeliverySale(row.rows[0]);
        });
    },
};
//# sourceMappingURL=shopSalesService.js.map