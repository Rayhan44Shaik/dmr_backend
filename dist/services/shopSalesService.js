import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { dateOnly, isoOrNull, num, str } from "../utils/coerce.js";
import { assertBirdTypeExists, assertShopActive } from "../utils/fkValidation.js";
import { paginatedResult, } from "../utils/pagination.js";
import { rethrowIfAppError } from "../utils/pgErrors.js";
import { evaluateRateLock } from "../utils/rateLock.js";
import { assertOpsStatus, assertShopSaleRateInRange, parseBody, shopSaleBodySchema, } from "../validation/operations.js";
import { generateSaleNo, recalcTripDeliveryTotals, sumActiveDeliveries, } from "../utils/tripDeliverySync.js";
import { assertExactBirdConservation, assertExactWeightConservation, assertShopSalesEligible, birdConservationError, formatShopNo, redistributeShopAllocations, rescaleDeliveryPerBox, shopSalesWindowFromDb, weightConservationError, } from "../utils/shopSalesRules.js";
import { applyCorrection, applyCredit, applyDebit, } from "../utils/shopLedger.js";
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
    const rateCompleted = Boolean(row.rate_completed);
    const rateLockedAt = row.rate_locked_at == null ? null : new Date(str(row.rate_locked_at));
    const lock = evaluateRateLock({
        rate_completed: rateCompleted,
        rate_locked_at: rateLockedAt,
    });
    const windowOpen = Boolean(row.shop_sales_editable);
    const expiresOn = row.shop_sales_expires_on == null ? null : dateOnly(row.shop_sales_expires_on);
    return {
        id: num(row.id),
        saleNo: str(row.sale_no),
        saleDate: tripDate,
        shopId: row.shop_id == null ? null : num(row.shop_id),
        shopName: str(row.shop_name),
        shopNo: formatShopNo(row.master_shop_no == null ? null : num(row.master_shop_no)),
        birdTypeId: row.bird_type_id == null ? null : num(row.bird_type_id),
        birdType: str(row.bird_type),
        tripId: row.trip_id == null ? null : num(row.trip_id),
        tripNo: str(row.trip_no),
        vehicleNo: row.vehicle_no == null ? null : str(row.vehicle_no),
        farmName: row.source_farm == null ? null : str(row.source_farm),
        pickupBirds: num(row.pickup_birds),
        pickupWeight: num(row.pickup_weight),
        mortalityWeight: num(row.total_mortality_weight),
        weightLoss: num(row.weight_loss),
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
        editable: !saleDeleted && !tripDeleted && windowOpen,
        windowExpiresAt: expiresOn,
        approvedBy: row.approved_by == null ? null : str(row.approved_by),
        approvedAt,
        createdAt: row.created_at == null ? null : str(row.created_at),
        updatedAt: row.updated_at == null ? null : str(row.updated_at),
        rateCompleted,
        rateLockedAt: lock.rateLockedAt,
        rateLockedBy: row.rate_locked_by == null ? null : str(row.rate_locked_by),
        correctionWindowExpired: !windowOpen,
        correctionWindowClosesAt: expiresOn,
    };
}
const ELIGIBLE_TRIP = `t.status = 'Completed'
  AND COALESCE(t.deleted, FALSE) = FALSE
  AND COALESCE(t.rate_completed, FALSE) = TRUE
  AND COALESCE(t.delivery_step_submitted, FALSE) = TRUE
  AND COALESCE(t.expenses_step_submitted, FALSE) = TRUE`;
const SALE_SELECT = `
  SELECT d.*,
         t.trip_no, t.trip_date, t.status AS trip_status, t.deleted AS trip_deleted,
         t.deleted_reason, t.approved_by, t.approved_at, t.vehicle_no, t.source_farm,
         t.rate_completed, t.rate_locked_at, t.rate_locked_by,
         t.total_birds AS pickup_birds, t.dc_weight AS pickup_weight,
         t.weight_loss, t.total_mortality_weight,
         s.shop_no AS master_shop_no,
         (CURRENT_DATE <= (t.trip_date + INTERVAL '10 days')::date) AS shop_sales_editable,
         (t.trip_date + INTERVAL '10 days')::date AS shop_sales_expires_on,
         re.rate AS re_rate
  FROM trip_deliveries d
  INNER JOIN trips t ON t.id = d.trip_id
  LEFT JOIN shops s ON s.id = d.shop_id
  LEFT JOIN rate_entry re ON re.trip_id = t.id
`;
async function lockTrip(client, tripId) {
    const result = await client.query(`SELECT id, trip_no, status, deleted, approved_at, trip_date,
            total_birds, dc_weight, COALESCE(weight_loss, 0) AS weight_loss,
            COALESCE(rate_completed, FALSE) AS rate_completed,
            COALESCE(delivery_step_submitted, FALSE) AS delivery_step_submitted,
            COALESCE(expenses_step_submitted, FALSE) AS expenses_step_submitted
       FROM trips WHERE id = $1 FOR UPDATE`, [tripId]);
    if (!result.rowCount)
        throw new AppError(404, `Trip ${tripId} not found`);
    const row = result.rows[0];
    return {
        id: num(row.id),
        tripNo: str(row.trip_no),
        status: str(row.status),
        deleted: Boolean(row.deleted),
        approvedAt: isoOrNull(row.approved_at),
        tripDate: dateOnly(row.trip_date) ?? "",
        capacityBirds: num(row.total_birds),
        capacityWeight: num(row.dc_weight),
        weightLoss: num(row.weight_loss),
        rateCompleted: Boolean(row.rate_completed),
        deliveryStepSubmitted: Boolean(row.delivery_step_submitted),
        expensesStepSubmitted: Boolean(row.expenses_step_submitted),
    };
}
function assertEligibleTrip(trip) {
    assertShopSalesEligible({
        tripNo: trip.tripNo,
        status: trip.status,
        deleted: trip.deleted,
        rateCompleted: trip.rateCompleted,
        deliveryStepSubmitted: trip.deliveryStepSubmitted,
        expensesStepSubmitted: trip.expensesStepSubmitted,
    });
}
async function assertWithinEditWindow(client, trip) {
    const window = await shopSalesWindowFromDb(client, trip.tripDate);
    if (!window.editable) {
        throw new AppError(409, `Trip ${trip.tripNo} is locked — Shop Sales edits/deletes are allowed only until ${window.expiresOn} (trip date + 10 calendar days).`);
    }
}
async function loadAllocations(client, tripId) {
    const result = await client.query(`SELECT id, shop_id, birds, weight, mortality, COALESCE(mort_kg, 0) AS mort_kg
       FROM trip_deliveries
      WHERE trip_id = $1 AND deleted = FALSE
      ORDER BY id`, [tripId]);
    return result.rows.map((r) => ({
        id: num(r.id),
        shopId: r.shop_id == null ? null : num(r.shop_id),
        birds: num(r.birds),
        weight: num(r.weight),
        mortality: num(r.mortality),
        mortKg: num(r.mort_kg),
    }));
}
async function persistAllocations(client, previous, next, rateById) {
    for (const row of next) {
        const before = previous.find((p) => p.id === row.id);
        if (!before)
            continue;
        if (before.birds === row.birds && Math.abs(before.weight - row.weight) < 0.0005)
            continue;
        const rate = rateById.get(row.id) ?? 0;
        await client.query(`UPDATE trip_deliveries
          SET birds = $2,
              weight = $3,
              amount = ROUND(($3::numeric) * ($4::numeric), 2),
              updated_at = NOW()
        WHERE id = $1`, [row.id, row.birds, row.weight, rate]);
        await rescaleDeliveryPerBox(client, row.id, row.birds, row.weight);
    }
}
async function getDeliveryTripId(client, saleId) {
    const result = await client.query(`SELECT trip_id FROM trip_deliveries WHERE id = $1`, [saleId]);
    if (!result.rowCount)
        throw new AppError(404, "Shop sale not found");
    return num(result.rows[0].trip_id);
}
export const shopSalesService = {
    async list(filters = {}) {
        const clauses = [];
        const params = [];
        clauses.push(ELIGIBLE_TRIP);
        clauses.push(`d.shop_id IS NOT NULL`);
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
        const result = await query(`${SALE_SELECT} WHERE d.id = $1 AND ${ELIGIBLE_TRIP} AND d.shop_id IS NOT NULL`, [id]);
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
                assertEligibleTrip(trip);
                await assertWithinEditWindow(client, trip);
                if (data.shopId == null) {
                    throw new AppError(400, "shopId is required to create a Shop Sale");
                }
                await assertShopActive(data.shopId, client);
                if (data.birdTypeId != null)
                    await assertBirdTypeExists(data.birdTypeId, client);
                const existingSameShop = await client.query(`SELECT id FROM trip_deliveries
            WHERE trip_id = $1 AND shop_id = $2 AND deleted = FALSE
            ORDER BY id LIMIT 1`, [trip.id, data.shopId]);
                if (existingSameShop.rowCount) {
                    const row = await client.query(`${SALE_SELECT} WHERE d.id = $1`, [existingSameShop.rows[0].id]);
                    return mapDeliverySale(row.rows[0]);
                }
                const birds = data.birds ?? 0;
                const weight = data.weight ?? 0;
                const existing = await sumActiveDeliveries(client, trip.id);
                const birdTotal = existing.birds + existing.mortalityCount + birds;
                const weightTotal = Number((existing.weight + existing.mortalityWeight + weight).toFixed(3));
                if (birdTotal > trip.capacityBirds) {
                    throw new AppError(422, "Delivery birds cannot exceed the trip pickup birds.");
                }
                if (weightTotal > trip.capacityWeight) {
                    throw new AppError(422, "Delivery weight cannot exceed the trip pickup weight.");
                }
                let rate = data.rate;
                if (rate == null) {
                    const rateRow = await client.query(`SELECT rate FROM trip_deliveries WHERE trip_id = $1 AND rate IS NOT NULL ORDER BY id LIMIT 1`, [trip.id]);
                    rate = rateRow.rowCount ? Number(rateRow.rows[0].rate) : 0;
                }
                if (rate != null && rate > 0)
                    assertShopSaleRateInRange(rate);
                const amountRow = await client.query(`SELECT ROUND(($1::numeric) * ($2::numeric), 2)::text AS amount`, [weight, rate ?? 0]);
                const amount = num(amountRow.rows[0].amount);
                const saleNo = await generateSaleNo(client, trip.id, trip.tripNo);
                const result = await client.query(`INSERT INTO trip_deliveries (
             trip_id, sale_no, shop_id, shop_name, bird_type_id, bird_type,
             birds, weight, mortality, rate, amount, remarks
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           RETURNING id`, [
                    trip.id,
                    saleNo,
                    data.shopId,
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
                await applyDebit(client, data.shopId, {
                    entryDate: dateOnly(trip.tripDate) ?? "",
                    entryType: "sale",
                    referenceType: "shop_sale",
                    referenceId: saleId,
                    note: "Shop sale debit (created via Shop Sales)",
                }, amount);
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
        return withTransaction(async (client) => {
            const tripId = await getDeliveryTripId(client, id);
            const trip = await lockTrip(client, tripId);
            assertEligibleTrip(trip);
            await assertWithinEditWindow(client, trip);
            const current = await client.query(`SELECT d.* FROM trip_deliveries d WHERE d.id = $1 FOR UPDATE`, [id]);
            if (!current.rowCount)
                throw new AppError(404, "Shop sale not found");
            const cur = current.rows[0];
            if (Boolean(cur.deleted) || cur.shop_id == null) {
                throw new AppError(404, "Shop sale not found");
            }
            if (data.rate != null)
                assertShopSaleRateInRange(data.rate);
            const birdsChanged = data.birds !== undefined;
            const weightChanged = data.weight !== undefined;
            const nextBirds = data.birds ?? num(cur.birds);
            const nextWeight = data.weight ?? num(cur.weight);
            const effectiveRate = data.rate ?? num(cur.rate);
            const saleShopId = num(cur.shop_id);
            const oldAmount = num(cur.amount);
            if (birdsChanged || weightChanged) {
                const previous = await loadAllocations(client, trip.id);
                const redistributed = redistributeShopAllocations(previous, id, nextBirds, nextWeight);
                if (birdsChanged) {
                    const pre = previous.reduce((s, r) => s + r.birds + r.mortality, 0);
                    const post = redistributed.reduce((s, r) => s + r.birds + r.mortality, 0);
                    if (pre !== post) {
                        throw birdConservationError({
                            pickup: trip.capacityBirds,
                            delivery: redistributed.reduce((s, r) => s + r.birds, 0),
                            mortality: redistributed.reduce((s, r) => s + r.mortality, 0),
                        });
                    }
                    if (pre === trip.capacityBirds) {
                        assertExactBirdConservation(trip.capacityBirds, redistributed);
                    }
                    else if (post > trip.capacityBirds) {
                        assertExactBirdConservation(trip.capacityBirds, redistributed);
                    }
                }
                if (weightChanged) {
                    const pre = Number(previous.reduce((s, r) => s + r.weight + r.mortKg, 0).toFixed(3));
                    const post = Number(redistributed.reduce((s, r) => s + r.weight + r.mortKg, 0).toFixed(3));
                    if (Math.abs(pre - post) >= 0.001) {
                        throw weightConservationError({
                            pickup: trip.capacityWeight,
                            delivery: Number(redistributed.reduce((s, r) => s + r.weight, 0).toFixed(3)),
                            mortality: Number(redistributed.reduce((s, r) => s + r.mortKg, 0).toFixed(3)),
                            weightLoss: trip.weightLoss,
                        });
                    }
                    const combined = Number((post + trip.weightLoss).toFixed(3));
                    if (Math.abs(combined - trip.capacityWeight) < 0.001) {
                        assertExactWeightConservation(trip.capacityWeight, trip.weightLoss, redistributed);
                    }
                    else if (combined > trip.capacityWeight) {
                        assertExactWeightConservation(trip.capacityWeight, trip.weightLoss, redistributed);
                    }
                }
                const rates = await client.query(`SELECT id, COALESCE(rate, 0)::text AS rate FROM trip_deliveries WHERE trip_id = $1 AND deleted = FALSE`, [trip.id]);
                const rateById = new Map(rates.rows.map((r) => [num(r.id), num(r.rate)]));
                rateById.set(id, effectiveRate);
                await persistAllocations(client, previous, redistributed, rateById);
            }
            const amountRow = await client.query(`UPDATE trip_deliveries SET
           bird_type_id = COALESCE($2, bird_type_id),
           bird_type = COALESCE($3, bird_type),
           rate = $4,
           amount = ROUND((weight::numeric) * ($4::numeric), 2),
           remarks = COALESCE($5, remarks),
           updated_at = NOW()
         WHERE id = $1
         RETURNING amount::text AS amount`, [id, data.birdTypeId ?? null, data.birdType ?? null, effectiveRate, data.remarks ?? null]);
            if (!amountRow.rowCount)
                throw new AppError(404, "Shop sale not found");
            const nextAmount = num(amountRow.rows[0].amount);
            if (saleShopId > 0) {
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
            assertEligibleTrip(trip);
            await assertWithinEditWindow(client, trip);
            const deliveryRow = await client.query(`SELECT shop_id, amount FROM trip_deliveries WHERE id = $1`, [id]);
            const saleShopId = deliveryRow.rowCount ? num(deliveryRow.rows[0].shop_id) : 0;
            const saleAmount = deliveryRow.rowCount ? num(deliveryRow.rows[0].amount) : 0;
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