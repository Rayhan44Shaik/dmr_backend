import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { dateOnly, isoOrNull, num, numOrNull, str } from "../utils/coerce.js";
import { resolveEmployeeNames, validateTripForeignKeys, } from "../utils/fkValidation.js";
import { computeTripExpense } from "../utils/operationsHelpers.js";
import { paginatedResult, } from "../utils/pagination.js";
import { rethrowIfAppError } from "../utils/pgErrors.js";
import { computeFarmAmount, computeTotalKm, computeTripKpis, sumDieselFuel, } from "../utils/tripCalculations.js";
import { loadDcPhoto, syncDieselToFuelExpenses } from "../utils/tripFuelSync.js";
import { computeMileageKmL, extractDieselFromBody, flattenDiesel, loadDieselEntries, mapDieselRow, replaceDiesel, stripProtectedStep5Fields, submitDieselEntry, updateDieselEntry, deleteDieselEntry, validateExpensePayload, validateFinalStep5, withSerializedTripDiesel, } from "../utils/tripStep5.js";
import { assertPickupBoxNumbers, loadVehicleBoxCapacity, persistPickupPhotos, recalcPickupTotals, removePickupBoxes, replacePickupBoxes, upsertPickupBoxes, } from "../utils/tripPickup.js";
import { assertWithinCapacity, generateSaleNo, recalcTripDeliveryTotals, remainingPickupBox, sumActiveDeliveries } from "../utils/tripDeliverySync.js";
import { getLatestVehicleMeter, lockVehicleForMeterWrite, preciseIsoOrUndefined, validateVehicleMeter, } from "../utils/vehicleMeterLedger.js";
import { assertStepOrder, getResumeLabel, getResumeStep, getWizardProgress, TRIP_STEP_LABELS, } from "../utils/tripResume.js";
import { assertTripResourcesAvailable, lockTripResourcesForWrite, } from "../validation/tripResourceValidation.js";
import { assertTripStatus } from "../validation/operations.js";
import { assertTripReadyForCompletion, assertTripStatusTransition, parseDeliverySave, parseTripAutosave, validateStepSubmit, } from "../validation/trips.js";
function mapTripBase(row) {
    return {
        id: num(row.id),
        tripNo: str(row.trip_no),
        tripDate: dateOnly(row.trip_date) ?? "",
        status: str(row.status),
        startTime: isoOrNull(row.start_time),
        vehicleId: numOrNull(row.vehicle_id),
        vehicleNo: row.vehicle_no == null ? null : str(row.vehicle_no),
        driverId: numOrNull(row.driver_id),
        driverName: row.driver_name == null ? null : str(row.driver_name),
        supervisorId: numOrNull(row.supervisor_id),
        supervisorName: row.supervisor_name == null ? null : str(row.supervisor_name),
        openingMeter: numOrNull(row.opening_meter),
        advanceAmount: numOrNull(row.advance_amount),
        startStepSubmitted: Boolean(row.start_step_submitted),
        startStepSubmittedAt: isoOrNull(row.start_step_submitted_at),
        sourceFarmId: numOrNull(row.source_farm_id),
        sourceFarm: row.source_farm == null ? null : str(row.source_farm),
        reachedTime: isoOrNull(row.reached_time),
        destMeter: numOrNull(row.dest_meter),
        pickupTolls: num(row.pickup_tolls),
        farmAddress: row.farm_address == null ? null : str(row.farm_address),
        avgBirdWeight: numOrNull(row.avg_bird_weight),
        farmRemarks: row.farm_remarks == null ? null : str(row.farm_remarks),
        farmBirdTypeId: numOrNull(row.farm_bird_type_id),
        farmBirdType: row.farm_bird_type == null ? null : str(row.farm_bird_type),
        farmBirdCount: numOrNull(row.farm_bird_count),
        farmLoadWeight: numOrNull(row.farm_load_weight),
        farmRate: numOrNull(row.farm_rate),
        farmAmount: numOrNull(row.farm_amount),
        farmGpsLat: numOrNull(row.farm_gps_lat),
        farmGpsLon: numOrNull(row.farm_gps_lon),
        farmGpsAccuracy: numOrNull(row.farm_gps_accuracy),
        farmGpsTime: isoOrNull(row.farm_gps_time),
        farmStepSubmitted: Boolean(row.farm_step_submitted),
        farmStepSubmittedAt: isoOrNull(row.farm_step_submitted_at),
        dcWeight: num(row.dc_weight),
        totalBirds: num(row.total_birds),
        boxes: num(row.boxes),
        avgWeight: num(row.avg_weight),
        pickupLoadTime: isoOrNull(row.pickup_load_time),
        dcPhotoKey: row.dc_photo_key == null ? null : str(row.dc_photo_key),
        pickupStepSubmitted: Boolean(row.pickup_step_submitted),
        pickupStepSubmittedAt: isoOrNull(row.pickup_step_submitted_at),
        deliveryStepSubmitted: Boolean(row.delivery_step_submitted),
        deliveriesStepSubmittedAt: isoOrNull(row.deliveries_step_submitted_at),
        closingMeter: numOrNull(row.closing_meter),
        endMeter: numOrNull(row.end_meter),
        endTime: isoOrNull(row.end_time),
        deliveryTolls: num(row.delivery_tolls),
        destinationTolls: num(row.destination_tolls),
        meals: num(row.meals),
        loading: num(row.loading),
        mealsTiffin: num(row.meals_tiffin),
        vehicleMaintenance: num(row.vehicle_maintenance),
        othersRC: num(row.others_rc),
        others1Amt: num(row.others1_amt),
        others2Amt: num(row.others2_amt),
        others3Amt: num(row.others3_amt),
        others4Amt: num(row.others4_amt),
        others5Amt: num(row.others5_amt),
        fuel: num(row.fuel),
        expense: num(row.expense),
        driverBata: num(row.driver_bata),
        helperBata: num(row.helper_bata),
        totalTripExpense: num(row.total_trip_expense),
        remarks: str(row.remarks),
        submittedAt: isoOrNull(row.submitted_at),
        endStepSubmitted: Boolean(row.end_step_submitted),
        expensesStepSubmitted: Boolean(row.expenses_step_submitted),
        expensesStepSubmittedAt: isoOrNull(row.expenses_step_submitted_at),
        totalKm: num(row.total_km),
        totalShops: num(row.total_shops),
        totalWeight: num(row.total_weight),
        totalDeliveredWeight: num(row.total_delivered_weight),
        totalBirdsDelivered: num(row.total_birds_delivered),
        totalMortality: num(row.total_mortality),
        totalMortalityCount: num(row.total_mortality_count),
        totalMortalityWeight: num(row.total_mortality_weight),
        weightLoss: num(row.weight_loss),
        survivalRate: num(row.survival_rate),
        lastShop: row.last_shop == null ? null : str(row.last_shop),
        rateCompleted: Boolean(row.rate_completed),
        deleted: Boolean(row.deleted),
        deletedReason: row.deleted_reason == null ? null : str(row.deleted_reason),
        approvedBy: row.approved_by == null ? null : str(row.approved_by),
        approvedAt: isoOrNull(row.approved_at),
        rejectedBy: row.rejected_by == null ? null : str(row.rejected_by),
        rejectedAt: isoOrNull(row.rejected_at),
        rejectedReason: row.rejected_reason == null ? null : str(row.rejected_reason),
        createdAt: isoOrNull(row.created_at),
        updatedAt: isoOrNull(row.updated_at),
    };
}
function childCounts(row) {
    return {
        boxCount: num(row.box_count),
        deliveryCount: num(row.delivery_count),
        dieselCount: num(row.diesel_count),
    };
}
function hasNumber(value) {
    return value != null && Number(value) > 0;
}
function normalizeTripTimestamp(value) {
    if (value == null || value === "")
        return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString();
    }
    const raw = String(value).trim();
    // Already ISO-compatible.
    if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
        const parsed = new Date(raw);
        return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    // Handles localized values such as:
    // "8/13/2026, 8:39:06 PM"
    const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
    if (match) {
        const [, month, day, year, hour, minute, second = "0", meridiem] = match;
        let h = Number(hour);
        if (meridiem.toUpperCase() === "PM" && h !== 12) {
            h += 12;
        }
        if (meridiem.toUpperCase() === "AM" && h === 12) {
            h = 0;
        }
        const normalized = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` +
            `T${String(h).padStart(2, "0")}:${minute}:${second.padStart(2, "0")}`;
        const parsed = new Date(normalized);
        return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
/**
 * Derived per-step wizard state used by the UI:
 *  - "completed"    â†’ step was successfully submitted (server flag)
 *  - "saved"        â†’ partial data persisted but step not submitted
 *  - "not_started"  â†’ no meaningful data for the step
 */
function computeStepStatuses(src, counts) {
    const startSaved = Boolean(src.vehicleId) ||
        Boolean(src.driverId) ||
        hasNumber(src.openingMeter) ||
        hasNumber(src.advanceAmount) ||
        Boolean(src.startTime);
    const farmSaved = Boolean(src.sourceFarmId) ||
        hasNumber(src.destMeter) ||
        Boolean(src.reachedTime) ||
        hasNumber(src.pickupTolls) ||
        Boolean(src.farmBirdTypeId) ||
        hasNumber(src.farmBirdCount) ||
        hasNumber(src.farmLoadWeight) ||
        hasNumber(src.farmRate) ||
        Boolean(src.farmAddress) ||
        hasNumber(src.avgBirdWeight);
    const pickupSaved = hasNumber(src.dcWeight) ||
        hasNumber(src.totalBirds) ||
        hasNumber(src.boxes) ||
        Boolean(src.dcPhotoKey) ||
        counts.boxCount > 0;
    const deliverySaved = counts.deliveryCount > 0 ||
        hasNumber(src.totalShops) ||
        hasNumber(src.totalWeight) ||
        hasNumber(src.totalBirdsDelivered);
    const expenseSaved = hasNumber(src.closingMeter) ||
        hasNumber(src.endMeter) ||
        Boolean(src.endTime) ||
        hasNumber(src.deliveryTolls) ||
        hasNumber(src.destinationTolls) ||
        hasNumber(src.meals) ||
        hasNumber(src.mealsTiffin) ||
        hasNumber(src.loading) ||
        hasNumber(src.vehicleMaintenance) ||
        hasNumber(src.othersRC) ||
        hasNumber(src.others1Amt) ||
        hasNumber(src.others2Amt) ||
        hasNumber(src.others3Amt) ||
        hasNumber(src.others4Amt) ||
        hasNumber(src.others5Amt) ||
        hasNumber(src.driverBata) ||
        hasNumber(src.helperBata) ||
        counts.dieselCount > 0 ||
        Boolean(src.remarks);
    return {
        start: src.startStepSubmitted ? "completed" : startSaved ? "saved" : "not_started",
        farm: src.farmStepSubmitted ? "completed" : farmSaved ? "saved" : "not_started",
        pickup: src.pickupStepSubmitted ? "completed" : pickupSaved ? "saved" : "not_started",
        deliveries: src.deliveryStepSubmitted ? "completed" : deliverySaved ? "saved" : "not_started",
        expenses: src.expensesStepSubmitted || src.endStepSubmitted
            ? "completed"
            : expenseSaved
                ? "saved"
                : "not_started",
    };
}
function toTripSummary(row) {
    const base = mapTripBase(row);
    const flags = {
        startStepSubmitted: base.startStepSubmitted,
        farmStepSubmitted: base.farmStepSubmitted,
        pickupStepSubmitted: base.pickupStepSubmitted,
        deliveryStepSubmitted: base.deliveryStepSubmitted,
        expensesStepSubmitted: base.expensesStepSubmitted,
        endStepSubmitted: base.endStepSubmitted,
        status: base.status,
        deleted: base.deleted,
    };
    return {
        ...base,
        helpers: [],
        loaders: [],
        boxDetails: [],
        deliveries: [],
        dieselEntries: [],
        resumeStep: getResumeStep(flags),
        resumeStepLabel: getResumeLabel(flags),
        wizardProgress: getWizardProgress(flags),
        stepStatuses: computeStepStatuses(base, childCounts(row)),
    };
}
async function loadTripExtras(client, tripId) {
    const crew = await client.query(`SELECT * FROM trip_crew WHERE trip_id = $1`, [tripId]);
    const boxes = await client.query(`SELECT * FROM trip_boxes WHERE trip_id = $1 ORDER BY box_no`, [tripId]);
    const deliveries = await client.query(`SELECT * FROM trip_deliveries WHERE trip_id = $1 ORDER BY serial_no NULLS LAST, id`, [tripId]);
    const diesel = await client.query(`SELECT * FROM trip_diesel_entries WHERE trip_id = $1 ORDER BY row_index`, [tripId]);
    const deliveryBoxes = await client.query(`SELECT db.* FROM trip_delivery_boxes db
     JOIN trip_deliveries d ON d.id = db.delivery_id
     WHERE d.trip_id = $1`, [tripId]);
    const perBox = await client.query(`SELECT pb.* FROM trip_delivery_per_box pb
     JOIN trip_deliveries d ON d.id = pb.delivery_id
     WHERE d.trip_id = $1`, [tripId]);
    const helpers = crew.rows
        .filter((r) => r.role === "helper")
        .map((r) => str(r.employee_name));
    const loaders = crew.rows
        .filter((r) => r.role === "loader")
        .map((r) => str(r.employee_name));
    const boxDetails = boxes.rows.map((r) => {
        const birds = num(r.birds);
        const weight = num(r.weight);
        // Old rows have no avg_weight — derive it safely (never divide by zero).
        const avgWeight = numOrNull(r.avg_weight) ??
            (birds > 0 ? Number((weight / birds).toFixed(3)) : null);
        return {
            boxNo: num(r.box_no),
            birds,
            weight,
            avgWeight,
        };
    });
    const boxesByDelivery = new Map();
    for (const row of deliveryBoxes.rows) {
        const id = num(row.delivery_id);
        const list = boxesByDelivery.get(id) ?? [];
        list.push(num(row.box_no));
        boxesByDelivery.set(id, list);
    }
    const perBoxByDelivery = new Map();
    for (const row of perBox.rows) {
        const id = num(row.delivery_id);
        const list = perBoxByDelivery.get(id) ?? [];
        list.push({
            boxNo: num(row.box_no),
            birds: num(row.birds),
            weight: num(row.weight),
        });
        perBoxByDelivery.set(id, list);
    }
    const mappedDeliveries = deliveries.rows.map((r) => {
        const id = num(r.id);
        return {
            id,
            serialNo: numOrNull(r.serial_no),
            boxNo: numOrNull(r.box_no),
            shopId: numOrNull(r.shop_id),
            shopName: str(r.shop_name),
            birdTypeId: numOrNull(r.bird_type_id),
            birdType: str(r.bird_type),
            birds: num(r.birds),
            weight: num(r.weight),
            mortality: num(r.mortality),
            mortKg: numOrNull(r.mort_kg),
            rate: numOrNull(r.rate),
            amount: num(r.amount),
            remarks: str(r.remarks),
            deliveryMode: str(r.delivery_mode) || "box",
            selectedBoxIds: boxesByDelivery.get(id) ?? [],
            farmBirds: numOrNull(r.farm_birds),
            farmWeight: numOrNull(r.farm_weight),
            perBoxData: perBoxByDelivery.get(id) ?? [],
            autoCaptureTime: isoOrNull(r.auto_capture_time),
            clientKey: r.client_key == null ? null : str(r.client_key),
        };
    });
    const dieselEntries = diesel.rows.map((r) => mapDieselRow(r));
    return { helpers, loaders, boxDetails, deliveries: mappedDeliveries, dieselEntries };
}
async function hydrateTrip(client, row, options = {}) {
    const base = mapTripBase(row);
    const extras = await loadTripExtras(client, base.id);
    const submittedDiesel = extras.dieselEntries.filter((d) => d.submitted !== false);
    const dieselLitres = submittedDiesel.reduce((s, d) => s + Number(d.litres ?? 0), 0);
    const mileageKmL = computeMileageKmL(base.openingMeter, base.closingMeter ?? base.endMeter, dieselLitres);
    const vehicleBoxCapacity = await loadVehicleBoxCapacity(client, base.vehicleId);
    let dcPhoto = {
        dcPhotoKey: base.dcPhotoKey ?? null,
        dcPhotoMime: null,
        dcPhotoData: null,
        dcPhotoKey2: null,
        dcPhotoMime2: null,
        dcPhotoData2: null,
    };
    if (options.includeDcPhoto) {
        dcPhoto = await loadDcPhoto(client, base.id, base.dcPhotoKey ?? null);
    }
    return { ...base, ...extras, ...dcPhoto, vehicleBoxCapacity, mileageKmL };
}
async function generateTripNo(client, tripDate) {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`trip_no_${tripDate}`]);
    const ymd = tripDate.replace(/-/g, "");
    const result = await client.query(`SELECT COALESCE(MAX((substring(trip_no from '\\d{3}$'))::int), 0)::text AS m
       FROM trips
      WHERE trip_date = $1::date AND trip_no ~ '^TR-\\d{8}-\\d{3}$'`, [tripDate]);
    const seq = String(Number(result.rows[0].m) + 1).padStart(3, "0");
    return `TR-${ymd}-${seq}`;
}
async function assertOptimisticLock(client, tripId, expectedUpdatedAt) {
    if (!expectedUpdatedAt)
        return;
    const current = await client.query(`SELECT updated_at FROM trips WHERE id = $1`, [tripId]);
    if (!current.rowCount)
        throw new AppError(404, `Trip ${tripId} not found`);
    const dbUpdated = isoOrNull(current.rows[0].updated_at);
    const expected = isoOrNull(expectedUpdatedAt);
    if (dbUpdated && expected && dbUpdated !== expected) {
        throw new AppError(409, "Trip was modified by another session", {
            tripId,
            expectedUpdatedAt: expected,
            currentUpdatedAt: dbUpdated,
        });
    }
}
async function enrichMasterDenorm(client, body) {
    if (body.vehicleId && !body.vehicleNo) {
        const v = await client.query(`SELECT vehicle_number FROM vehicles WHERE id = $1`, [
            body.vehicleId,
        ]);
        if (v.rowCount)
            body.vehicleNo = str(v.rows[0].vehicle_number);
    }
    if (body.driverId && !body.driverName) {
        const e = await client.query(`SELECT employee_name FROM employees WHERE id = $1`, [
            body.driverId,
        ]);
        if (e.rowCount)
            body.driverName = str(e.rows[0].employee_name);
    }
    if (body.supervisorId && !body.supervisorName) {
        const e = await client.query(`SELECT employee_name FROM employees WHERE id = $1`, [
            body.supervisorId,
        ]);
        if (e.rowCount)
            body.supervisorName = str(e.rows[0].employee_name);
    }
    if (body.sourceFarmId && !body.sourceFarm) {
        const f = await client.query(`SELECT farm_name FROM farms WHERE id = $1`, [
            body.sourceFarmId,
        ]);
        if (f.rowCount)
            body.sourceFarm = str(f.rows[0].farm_name);
    }
    if (body.farmBirdTypeId && !body.farmBirdType) {
        const b = await client.query(`SELECT bird_type FROM bird_types WHERE id = $1`, [
            body.farmBirdTypeId,
        ]);
        if (b.rowCount)
            body.farmBirdType = str(b.rows[0].bird_type);
    }
}
async function replaceCrew(client, tripId, helpers = [], loaders = []) {
    await client.query(`DELETE FROM trip_crew WHERE trip_id = $1`, [tripId]);
    // De-duplicate dropped names so a helper/loader selected twice on the same
    // submission can never trip the (trip_id, employee_name, role) unique index.
    const uniqueNames = (names) => [...new Set(names.map((n) => (n ?? "").trim()).filter(Boolean))];
    const resolvedHelpers = await resolveEmployeeNames(client, uniqueNames(helpers), "helper");
    for (const member of resolvedHelpers) {
        await client.query(`INSERT INTO trip_crew (trip_id, employee_id, employee_name, role)
       VALUES ($1,$2,$3,'helper')`, [tripId, member.employeeId, member.employeeName]);
    }
    const resolvedLoaders = await resolveEmployeeNames(client, uniqueNames(loaders), "loader");
    for (const member of resolvedLoaders) {
        await client.query(`INSERT INTO trip_crew (trip_id, employee_id, employee_name, role)
       VALUES ($1,$2,$3,'loader')`, [tripId, member.employeeId, member.employeeName]);
    }
}
async function replaceBoxes(client, tripId, boxes = []) {
    await replacePickupBoxes(client, tripId, boxes);
}
/**
 * Trip Entry Step 4 (Deliveries) capacity guard â€” backend-authoritative,
 * mirrors the same rule already proven correct for Shop Sales edits
 * (assertWithinCapacity / sumActiveDeliveries in tripDeliverySync.ts, and
 * shopSalesService.ts's lockTrip()): the sum of every shop delivery's birds
 * PLUS mortality must never exceed the trip's originally loaded birds, and
 * the sum of every delivery's weight PLUS mortality-weight must never
 * exceed the originally loaded weight. Birds and weight are independent â€”
 * neither is derived from the other.
 *
 * replaceDeliveries() below is a full delete+reinsert of the whole delivery
 * list in one call (not a single-row edit like Shop Sales), so there is no
 * "existing minus self" to exclude â€” every row in the incoming `deliveries`
 * array is summed against the trip's own capacity. The trip row is locked
 * FOR UPDATE first (same pattern already proven correct under real
 * concurrency for Shop Sales in shopSalesService.ts) so two concurrent Step
 * 4 submissions for the same trip can never both race past capacity.
 */
async function assertDeliveriesWithinCapacity(client, tripId, deliveries) {
    const tripRow = await client.query(`SELECT farm_bird_count, farm_load_weight, total_birds, dc_weight
       FROM trips WHERE id = $1 FOR UPDATE`, [tripId]);
    if (!tripRow.rowCount)
        return; // caller already guarantees the trip exists
    const row = tripRow.rows[0];
    const farmBirdCount = num(row.farm_bird_count);
    const farmLoadWeight = num(row.farm_load_weight);
    const capacityBirds = farmBirdCount > 0 ? farmBirdCount : num(row.total_birds);
    const capacityWeight = farmLoadWeight > 0 ? farmLoadWeight : num(row.dc_weight);
    let totalBirds = 0;
    let totalWeight = 0;
    for (const d of deliveries) {
        const birds = Number(d.birds ?? 0);
        const weight = Number(d.weight ?? 0);
        if (!Number.isInteger(birds) || birds < 0) {
            throw new AppError(422, `Shop delivery birds must be a non-negative whole number (got ${d.birds}).`);
        }
        if (!Number.isFinite(weight) || weight < 0) {
            throw new AppError(422, `Shop delivery weight must be a non-negative number (got ${d.weight}).`);
        }
        totalBirds += birds + Number(d.mortality ?? 0);
        totalWeight += weight + Number(d.mortKg ?? 0);
    }
    assertWithinCapacity({
        label: "birds",
        available: capacityBirds,
        alreadyAllocated: 0,
        requested: totalBirds,
    });
    assertWithinCapacity({
        label: "weight",
        available: capacityWeight,
        alreadyAllocated: 0,
        requested: totalWeight,
    });
}
async function replaceDeliveries(client, tripId, deliveries = []) {
    if (deliveries.length > 0) {
        await assertDeliveriesWithinCapacity(client, tripId, deliveries);
    }
    await client.query(`DELETE FROM trip_deliveries WHERE trip_id = $1`, [tripId]);
    if (deliveries.length === 0)
        return;
    // trip_deliveries.sale_no is NOT NULL (023_shop_sales_hardening.sql) in the
    // existing "<tripNo>-S<seq>" format also used by shopSalesService.ts for
    // post-completion Shop Sales edits. This wizard path (Step 4, Draft/Pending
    // trips) never populated it, which is exactly why new inserts here started
    // violating the constraint â€” reuse the same generateSaleNo() rather than
    // inventing a second numbering scheme. Full delete+reinsert (existing
    // behavior above) means the per-trip sequence restarts each save; that is
    // unchanged from how serial_no/id already behave for this same function.
    const tripRow = await client.query(`SELECT trip_no FROM trips WHERE id = $1`, [tripId]);
    const tripNo = tripRow.rows[0]?.trip_no ?? `TR-${tripId}`;
    for (const [index, d] of deliveries.entries()) {
        const amount = d.amount != null && d.amount > 0
            ? d.amount
            : Number((Number(d.weight ?? 0) * Number(d.rate ?? 0)).toFixed(2));
        const saleNo = await generateSaleNo(client, tripId, tripNo);
        const inserted = await client.query(`INSERT INTO trip_deliveries (
         trip_id, sale_no, serial_no, box_no, shop_id, shop_name, bird_type_id, bird_type,
         birds, weight, mortality, mort_kg, rate, amount, remarks, delivery_mode,
         farm_birds, farm_weight, auto_capture_time, client_key
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,COALESCE($19::timestamptz, NOW()),$20)
       RETURNING id`, [
            tripId,
            saleNo,
            d.serialNo ?? index + 1,
            d.boxNo ?? null,
            d.shopId ?? null,
            d.shopName ?? "",
            d.birdTypeId ?? null,
            d.birdType ?? "",
            d.birds ?? 0,
            d.weight ?? 0,
            d.mortality ?? 0,
            d.mortKg ?? 0,
            d.rate ?? null,
            amount,
            d.remarks ?? "",
            d.deliveryMode ?? "box",
            d.farmBirds ?? null,
            d.farmWeight ?? null,
            normalizeTripTimestamp(d.autoCaptureTime),
            d.clientKey ?? null,
        ]);
        const deliveryId = num(inserted.rows[0].id);
        for (const boxNo of d.selectedBoxIds ?? []) {
            await client.query(`INSERT INTO trip_delivery_boxes (delivery_id, box_no) VALUES ($1,$2)
         ON CONFLICT DO NOTHING`, [deliveryId, boxNo]);
        }
        for (const pb of d.perBoxData ?? []) {
            await client.query(`INSERT INTO trip_delivery_per_box (delivery_id, box_no, birds, weight)
         VALUES ($1,$2,$3,$4)`, [deliveryId, pb.boxNo, pb.birds ?? 0, pb.weight ?? 0]);
        }
    }
}
function buildListWhere(filters) {
    const clauses = [];
    const params = [];
    // A caller explicitly filtering status=Deleted is asking for deleted trips
    // by definition (soft-delete always sets status='Deleted'), so the default
    // "hide deleted" clause must not be ANDed in â€” otherwise the two clauses
    // contradict each other and the query always returns zero rows.
    if (!filters.includeDeleted && filters.status !== "Deleted") {
        clauses.push(`deleted = FALSE`);
        // A trip whose `status` is 'Deleted' is deleted even if the boolean flag
        // was left inconsistent by a legacy write path â€” never list it again.
        if (!filters.status) {
            clauses.push(`status <> 'Deleted'`);
        }
    }
    if (filters.fromDate) {
        params.push(filters.fromDate);
        clauses.push(`trip_date >= $${params.length}`);
    }
    if (filters.toDate) {
        params.push(filters.toDate);
        clauses.push(`trip_date <= $${params.length}`);
    }
    if (filters.status) {
        params.push(filters.status);
        clauses.push(`status = $${params.length}`);
    }
    if (filters.vehicleId) {
        params.push(filters.vehicleId);
        clauses.push(`vehicle_id = $${params.length}`);
    }
    if (filters.supervisorId) {
        params.push(filters.supervisorId);
        clauses.push(`supervisor_id = $${params.length}`);
    }
    if (filters.search) {
        params.push(`%${filters.search}%`);
        clauses.push(`(trip_no ILIKE $${params.length} OR vehicle_no ILIKE $${params.length} OR driver_name ILIKE $${params.length} OR supervisor_name ILIKE $${params.length} OR source_farm ILIKE $${params.length})`);
    }
    return {
        where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
        params,
    };
}
/**
 * Trip List query â€” read-only historical view.
 *
 * Eligibility is enforced IN THE DATABASE, never in the caller:
 *   â€¢ only `status = 'Completed'` trips (the system's completed/approved state)
 *   â€¢ only `deleted = FALSE` rows
 * Draft / Pending / Deleted / soft-deleted / inconsistent rows are excluded
 * by the WHERE clause itself, regardless of any filter the client sends.
 */
function buildTripListWhere(filters) {
    const clauses = [`deleted = FALSE`, `status = 'Completed'`];
    const params = [];
    if (filters.fromDate) {
        params.push(filters.fromDate);
        clauses.push(`trip_date >= $${params.length}`);
    }
    if (filters.toDate) {
        params.push(filters.toDate);
        clauses.push(`trip_date <= $${params.length}`);
    }
    if (filters.vehicleId) {
        params.push(filters.vehicleId);
        clauses.push(`vehicle_id = $${params.length}`);
    }
    if (filters.supervisorId) {
        params.push(filters.supervisorId);
        clauses.push(`supervisor_id = $${params.length}`);
    }
    if (filters.driverId) {
        params.push(filters.driverId);
        clauses.push(`driver_id = $${params.length}`);
    }
    if (filters.farmId) {
        params.push(filters.farmId);
        clauses.push(`source_farm_id = $${params.length}`);
    }
    if (filters.search) {
        params.push(`%${filters.search}%`);
        clauses.push(`(trip_no ILIKE $${params.length} OR vehicle_no ILIKE $${params.length} OR driver_name ILIKE $${params.length} OR supervisor_name ILIKE $${params.length} OR source_farm ILIKE $${params.length})`);
    }
    return {
        where: `WHERE ${clauses.join(" AND ")}`,
        params,
    };
}
function applyComputedFields(body, boxDetails, deliveries) {
    const kpis = computeTripKpis({
        boxes: boxDetails,
        deliveries,
        farmBirdCount: body.farmBirdCount,
        farmLoadWeight: body.farmLoadWeight,
        dcWeight: body.dcWeight,
        totalBirds: body.totalBirds,
    });
    body.totalWeight = kpis.totalWeight;
    body.totalDeliveredWeight = kpis.totalDeliveredWeight;
    body.totalBirdsDelivered = kpis.totalBirdsDelivered;
    body.totalMortality = kpis.totalMortality;
    body.totalMortalityCount = kpis.totalMortalityCount;
    body.totalMortalityWeight = kpis.totalMortalityWeight;
    body.weightLoss = kpis.weightLoss;
    body.survivalRate = kpis.survivalRate;
    body.totalShops = kpis.totalShops;
    body.lastShop = kpis.lastShop;
    if (boxDetails.length) {
        body.boxes = kpis.boxes;
        body.totalBirds = kpis.totalBirds;
        body.avgWeight = kpis.avgWeight;
        // DC weight is derived from the persisted box rows (authoritative).
        body.dcWeight = kpis.totalWeight;
        body.totalWeight = kpis.totalWeight;
    }
    if (deliveries.length) {
        body.deliveries = kpis.deliveries;
    }
    body.totalKm = computeTotalKm(body.openingMeter, body.closingMeter, body.endMeter);
    if (body.farmLoadWeight != null || body.farmRate != null) {
        body.farmAmount = computeFarmAmount(body.farmLoadWeight, body.farmRate);
    }
}
export const tripsService = {
    async list(filters = {}) {
        const { where, params } = buildListWhere(filters);
        if (filters.pagination) {
            const countResult = await query(`SELECT COUNT(*)::text AS c FROM trips ${where}`, params);
            const total = Number(countResult.rows[0]?.c ?? 0);
            const pagedParams = [...params, filters.pagination.limit, filters.pagination.offset];
            const result = await query(`SELECT trips.*,
                (SELECT COUNT(*) FROM trip_boxes b WHERE b.trip_id = trips.id) AS box_count,
                (SELECT COUNT(*) FROM trip_deliveries d WHERE d.trip_id = trips.id) AS delivery_count,
                (SELECT COUNT(*) FROM trip_diesel_entries e WHERE e.trip_id = trips.id) AS diesel_count
         FROM trips ${where}
         ORDER BY trip_date DESC, id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, pagedParams);
            const summaries = result.rows.map(toTripSummary);
            return paginatedResult(summaries, total, filters.pagination);
        }
        const result = await query(`SELECT trips.*,
              (SELECT COUNT(*) FROM trip_boxes b WHERE b.trip_id = trips.id) AS box_count,
              (SELECT COUNT(*) FROM trip_deliveries d WHERE d.trip_id = trips.id) AS delivery_count,
              (SELECT COUNT(*) FROM trip_diesel_entries e WHERE e.trip_id = trips.id) AS diesel_count
       FROM trips ${where} ORDER BY trip_date DESC, id DESC`, params);
        if (filters.full) {
            return withTransaction(async (client) => {
                const trips = [];
                for (const row of result.rows) {
                    const trip = await hydrateTrip(client, row);
                    trips.push({
                        ...trip,
                        ...flattenDiesel(trip.dieselEntries ?? []),
                        stepStatuses: computeStepStatuses(trip, {
                            boxCount: trip.boxDetails.length,
                            deliveryCount: trip.deliveries.length,
                            dieselCount: (trip.dieselEntries ?? []).length,
                        }),
                    });
                }
                return trips;
            });
        }
        return result.rows.map(toTripSummary);
    },
    /**
     * Trip List â€” returns ONLY completed/approved, non-deleted trips.
     * The eligibility rule lives in the SQL WHERE clause (see buildTripListWhere),
     * so the frontend can never pull Draft/Pending/Deleted rows and filter locally.
     */
    async listCompleted(filters = {}) {
        const { where, params } = buildTripListWhere(filters);
        if (filters.pagination) {
            const countResult = await query(`SELECT COUNT(*)::text AS c FROM trips ${where}`, params);
            const total = Number(countResult.rows[0]?.c ?? 0);
            const pagedParams = [
                ...params,
                filters.pagination.limit,
                filters.pagination.offset,
            ];
            const result = await query(`SELECT * FROM trips ${where}
         ORDER BY trip_date DESC, id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, pagedParams);
            return paginatedResult(result.rows.map(toTripSummary), total, filters.pagination);
        }
        const result = await query(`SELECT * FROM trips ${where} ORDER BY trip_date DESC, id DESC`, params);
        return result.rows.map(toTripSummary);
    },
    /**
     * Trip List detail â€” full trip only when eligible (completed + not deleted).
     * A Draft / Pending / Deleted trip id returns 404, so the read-only view can
     * never surface a trip that should not be in the list.
     */
    async getCompletedById(id) {
        const result = await query(`SELECT * FROM trips WHERE id = $1 AND deleted = FALSE AND status = 'Completed'`, [id]);
        if (!result.rowCount) {
            throw new AppError(404, `Trip ${id} not found in Trip List`);
        }
        return withTransaction(async (client) => {
            const trip = await hydrateTrip(client, result.rows[0], {
                includeDcPhoto: true,
            });
            const flags = {
                startStepSubmitted: trip.startStepSubmitted,
                farmStepSubmitted: trip.farmStepSubmitted,
                pickupStepSubmitted: trip.pickupStepSubmitted,
                deliveryStepSubmitted: trip.deliveryStepSubmitted,
                expensesStepSubmitted: trip.expensesStepSubmitted,
                endStepSubmitted: trip.endStepSubmitted,
                status: trip.status,
                deleted: trip.deleted,
            };
            return {
                ...trip,
                ...flattenDiesel(trip.dieselEntries ?? []),
                resumeStep: getResumeStep(flags),
                resumeStepLabel: getResumeLabel(flags),
                wizardProgress: getWizardProgress(flags),
            };
        });
    },
    async getById(id) {
        const result = await query(`SELECT * FROM trips WHERE id = $1`, [id]);
        if (!result.rowCount)
            throw new AppError(404, `Trip ${id} not found`);
        return withTransaction(async (client) => {
            const trip = await hydrateTrip(client, result.rows[0], { includeDcPhoto: true });
            const flags = {
                startStepSubmitted: trip.startStepSubmitted,
                farmStepSubmitted: trip.farmStepSubmitted,
                pickupStepSubmitted: trip.pickupStepSubmitted,
                deliveryStepSubmitted: trip.deliveryStepSubmitted,
                expensesStepSubmitted: trip.expensesStepSubmitted,
                endStepSubmitted: trip.endStepSubmitted,
                status: trip.status,
                deleted: trip.deleted,
            };
            return {
                ...trip,
                ...flattenDiesel(trip.dieselEntries ?? []),
                resumeStep: getResumeStep(flags),
                resumeStepLabel: getResumeLabel(flags),
                wizardProgress: getWizardProgress(flags),
                stepStatuses: computeStepStatuses(trip, {
                    boxCount: trip.boxDetails.length,
                    deliveryCount: trip.deliveries.length,
                    dieselCount: (trip.dieselEntries ?? []).length,
                }),
            };
        });
    },
    async submitDiesel(tripId, body) {
        return withSerializedTripDiesel(tripId, () => withTransaction(async (client) => {
            const existing = await client.query(`SELECT * FROM trips WHERE id = $1`, [tripId]);
            if (!existing.rowCount)
                throw new AppError(404, `Trip ${tripId} not found`);
            await submitDieselEntry(client, existing.rows[0], body);
            const row = await client.query(`SELECT * FROM trips WHERE id = $1`, [tripId]);
            const trip = await hydrateTrip(client, row.rows[0], { includeDcPhoto: true });
            return { ...trip, ...flattenDiesel(trip.dieselEntries ?? []) };
        }));
    },
    async updateDiesel(tripId, entryId, body) {
        return withSerializedTripDiesel(tripId, () => withTransaction(async (client) => {
            const existing = await client.query(`SELECT * FROM trips WHERE id = $1`, [tripId]);
            if (!existing.rowCount)
                throw new AppError(404, `Trip ${tripId} not found`);
            await updateDieselEntry(client, existing.rows[0], entryId, body);
            const row = await client.query(`SELECT * FROM trips WHERE id = $1`, [tripId]);
            const trip = await hydrateTrip(client, row.rows[0], { includeDcPhoto: true });
            return { ...trip, ...flattenDiesel(trip.dieselEntries ?? []) };
        }));
    },
    async deleteDiesel(tripId, entryId) {
        return withSerializedTripDiesel(tripId, () => withTransaction(async (client) => {
            const existing = await client.query(`SELECT * FROM trips WHERE id = $1`, [tripId]);
            if (!existing.rowCount)
                throw new AppError(404, `Trip ${tripId} not found`);
            if (Boolean(existing.rows[0].deleted)) {
                throw new AppError(422, "Cannot modify a deleted trip");
            }
            await deleteDieselEntry(client, tripId, entryId);
            const row = await client.query(`SELECT * FROM trips WHERE id = $1`, [tripId]);
            const trip = await hydrateTrip(client, row.rows[0], { includeDcPhoto: true });
            return { ...trip, ...flattenDiesel(trip.dieselEntries ?? []) };
        }));
    },
    async createDraft(body = {}) {
        return withTransaction(async (client) => {
            try {
                const tripDate = dateOnly(body.tripDate) ??
                    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                // Server-only numbering on create (see save()).
                const tripNo = await generateTripNo(client, tripDate);
                const inserted = await client.query(`INSERT INTO trips (trip_no, trip_date, status) VALUES ($1,$2,'Draft') RETURNING *`, [tripNo, tripDate]);
                const trip = await hydrateTrip(client, inserted.rows[0]);
                const flags = {
                    startStepSubmitted: trip.startStepSubmitted,
                    farmStepSubmitted: trip.farmStepSubmitted,
                    pickupStepSubmitted: trip.pickupStepSubmitted,
                    deliveryStepSubmitted: trip.deliveryStepSubmitted,
                    expensesStepSubmitted: trip.expensesStepSubmitted,
                    status: trip.status,
                    deleted: trip.deleted,
                };
                return {
                    ...trip,
                    resumeStep: getResumeStep(flags) ?? "start",
                    resumeStepLabel: getResumeLabel(flags) ?? "Step 1 â€” Trip Header",
                    wizardProgress: getWizardProgress(flags),
                    stepStatuses: computeStepStatuses(trip, {
                        boxCount: trip.boxDetails.length,
                        deliveryCount: trip.deliveries.length,
                        dieselCount: (trip.dieselEntries ?? []).length,
                    }),
                };
            }
            catch (err) {
                rethrowIfAppError(err);
                throw err;
            }
        });
    },
    /** Autosave engine â€” partial upsert with optimistic locking */
    async save(id, body) {
        parseTripAutosave(body);
        // Deletion is permanent and atomic: whenever a write marks a trip deleted
        // (via `status` or the `deleted` flag), keep both in lockstep so a soft-
        // deleted trip can never partially un-delete and reappear in Trip List.
        if (body.status === "Deleted" || body.deleted === true) {
            body.status = "Deleted";
            body.deleted = true;
        }
        return withTransaction(async (client) => {
            try {
                let tripId = id;
                let existing = null;
                if (tripId) {
                    existing = await client.query(`SELECT * FROM trips WHERE id = $1`, [tripId]);
                    if (!existing.rowCount)
                        throw new AppError(404, `Trip ${tripId} not found`);
                    if (existing.rows[0].deleted) {
                        throw new AppError(422, "Cannot modify a deleted trip", { tripId });
                    }
                    await assertOptimisticLock(client, tripId, body.expectedUpdatedAt ?? body.updatedAt);
                }
                // Trip number is generated ONLY at creation, server-side, locked.
                // Editing a trip never generates a new number (BUG 2: sequence is
                // consumed per trip date and a deleted trip keeps its number).
                await validateTripForeignKeys(body, client);
                await enrichMasterDenorm(client, body);
                // Resource availability is DB-backed and transaction-safe. Lock the
                // selected vehicle/employees FIRST so two concurrent Step 1 submits
                // cannot both pass the availability SELECT and insert two trips.
                // Re-check occupancy while those rows are locked. Self-exclusion uses
                // the current trip id so Edit can keep its own resources.
                if (body.vehicleId != null || body.driverId != null || body.supervisorId != null ||
                    body.helpers?.length || body.loaders?.length) {
                    const resourceInput = {
                        tripId: tripId ?? 0,
                        vehicleId: body.vehicleId ?? null,
                        driverId: body.driverId ?? null,
                        supervisorId: body.supervisorId ?? null,
                        helpers: body.helpers ?? [],
                        loaders: body.loaders ?? [],
                    };
                    await lockTripResourcesForWrite(resourceInput, client);
                    await assertTripResourcesAvailable(resourceInput, client);
                }
                if (!tripId && body.status === "Pending" && body.expensesStepSubmitted !== true) {
                    body.status = "Draft";
                }
                if (!tripId) {
                    const tripDate = dateOnly(body.tripDate) ??
                        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                    // A new trip is numbered ONLY by the server. Never trust a
                    // client-supplied tripNo here: a stale value forwarded by the UI
                    // collides with trips_trip_no_key (23505) and surfaces to the user
                    // as the Generic "Duplicate record" 409 â€” even for a different vehicle.
                    const tripNo = await generateTripNo(client, tripDate);
                    const inserted = await client.query(`INSERT INTO trips (trip_no, trip_date, status) VALUES ($1,$2,$3) RETURNING id`, [tripNo, tripDate, body.status ?? "Draft"]);
                    tripId = num(inserted.rows[0].id);
                }
                const dieselEntries = extractDieselFromBody(body);
                const boxDetails = body.boxDetails ?? [];
                const deliveries = body.deliveries ?? [];
                if (body.step5Finalize === true && tripId) {
                    await client.query(`SELECT pg_advisory_xact_lock($1)`, [tripId]);
                    await client.query(`SELECT id FROM trips WHERE id = $1 FOR UPDATE`, [tripId]);
                    const live = await client.query(`SELECT * FROM trips WHERE id = $1`, [tripId]);
                    const persistedDiesel = (await loadDieselEntries(client, tripId)).filter((d) => d.submitted);
                    validateFinalStep5(live.rows[0], body, persistedDiesel);
                    const sums = await client.query(`SELECT COALESCE(SUM(amount), 0)::text AS amt
               FROM trip_diesel_entries WHERE trip_id = $1 AND submitted = TRUE`, [tripId]);
                    body.fuel = Number(sums.rows[0].amt);
                    const endMeter = numOrNull(body.endMeter ?? body.closingMeter);
                    body.closingMeter = endMeter;
                    body.endMeter = endMeter;
                    body.totalKm = computeTotalKm(numOrNull(live.rows[0].opening_meter), endMeter);
                    body.skipDiesel = true;
                    delete body.step5Finalize;
                }
                // Draft stays Draft through Steps 1–4. Only a successful Step 5 submit
                // (expensesStepSubmitted=true in this same transaction) moves the trip
                // to Pending. Wizard writes must not invent Pending without Step 5, and
                // must not clobber Pending/Completed once Step 5 is already in.
                const existingStatus = existing?.rowCount ? str(existing.rows[0].status) : "Draft";
                const expensesAlready = Boolean(existing?.rows[0]?.expenses_step_submitted);
                const submittingExpenses = body.expensesStepSubmitted === true;
                if (existingStatus === "Completed" || existingStatus === "Deleted") {
                    // Part Q: a Completed (or Deleted) trip stays Completed (or Deleted)
                    // through ordinary wizard editing — including a Step 5 re-submit,
                    // which carries status:"Pending" from the step flags. Never demote.
                    if (body.status != null && body.status !== existingStatus)
                        delete body.status;
                }
                else if (submittingExpenses) {
                    body.status = "Pending";
                }
                else if (!expensesAlready) {
                    if (body.status === "Pending" || existingStatus === "Pending") {
                        body.status = "Draft";
                    }
                }
                else if (existingStatus === "Pending" &&
                    body.status != null &&
                    body.status !== existingStatus &&
                    body.status !== "Deleted") {
                    delete body.status;
                }
                // ---- Universal vehicle meter validation ----
                // Only runs on a real step submission (start/expenses), never on
                // "Save Progress" autosave (submitStep already strips these flags for
                // autosave bodies before calling save() â€” see submitStep below), so
                // partial in-progress drafts are never blocked mid-entry.
                if (body.startStepSubmitted === true || body.expensesStepSubmitted === true) {
                    const vehicleIdForMeter = numOrNull(body.vehicleId) ?? (existing ? numOrNull(existing.rows[0].vehicle_id) : null);
                    if (vehicleIdForMeter == null) {
                        throw new AppError(422, "A vehicle must be selected before submitting this step.");
                    }
                    // The trip's business date â€” primary chronological key (see the
                    // vehicle_meter_events view's comment for why date, not timestamp,
                    // is primary: it keeps same-day cross-module comparisons fair).
                    const tripBusinessDate = dateOnly(body.tripDate) ?? (existing ? dateOnly(existing.rows[0].trip_date) : null);
                    if (!tripBusinessDate) {
                        throw new AppError(422, "Trip date is required before submitting this step.");
                    }
                    // Row lock makes "read latest -> validate -> write" atomic for this
                    // vehicle: a concurrent request for the same vehicle blocks here
                    // until this transaction commits or rolls back.
                    await lockVehicleForMeterWrite(client, vehicleIdForMeter);
                    if (body.startStepSubmitted === true) {
                        const effectiveOpening = numOrNull(body.openingMeter) ??
                            (existing ? numOrNull(existing.rows[0].opening_meter) : null);
                        if (effectiveOpening != null) {
                            // On a re-submit/edit, prefer the trip's own already-persisted
                            // instant over "now" â€” matches the view's own COALESCE so a
                            // re-validated edit is compared against the SAME neighbors it
                            // originally had, not shoved past every same-day record created
                            // since (see fleetMaintenanceService.update() for the same fix).
                            const openingInstant = normalizeTripTimestamp(body.startTime) ??
                                (existing
                                    ? (preciseIsoOrUndefined(existing.rows[0].start_step_submitted_at) ??
                                        preciseIsoOrUndefined(existing.rows[0].start_time) ??
                                        preciseIsoOrUndefined(existing.rows[0].created_at))
                                    : undefined);
                            await validateVehicleMeter(client, {
                                vehicleId: vehicleIdForMeter,
                                newMeter: effectiveOpening,
                                eventDate: tripBusinessDate,
                                eventInstant: openingInstant,
                                exclude: { sourceType: ["TRIP_START", "TRIP_END"], recordId: tripId },
                                context: "Trip start meter",
                            });
                        }
                    }
                    if (body.expensesStepSubmitted === true) {
                        const effectiveOpening = numOrNull(body.openingMeter) ??
                            (existing ? numOrNull(existing.rows[0].opening_meter) : null);
                        const effectiveClosing = numOrNull(body.closingMeter) ??
                            numOrNull(body.endMeter) ??
                            (existing
                                ? (numOrNull(existing.rows[0].closing_meter) ??
                                    numOrNull(existing.rows[0].end_meter))
                                : null);
                        // Same "preserve the original instant on an edit" reasoning as
                        // the opening-meter block above.
                        const closingEventInstant = normalizeTripTimestamp(body.endTime) ??
                            (existing
                                ? (preciseIsoOrUndefined(existing.rows[0].expenses_step_submitted_at) ??
                                    preciseIsoOrUndefined(existing.rows[0].end_time) ??
                                    preciseIsoOrUndefined(existing.rows[0].created_at))
                                : undefined);
                        if (effectiveClosing != null) {
                            if (effectiveOpening != null && effectiveClosing < effectiveOpening) {
                                throw new AppError(422, `Trip closing meter (${effectiveClosing} KM) cannot be less than the trip's own opening meter (${effectiveOpening} KM).`);
                            }
                            await validateVehicleMeter(client, {
                                vehicleId: vehicleIdForMeter,
                                newMeter: effectiveClosing,
                                eventDate: tripBusinessDate,
                                eventInstant: closingEventInstant,
                                exclude: { sourceType: ["TRIP_START", "TRIP_END"], recordId: tripId },
                                context: "Trip closing meter",
                            });
                        }
                        // Trip-generated diesel/fuel entries follow the same universal
                        // rule where a meter reading is actually persisted. Self-excluded
                        // via the diesel row's own already-synced fuel_expenses record
                        // (identity: trip_id + trip_fuel_entry_index, source_type='TRIP'
                        // â€” see tripFuelSync.ts) so re-submitting the same value never
                        // compares a reading against itself.
                        for (const entry of dieselEntries) {
                            const meter = numOrNull(entry.meter);
                            if (meter == null || meter <= 0)
                                continue;
                            const existingSynced = await client.query(`SELECT id FROM fuel_expenses
                 WHERE trip_id = $1 AND trip_fuel_entry_index = $2
                   AND source_type = 'TRIP' AND deleted = FALSE`, [tripId, entry.rowIndex]);
                            await validateVehicleMeter(client, {
                                vehicleId: vehicleIdForMeter,
                                newMeter: meter,
                                eventDate: tripBusinessDate,
                                eventInstant: closingEventInstant,
                                exclude: existingSynced.rowCount
                                    ? { sourceType: "FUEL", recordId: existingSynced.rows[0].id }
                                    : undefined,
                                context: `Diesel entry #${entry.rowIndex} meter reading`,
                            });
                        }
                    }
                }
                // ---- end universal vehicle meter validation ----
                if (boxDetails.length || deliveries.length) {
                    applyComputedFields(body, boxDetails, deliveries);
                }
                else if (body.openingMeter != null && (body.closingMeter != null || body.endMeter != null)) {
                    body.totalKm = computeTotalKm(body.openingMeter, body.closingMeter, body.endMeter);
                }
                if (dieselEntries.length) {
                    body.fuel = sumDieselFuel(dieselEntries);
                }
                const expenseParts = computeTripExpense({
                    fuel: body.fuel,
                    pickupTolls: body.pickupTolls,
                    deliveryTolls: body.deliveryTolls,
                    destinationTolls: body.destinationTolls,
                    meals: body.meals,
                    mealsTiffin: body.mealsTiffin,
                    driverBata: body.driverBata,
                    helperBata: body.helperBata,
                    loading: body.loading,
                    vehicleMaintenance: body.vehicleMaintenance,
                    othersRC: body.othersRC,
                    others1Amt: body.others1Amt,
                    others2Amt: body.others2Amt,
                    others3Amt: body.others3Amt,
                    others4Amt: body.others4Amt,
                    others5Amt: body.others5Amt,
                    expense: body.expense,
                });
                if (body.fuel != null ||
                    body.driverBata != null ||
                    body.meals != null ||
                    body.expense != null) {
                    body.totalTripExpense = body.totalTripExpense ?? expenseParts.totalTripExpense;
                }
                await client.query(`UPDATE trips SET
            trip_date = COALESCE($2, trip_date),
            status = COALESCE($3, status),
            -- start_time is NEVER taken from the client: the official Step 1
            -- timestamp is captured server-side (DB NOW()) on first submission
            -- in the guarded block below, and is immutable on edit.
            start_time = COALESCE($4, start_time),
            vehicle_id = COALESCE($5, vehicle_id),
            vehicle_no = COALESCE($6, vehicle_no),
            driver_id = COALESCE($7, driver_id),
            driver_name = COALESCE($8, driver_name),
            supervisor_id = COALESCE($9, supervisor_id),
            supervisor_name = COALESCE($10, supervisor_name),
            -- A Step 1 submit always carries opening_meter / advance_amount
            -- (number or NULL when left empty). $67/$68 flag "explicitly
            -- provided" so an empty field actually CLEARS the column (writes
            -- NULL) instead of COALESCE silently keeping the old/default value.
            opening_meter = CASE WHEN $67::boolean THEN $11 ELSE opening_meter END,
            advance_amount = CASE WHEN $68::boolean THEN $12 ELSE advance_amount END,
            -- Part D: step-submitted flags are monotonic latches. Once a step
            -- has been submitted it can never become unsubmitted again, on ANY
            -- path (Save Progress, wizard edit, generic PUT, mobile sync), no
            -- matter what the client sends. First submission still works:
            -- COALESCE(TRUE, FALSE) OR FALSE = TRUE.
            start_step_submitted = COALESCE($13, start_step_submitted) OR start_step_submitted,
            source_farm_id = COALESCE($14, source_farm_id),
            source_farm = COALESCE($15, source_farm),
            reached_time = COALESCE($16, reached_time),
            dest_meter = COALESCE($17, dest_meter),
            pickup_tolls = COALESCE($18, pickup_tolls),
            farm_address = COALESCE($19, farm_address),
            avg_bird_weight = COALESCE($20, avg_bird_weight),
            farm_remarks = COALESCE($21, farm_remarks),
            farm_step_submitted = COALESCE($22, farm_step_submitted) OR farm_step_submitted,
            dc_weight = COALESCE($23, dc_weight),
            total_birds = COALESCE($24, total_birds),
            boxes = COALESCE($25, boxes),
            avg_weight = COALESCE($26, avg_weight),
            pickup_load_time = COALESCE($27, pickup_load_time),
            dc_photo_key = COALESCE($28, dc_photo_key),
            pickup_step_submitted = COALESCE($29, pickup_step_submitted) OR pickup_step_submitted,
            delivery_step_submitted = COALESCE($30, delivery_step_submitted) OR delivery_step_submitted,
            closing_meter = COALESCE($31, closing_meter),
            end_meter = COALESCE($32, end_meter),
            end_time = COALESCE($33, end_time),
            delivery_tolls = COALESCE($34, delivery_tolls),
            destination_tolls = COALESCE($35, destination_tolls),
            meals = COALESCE($36, meals),
            loading = COALESCE($37, loading),
            meals_tiffin = COALESCE($38, meals_tiffin),
            vehicle_maintenance = COALESCE($39, vehicle_maintenance),
            others_rc = COALESCE($40, others_rc),
            others1_amt = COALESCE($41, others1_amt),
            others2_amt = COALESCE($42, others2_amt),
            others3_amt = COALESCE($43, others3_amt),
            others4_amt = COALESCE($44, others4_amt),
            others5_amt = COALESCE($45, others5_amt),
            fuel = COALESCE($46, fuel),
            expense = COALESCE($47, expense),
            remarks = COALESCE($48, remarks),
            -- Guarded like expenses_step_submitted_at below: a plain COALESCE($49, ...)
            -- let two concurrent Step 5 submits race, since the "first submission" check
            -- happened in JS before either transaction committed, so whichever request's
            -- UPDATE landed last silently overwrote the other's timestamp.
            submitted_at = CASE
              WHEN COALESCE($51::boolean, FALSE) AND submitted_at IS NULL THEN COALESCE($49, NOW())
              ELSE submitted_at END,
            end_step_submitted = COALESCE($50, end_step_submitted) OR end_step_submitted,
            expenses_step_submitted = COALESCE($51, expenses_step_submitted) OR expenses_step_submitted,
            total_km = COALESCE($52, total_km),
            total_shops = COALESCE($53, total_shops),
            total_weight = COALESCE($54, total_weight),
            total_delivered_weight = COALESCE($55, total_delivered_weight),
            total_birds_delivered = COALESCE($56, total_birds_delivered),
            total_mortality = COALESCE($57, total_mortality),
            total_mortality_count = COALESCE($58, total_mortality_count),
            total_mortality_weight = COALESCE($59, total_mortality_weight),
            weight_loss = COALESCE($60, weight_loss),
            survival_rate = COALESCE($61, survival_rate),
            last_shop = COALESCE($62, last_shop),
            rate_completed = COALESCE($63, rate_completed),
            deleted = COALESCE($64, deleted),
            deleted_reason = COALESCE($65, deleted_reason),
            -- Step 2 GPS: COALESCE so omitted/failed capture never overwrites
            -- already-persisted coordinates. Client reached_time is never used.
            farm_gps_lat = COALESCE($69, farm_gps_lat),
            farm_gps_lon = COALESCE($70, farm_gps_lon),
            farm_gps_accuracy = COALESCE($71, farm_gps_accuracy),
            farm_gps_time = COALESCE($72, farm_gps_time),
            approved_by = COALESCE($66, approved_by)
           WHERE id = $1`, [
                    tripId,
                    dateOnly(body.tripDate),
                    body.status ?? null,
                    // start_time is never trusted from the client — the official Step 1
                    // timestamp is set server-side on first submission (guarded block).
                    null,
                    body.vehicleId ?? null,
                    body.vehicleNo ?? null,
                    body.driverId ?? null,
                    body.driverName ?? null,
                    body.supervisorId ?? null,
                    body.supervisorName ?? null,
                    body.openingMeter ?? null,
                    body.advanceAmount ?? null,
                    body.startStepSubmitted ?? null,
                    body.sourceFarmId ?? null,
                    body.sourceFarm ?? null,
                    // reached_time is never trusted from the client — the official Step 2
                    // timestamp is set server-side on first submission (guarded block).
                    null,
                    body.destMeter ?? null,
                    body.pickupTolls ?? null,
                    body.farmAddress ?? null,
                    body.avgBirdWeight ?? null,
                    body.farmRemarks ?? null,
                    body.farmStepSubmitted ?? null,
                    body.dcWeight ?? null,
                    body.totalBirds ?? null,
                    body.boxes ?? null,
                    body.avgWeight ?? null,
                    // pickup_load_time is never trusted from the client — the official
                    // Step 3 timestamp is set server-side on first submission (guarded
                    // block) and is immutable on edit.
                    null,
                    body.dcPhotoKey ?? null,
                    body.pickupStepSubmitted ?? null,
                    body.deliveryStepSubmitted ?? null,
                    body.closingMeter ?? body.endMeter ?? null,
                    body.endMeter ?? body.closingMeter ?? null,
                    normalizeTripTimestamp(body.endTime),
                    body.deliveryTolls ?? body.destinationTolls ?? null,
                    body.destinationTolls ?? body.deliveryTolls ?? null,
                    body.meals ?? null,
                    body.loading ?? null,
                    body.mealsTiffin ?? null,
                    body.vehicleMaintenance ?? null,
                    body.othersRC ?? null,
                    body.others1Amt ?? null,
                    body.others2Amt ?? null,
                    body.others3Amt ?? null,
                    body.others4Amt ?? null,
                    body.others5Amt ?? null,
                    body.fuel ?? null,
                    body.expense ?? null,
                    body.remarks ?? null,
                    normalizeTripTimestamp(body.submittedAt),
                    body.endStepSubmitted ?? null,
                    body.expensesStepSubmitted ?? null,
                    body.totalKm ?? null,
                    body.totalShops ?? null,
                    body.totalWeight ?? null,
                    body.totalDeliveredWeight ?? null,
                    body.totalBirdsDelivered ?? null,
                    body.totalMortality ?? null,
                    body.totalMortalityCount ?? null,
                    body.totalMortalityWeight ?? null,
                    body.weightLoss ?? null,
                    body.survivalRate ?? null,
                    body.lastShop ?? null,
                    // rate_completed is never accepted from the client here â€” it is
                    // exclusively written by rateEntryService.lock() (in sync with
                    // rate_entry.locked), so a generic trip save can never
                    // independently declare a trip "rate complete". Always passing
                    // null preserves the existing DB value via the COALESCE below.
                    null,
                    body.deleted ?? null,
                    body.deletedReason ?? null,
                    body.approvedBy ?? null,
                    // Explicitly-provided flags for the nullable meter/advance fields.
                    body.openingMeter !== undefined,
                    body.advanceAmount !== undefined,
                    body.farmGpsLat ?? null,
                    body.farmGpsLon ?? null,
                    body.farmGpsAccuracy ?? null,
                    normalizeTripTimestamp(body.farmGpsTime),
                ]);
                try {
                    await client.query(`UPDATE trips SET
               farm_bird_type_id = COALESCE($2, farm_bird_type_id),
               farm_bird_type = COALESCE($3, farm_bird_type),
               farm_bird_count = COALESCE($4, farm_bird_count),
               farm_load_weight = COALESCE($5, farm_load_weight),
               farm_rate = COALESCE($6, farm_rate),
               farm_amount = COALESCE($7, farm_amount),
               driver_bata = COALESCE($8, driver_bata),
               helper_bata = COALESCE($9, helper_bata),
               total_trip_expense = COALESCE($10, total_trip_expense)
             WHERE id = $1`, [
                        tripId,
                        body.farmBirdTypeId ?? null,
                        body.farmBirdType ?? null,
                        body.farmBirdCount ?? null,
                        body.farmLoadWeight ?? null,
                        body.farmRate ?? null,
                        body.farmAmount ?? null,
                        body.driverBata ?? null,
                        body.helperBata ?? null,
                        body.totalTripExpense ?? null,
                    ]);
                }
                catch (err) {
                    const code = err.code;
                    if (code !== "42703")
                        throw err;
                }
                // First-submission timestamps (idempotent: first write wins, DB server time).
                // Guarded so code keeps working if the 011 migration hasn't been applied yet.
                try {
                    await client.query(`UPDATE trips SET
               -- Official Step 1 timestamp: captured server-side (DB NOW()) ONLY
               -- on the first successful Submit Start Details (Save Progress strips
               -- the step flag, so this never fires for a partial save). Immutable
               -- on edit; the client clock is never the source of truth.
               start_time = CASE
                 WHEN COALESCE($2::boolean, FALSE) AND start_time IS NULL THEN NOW()
                 ELSE start_time END,
               start_step_submitted_at = CASE
                 WHEN COALESCE($2::boolean, FALSE) AND start_step_submitted_at IS NULL THEN NOW()
                 ELSE start_step_submitted_at END,
               farm_step_submitted_at = CASE
                 WHEN COALESCE($3::boolean, FALSE) AND farm_step_submitted_at IS NULL THEN NOW()
                 ELSE farm_step_submitted_at END,
               -- Official Step 2 timestamp: captured server-side ONLY on the first
               -- successful Submit Farm Details (Save Progress strips the step
               -- flag, so this never fires for a partial save). Immutable on edit.
               reached_time = CASE
                 WHEN COALESCE($3::boolean, FALSE) AND reached_time IS NULL THEN NOW()
                 ELSE reached_time END,
               pickup_step_submitted_at = CASE
                 WHEN COALESCE($4::boolean, FALSE) AND pickup_step_submitted_at IS NULL THEN NOW()
                 ELSE pickup_step_submitted_at END,
               -- Official Step 3 (Pickup) time: server NOW() only on the first
               -- successful Submit; immutable on edit; never captured by Save
               -- Progress (the step flag is stripped in save mode).
               pickup_load_time = CASE
                 WHEN COALESCE($4::boolean, FALSE) AND pickup_load_time IS NULL THEN NOW()
                 ELSE pickup_load_time END,
               deliveries_step_submitted_at = CASE
                 WHEN COALESCE($5::boolean, FALSE) AND deliveries_step_submitted_at IS NULL THEN NOW()
                 ELSE deliveries_step_submitted_at END,
               expenses_step_submitted_at = CASE
                 WHEN COALESCE($6::boolean, FALSE) AND expenses_step_submitted_at IS NULL THEN NOW()
                 ELSE expenses_step_submitted_at END,
               end_time = CASE
                 WHEN COALESCE($6::boolean, FALSE) AND end_time IS NULL THEN NOW()
                 ELSE end_time END
             WHERE id = $1`, [
                        tripId,
                        body.startStepSubmitted ?? null,
                        body.farmStepSubmitted ?? null,
                        body.pickupStepSubmitted ?? null,
                        body.deliveryStepSubmitted ?? null,
                        body.expensesStepSubmitted ?? null,
                    ]);
                }
                catch (err) {
                    const code = err.code;
                    if (code !== "42703")
                        throw err;
                }
                if (body.helpers || body.loaders) {
                    await replaceCrew(client, tripId, body.helpers ?? [], body.loaders ?? []);
                }
                if (Array.isArray(body.boxDetails)) {
                    const writeMode = str(body.pickupBoxWrite);
                    if (writeMode === "upsert") {
                        if (body.boxDetails.length) {
                            await upsertPickupBoxes(client, tripId, body.boxDetails);
                        }
                        const removed = Array.isArray(body.removedBoxNos)
                            ? body.removedBoxNos
                                .map((n) => Number(n))
                                .filter((n) => Number.isInteger(n) && n > 0)
                            : [];
                        if (removed.length) {
                            await removePickupBoxes(client, tripId, removed);
                        }
                        if (body.boxDetails.length || removed.length) {
                            await recalcPickupTotals(client, tripId);
                        }
                    }
                    else if (body.boxDetails.length || writeMode === "replace") {
                        await replaceBoxes(client, tripId, body.boxDetails);
                        await recalcPickupTotals(client, tripId);
                    }
                }
                if (body.deliveries && body.replaceDeliveries === true) {
                    if (existing && existing.rowCount && Boolean(existing.rows[0].rate_completed)) {
                        throw new AppError(409, "Cannot modify deliveries — trip rates are locked by Rate Entry", { tripId });
                    }
                    await replaceDeliveries(client, tripId, body.deliveries);
                }
                if (!body.skipDiesel && (dieselEntries.length || body.dieselEntries)) {
                    await replaceDiesel(client, tripId, dieselEntries);
                }
                const pickupPhotoSync = body.syncPickupPhotos === true;
                const pickupPhotoTouched = pickupPhotoSync ||
                    Boolean(body.dcPhotoData) ||
                    Boolean(body.dcPhotoData2) ||
                    Boolean(body.dcPhotoKey) ||
                    Boolean(body.dcPhotoKey2);
                let persistedPhotoCount = 0;
                if (pickupPhotoTouched) {
                    persistedPhotoCount = await persistPickupPhotos(client, tripId, body, pickupPhotoSync);
                }
                if (body.pickupPhotoRequired === true) {
                    if (!pickupPhotoTouched) {
                        persistedPhotoCount = await persistPickupPhotos(client, tripId, body, true);
                    }
                    if (persistedPhotoCount < 1 || persistedPhotoCount > 2) {
                        throw new AppError(422, "Step 3 requires between 1 and 2 actual uploaded photos.");
                    }
                }
                const row = await client.query(`SELECT * FROM trips WHERE id = $1`, [tripId]);
                const tripRow = row.rows[0];
                const tripDate = dateOnly(tripRow.trip_date) ?? "";
                if (dieselEntries.length && (body.expensesStepSubmitted || body.syncFuel)) {
                    await syncDieselToFuelExpenses(client, tripId, tripDate, dieselEntries, {
                        vehicleId: numOrNull(tripRow.vehicle_id),
                        vehicleNo: tripRow.vehicle_no ? str(tripRow.vehicle_no) : null,
                        driverId: numOrNull(tripRow.driver_id),
                        driverName: tripRow.driver_name ? str(tripRow.driver_name) : null,
                        supervisorId: numOrNull(tripRow.supervisor_id),
                        supervisorName: tripRow.supervisor_name ? str(tripRow.supervisor_name) : null,
                        createdBy: str(body.createdBy ?? "trip-autosave"),
                    });
                }
                const trip = await hydrateTrip(client, tripRow, { includeDcPhoto: true });
                const flags = {
                    startStepSubmitted: trip.startStepSubmitted,
                    farmStepSubmitted: trip.farmStepSubmitted,
                    pickupStepSubmitted: trip.pickupStepSubmitted,
                    deliveryStepSubmitted: trip.deliveryStepSubmitted,
                    expensesStepSubmitted: trip.expensesStepSubmitted,
                    status: trip.status,
                    deleted: trip.deleted,
                };
                return {
                    ...trip,
                    ...flattenDiesel(trip.dieselEntries ?? []),
                    resumeStep: getResumeStep(flags),
                    resumeStepLabel: getResumeLabel(flags),
                    wizardProgress: getWizardProgress(flags),
                    stepStatuses: computeStepStatuses(trip, {
                        boxCount: trip.boxDetails.length,
                        deliveryCount: trip.deliveries.length,
                        dieselCount: (trip.dieselEntries ?? []).length,
                    }),
                };
            }
            catch (err) {
                rethrowIfAppError(err);
                throw err;
            }
        });
    },
    /**
     * Step 4 per-shop persistence (PUT /trips/:id/deliveries).
     *
     * Save Progress / single-shop save ONLY — never submits Step 4, never
     * captures the official Step 4 timestamp, and never runs final-submit
     * validation. Final submit still goes through submitStep → saveDeliveries({ finalize: true }).
     * (full-replace + strict completeness + server NOW() timestamp).
     *
     * Upserts the submitted deliveries idempotently:
     *  - a row matching (trip_id, client_key) is UPDATED — a double-click,
     *    network timeout, browser retry or repeated Save never creates a
     *    duplicate (the partial unique index is the DB-level backstop);
     *  - a row without a client_key is matched by its server id when present;
     *  - anything else is INSERTed.
     *
     * Rows NOT present in the payload are left untouched — saving one shop
     * never wipes shops already saved (per-shop persistence requirement).
     *
     * Runs inside one transaction with the trip row locked FOR UPDATE so
     * concurrent saves for the same trip serialize, and every capacity /
     * box-availability / active-shop check is re-run against the LIVE
     * persisted rows — never trusted from the client.
     */
    async saveDeliveries(tripId, body = {}, options = {}) {
        const { deliveries } = parseDeliverySave(body);
        return withTransaction(async (client) => {
            const existing = await client.query(`SELECT * FROM trips WHERE id = $1`, [tripId]);
            if (!existing.rowCount)
                throw new AppError(404, `Trip ${tripId} not found`);
            const tripRow = existing.rows[0];
            if (Boolean(tripRow.deleted)) {
                throw new AppError(422, "Cannot modify a deleted trip", { tripId });
            }
            if (!Boolean(tripRow.pickup_step_submitted)) {
                throw new AppError(422, `Complete ${TRIP_STEP_LABELS.pickup} before ${TRIP_STEP_LABELS.deliveries}`, {
                    resumeStep: "pickup",
                    requestedStep: "deliveries",
                });
            }
            if (Boolean(tripRow.rate_completed)) {
                throw new AppError(409, "Cannot modify deliveries — trip rates are locked by Rate Entry", { tripId });
            }
            // Serialize concurrent saves for this trip (read-modify-write below).
            await client.query(`SELECT id FROM trips WHERE id = $1 FOR UPDATE`, [tripId]);
            // Step 3 Pickup is the only Step 4 capacity source — never Step 2 farm load.
            const capacityBirds = num(tripRow.total_birds);
            const capacityWeight = num(tripRow.dc_weight);
            if (capacityBirds <= 0 && capacityWeight <= 0) {
                throw new AppError(422, "Step 3 (Pickup) must be completed before saving shop deliveries.");
            }
            // Live pickup boxes (Step 3 — read-only source of truth for allocation).
            const boxRes = await client.query(`SELECT box_no, birds, weight FROM trip_boxes WHERE trip_id = $1 ORDER BY box_no`, [tripId]);
            const boxesByNo = new Map();
            for (const r of boxRes.rows) {
                boxesByNo.set(num(r.box_no), { birds: num(r.birds), weight: num(r.weight) });
            }
            // Live deliveries for this trip.
            const delRes = await client.query(`SELECT id, client_key, shop_id, serial_no, birds, weight, mortality, mort_kg
           FROM trip_deliveries WHERE trip_id = $1`, [tripId]);
            const existingRows = delRes.rows.map((r) => ({
                id: num(r.id),
                clientKey: r.client_key == null ? null : str(r.client_key),
                shopId: numOrNull(r.shop_id),
                serialNo: numOrNull(r.serial_no),
                birds: num(r.birds),
                weight: num(r.weight),
                mortality: num(r.mortality),
                mortKg: num(r.mort_kg),
            }));
            const findBy = (d) => {
                const key = d.clientKey ? str(d.clientKey) : null;
                if (key) {
                    const byKey = existingRows.find((r) => r.clientKey === key);
                    if (byKey)
                        return byKey;
                }
                if (d.id != null) {
                    const byId = existingRows.find((r) => r.id === Number(d.id));
                    if (byId)
                        return byId;
                }
                return null;
            };
            // Dedupe the payload by stable identity — the resolved existing row id
            // first (two rows that both map to the same DB row must collapse), then
            // clientKey, then server id, then position. Keeps the last occurrence so
            // a retry that repeats a row must not double-count birds/weight.
            const deduped = [];
            const seenKeys = new Set();
            for (let i = deliveries.length - 1; i >= 0; i--) {
                const d = deliveries[i];
                const match = findBy(d);
                const key = match
                    ? `m:${match.id}`
                    : d.clientKey
                        ? `k:${str(d.clientKey)}`
                        : d.id != null
                            ? `i:${Number(d.id)}`
                            : `x:${i}`;
                if (seenKeys.has(key))
                    continue;
                seenKeys.add(key);
                deduped.unshift(d);
            }
            const excludedIds = new Set();
            for (const d of deduped) {
                const match = findBy(d);
                if (match)
                    excludedIds.add(match.id);
            }
            // Boxes already committed to deliveries NOT being overwritten.
            const excluded = [...excludedIds];
            const exclClause = excluded.length ? `AND d.id <> ALL($2::int[])` : "";
            const boxParams = [tripId];
            if (excluded.length)
                boxParams.push(excluded);
            const otherBoxes = await client.query(`SELECT d.id AS delivery_id, db.box_no
           FROM trip_delivery_boxes db
           JOIN trip_deliveries d ON d.id = db.delivery_id
          WHERE d.trip_id = $1 AND COALESCE(d.deleted, FALSE) = FALSE ${exclClause}`, boxParams);
            const otherPerBox = await client.query(`SELECT d.id AS delivery_id, pb.box_no, pb.birds, pb.weight
           FROM trip_delivery_per_box pb
           JOIN trip_deliveries d ON d.id = pb.delivery_id
          WHERE d.trip_id = $1 AND COALESCE(d.deleted, FALSE) = FALSE ${exclClause}`, boxParams);
            const otherSelected = new Map();
            for (const r of otherBoxes.rows) {
                const id = num(r.delivery_id);
                const list = otherSelected.get(id) ?? [];
                list.push(num(r.box_no));
                otherSelected.set(id, list);
            }
            const otherPer = new Map();
            for (const r of otherPerBox.rows) {
                const id = num(r.delivery_id);
                const list = otherPer.get(id) ?? [];
                list.push({ boxNo: num(r.box_no), birds: num(r.birds), weight: num(r.weight) });
                otherPer.set(id, list);
            }
            const usedRemaining = new Map();
            const addUsage = (boxNo, birds, weight) => {
                const cur = usedRemaining.get(boxNo) ?? { birds: 0, weight: 0 };
                usedRemaining.set(boxNo, { birds: cur.birds + birds, weight: cur.weight + weight });
            };
            for (const row of existingRows) {
                if (excludedIds.has(row.id))
                    continue;
                const per = otherPer.get(row.id) ?? [];
                const selected = otherSelected.get(row.id) ?? [];
                if (per.length) {
                    for (const pb of per)
                        addUsage(pb.boxNo, Number(pb.birds ?? 0), Number(pb.weight ?? 0));
                }
                else if (selected.length === 1) {
                    addUsage(selected[0], row.birds + row.mortality, row.weight + row.mortKg);
                }
                else {
                    const farmBirds = selected.reduce((s, n) => s + (boxesByNo.get(n)?.birds ?? 0), 0);
                    const farmWeight = selected.reduce((s, n) => s + (boxesByNo.get(n)?.weight ?? 0), 0);
                    for (const n of selected) {
                        const box = boxesByNo.get(n);
                        if (!box)
                            continue;
                        const bShare = farmBirds > 0 ? row.birds * (box.birds / farmBirds) : 0;
                        const wShare = farmWeight > 0 ? row.weight * (box.weight / farmWeight) : 0;
                        addUsage(n, bShare, wShare);
                    }
                }
            }
            // Cross-shop totals from live persisted rows, minus the rows we replace.
            const base = await sumActiveDeliveries(client, tripId);
            let totalBirds = base.birds + base.mortalityCount;
            let totalWeight = base.weight + base.mortalityWeight;
            for (const id of excludedIds) {
                const r = existingRows.find((x) => x.id === id);
                if (!r)
                    continue;
                totalBirds -= r.birds + r.mortality;
                totalWeight -= r.weight + r.mortKg;
            }
            const tripNo = tripRow.trip_no ? str(tripRow.trip_no) : `TR-${tripId}`;
            let maxSerial = 0;
            for (const r of existingRows) {
                if (r.serialNo != null && r.serialNo > maxSerial)
                    maxSerial = r.serialNo;
            }
            for (const d of deduped) {
                const match = findBy(d);
                const mode = d.deliveryMode === "weight" ? "weight" : "box";
                const birds = Number(d.birds ?? 0);
                const weight = Number(d.weight ?? 0);
                const mortality = Number(d.mortality ?? 0);
                const mortKg = Number(d.mortKg ?? 0);
                const shopId = d.shopId != null ? Number(d.shopId) : null;
                const selectedBoxIds = Array.isArray(d.selectedBoxIds)
                    ? [...new Set(d.selectedBoxIds.map(Number))]
                    : [];
                const perBoxData = Array.isArray(d.perBoxData) ? d.perBoxData : [];
                // Basic type/safety (Save Progress): non-negative whole birds,
                // non-negative weight. Never accept impossible negative values.
                if (!Number.isInteger(birds) || birds < 0) {
                    throw new AppError(422, `Shop delivery birds must be a non-negative whole number (got ${d.birds}).`);
                }
                if (!Number.isFinite(weight) || weight < 0) {
                    throw new AppError(422, `Shop delivery weight must be a non-negative number (got ${d.weight}).`);
                }
                if (!Number.isInteger(mortality) || mortality < 0) {
                    throw new AppError(422, `Mortality birds must be a non-negative whole number (got ${d.mortality}).`);
                }
                if (!Number.isFinite(mortKg) || mortKg < 0) {
                    throw new AppError(422, `Mortality weight must be a non-negative number (got ${d.mortKg}).`);
                }
                if (shopId == null) {
                    if (options.finalize) {
                        throw new AppError(422, "Shop is required for a delivery.");
                    }
                }
                else {
                    const shopRes = await client.query(`SELECT status FROM shops WHERE id = $1`, [shopId]);
                    if (!shopRes.rowCount) {
                        throw new AppError(422, `Shop ${shopId} does not exist.`);
                    }
                    const shopStatus = str(shopRes.rows[0].status);
                    const shopChanged = match ? match.shopId !== shopId : true;
                    if (shopChanged && shopStatus !== "Active") {
                        throw new AppError(422, "Shop is no longer available for new selection.");
                    }
                }
                if (options.finalize && mode === "box" && selectedBoxIds.length === 0) {
                    throw new AppError(422, "Box mode requires a valid Pickup Box from this trip.");
                }
                for (const boxNo of selectedBoxIds) {
                    if (!boxesByNo.has(boxNo)) {
                        throw new AppError(422, `Selected box #${boxNo} is not part of this trip's Step 3 pickup.`);
                    }
                }
                const farmBirds = selectedBoxIds.reduce((s, n) => s + (boxesByNo.get(n)?.birds ?? 0), 0);
                const farmWeight = selectedBoxIds.reduce((s, n) => s + (boxesByNo.get(n)?.weight ?? 0), 0);
                const remainingOf = (boxNo) => {
                    const pickup = boxesByNo.get(boxNo) ?? { birds: 0, weight: 0 };
                    const used = usedRemaining.get(boxNo) ?? { birds: 0, weight: 0 };
                    return remainingPickupBox(pickup, used);
                };
                // Shop-level bounds against remaining selected-box capacity (partial consumption).
                const remainBirds = selectedBoxIds.reduce((s, n) => s + remainingOf(n).birds, 0);
                const remainWeight = selectedBoxIds.reduce((s, n) => s + remainingOf(n).weight, 0);
                if (selectedBoxIds.length && birds + mortality > remainBirds) {
                    throw new AppError(422, `Delivered birds plus mortality cannot exceed available birds (${remainBirds}).`);
                }
                if (selectedBoxIds.length && weight + mortKg > remainWeight + 0.0001) {
                    throw new AppError(422, `Delivery weight cannot exceed the selected box available weight (${remainWeight.toFixed(2)} kg).`);
                }
                if (mode === "weight") {
                    for (const pb of perBoxData) {
                        const box = boxesByNo.get(Number(pb.boxNo));
                        if (!box) {
                            throw new AppError(422, `Per-box entry #${pb.boxNo} is not part of this trip's Step 3 pickup.`);
                        }
                        const remain = remainingOf(Number(pb.boxNo));
                        if (Number(pb.birds) > remain.birds) {
                            throw new AppError(422, `Box #${pb.boxNo} delivered birds exceed its available birds (${remain.birds}).`);
                        }
                        if (Number(pb.weight) > remain.weight) {
                            throw new AppError(422, `Box #${pb.boxNo} delivered weight exceeds its available weight (${remain.weight.toFixed(2)} kg).`);
                        }
                    }
                }
                if (perBoxData.length) {
                    for (const pb of perBoxData)
                        addUsage(Number(pb.boxNo), Number(pb.birds ?? 0), Number(pb.weight ?? 0));
                }
                else if (selectedBoxIds.length === 1) {
                    addUsage(selectedBoxIds[0], birds + mortality, weight + mortKg);
                }
                else {
                    for (const n of selectedBoxIds) {
                        const box = boxesByNo.get(n);
                        if (!box)
                            continue;
                        const bShare = farmBirds > 0 ? birds * (box.birds / farmBirds) : 0;
                        const wShare = farmWeight > 0 ? weight * (box.weight / farmWeight) : 0;
                        addUsage(n, bShare, wShare);
                    }
                }
                // Cross-shop totals (live persisted rows + this payload).
                totalBirds += birds + mortality;
                totalWeight += weight + mortKg;
                assertWithinCapacity({ label: "birds", available: capacityBirds, alreadyAllocated: 0, requested: totalBirds });
                assertWithinCapacity({ label: "weight", available: capacityWeight, alreadyAllocated: 0, requested: totalWeight });
                const amount = d.amount != null && Number(d.amount) > 0
                    ? Number(d.amount)
                    : Number((weight * Number(d.rate ?? 0)).toFixed(2));
                let deliveryId;
                if (match) {
                    deliveryId = match.id;
                    await client.query(`UPDATE trip_deliveries SET
               serial_no = $2,
               box_no = $3,
               shop_id = $4,
               shop_name = $5,
               bird_type_id = $6,
               bird_type = $7,
               birds = $8,
               weight = $9,
               mortality = $10,
               mort_kg = $11,
               rate = $12,
               amount = $13,
               remarks = $14,
               delivery_mode = $15,
               farm_birds = $16,
               farm_weight = $17,
               client_key = $18
             WHERE id = $1`, [
                        deliveryId,
                        d.serialNo ?? match.serialNo,
                        selectedBoxIds.length,
                        shopId,
                        d.shopName ?? "",
                        d.birdTypeId != null ? Number(d.birdTypeId) : null,
                        d.birdType ?? "",
                        birds,
                        weight,
                        mortality,
                        mortKg,
                        d.rate != null ? Number(d.rate) : null,
                        amount,
                        d.remarks ?? "",
                        mode,
                        farmBirds,
                        farmWeight,
                        d.clientKey ? str(d.clientKey) : null,
                    ]);
                }
                else {
                    const saleNo = await generateSaleNo(client, tripId, tripNo);
                    maxSerial += 1;
                    const inserted = await client.query(`INSERT INTO trip_deliveries (
               trip_id, sale_no, serial_no, box_no, shop_id, shop_name, bird_type_id, bird_type,
               birds, weight, mortality, mort_kg, rate, amount, remarks, delivery_mode,
               farm_birds, farm_weight, auto_capture_time, client_key
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,COALESCE($19::timestamptz, NOW()),$20)
             RETURNING id`, [
                        tripId,
                        saleNo,
                        d.serialNo ?? maxSerial,
                        selectedBoxIds.length,
                        shopId,
                        d.shopName ?? "",
                        d.birdTypeId != null ? Number(d.birdTypeId) : null,
                        d.birdType ?? "",
                        birds,
                        weight,
                        mortality,
                        mortKg,
                        d.rate != null ? Number(d.rate) : null,
                        amount,
                        d.remarks ?? "",
                        mode,
                        farmBirds,
                        farmWeight,
                        null,
                        d.clientKey ? str(d.clientKey) : null,
                    ]);
                    deliveryId = num(inserted.rows[0].id);
                }
                // Replace the delivery's child rows (selected boxes + per-box breakdown).
                await client.query(`DELETE FROM trip_delivery_boxes WHERE delivery_id = $1`, [deliveryId]);
                for (const boxNo of selectedBoxIds) {
                    await client.query(`INSERT INTO trip_delivery_boxes (delivery_id, box_no) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [deliveryId, boxNo]);
                }
                await client.query(`DELETE FROM trip_delivery_per_box WHERE delivery_id = $1`, [deliveryId]);
                for (const pb of perBoxData) {
                    await client.query(`INSERT INTO trip_delivery_per_box (delivery_id, box_no, birds, weight) VALUES ($1,$2,$3,$4)`, [deliveryId, Number(pb.boxNo), Number(pb.birds ?? 0), Number(pb.weight ?? 0)]);
                }
            }
            if (options.finalize) {
                const live = await client.query(`SELECT d.shop_id, d.birds, d.weight, d.mortality, d.mort_kg, d.delivery_mode,
                  (SELECT COUNT(*) FROM trip_delivery_boxes b WHERE b.delivery_id = d.id) AS box_count
             FROM trip_deliveries d
            WHERE d.trip_id = $1 AND COALESCE(d.deleted, FALSE) = FALSE`, [tripId]);
                if (!live.rowCount) {
                    throw new AppError(422, "At least one valid shop delivery is required to submit Step 4.");
                }
                let complete = 0;
                for (const r of live.rows) {
                    if (numOrNull(r.shop_id) == null) {
                        throw new AppError(422, "Shop is required for a delivery.");
                    }
                    if (str(r.delivery_mode) === "box" && num(r.box_count) < 1) {
                        throw new AppError(422, "Box mode requires a valid Pickup Box from this trip.");
                    }
                    if (num(r.birds) > 0 && num(r.weight) > 0)
                        complete += 1;
                }
                if (complete < 1) {
                    throw new AppError(422, "At least one valid shop delivery is required to submit Step 4.");
                }
                try {
                    await client.query(`UPDATE trips SET
               delivery_step_submitted = TRUE,
               deliveries_step_submitted_at = CASE
                 WHEN deliveries_step_submitted_at IS NULL THEN NOW()
                 ELSE deliveries_step_submitted_at END
             WHERE id = $1`, [tripId]);
                    await client.query(`UPDATE trip_deliveries
                SET auto_capture_time = NOW()
              WHERE trip_id = $1 AND auto_capture_time IS NULL`, [tripId]);
                }
                catch (err) {
                    const code = err.code;
                    if (code !== "42703")
                        throw err;
                    await client.query(`UPDATE trips SET delivery_step_submitted = TRUE WHERE id = $1`, [tripId]);
                }
            }
            // Recompute delivery-side KPIs from the live rows (source of truth).
            await recalcTripDeliveryTotals(client, tripId);
            const finalRow = await client.query(`SELECT * FROM trips WHERE id = $1`, [tripId]);
            const trip = await hydrateTrip(client, finalRow.rows[0], { includeDcPhoto: true });
            const flags = {
                startStepSubmitted: trip.startStepSubmitted,
                farmStepSubmitted: trip.farmStepSubmitted,
                pickupStepSubmitted: trip.pickupStepSubmitted,
                deliveryStepSubmitted: trip.deliveryStepSubmitted,
                expensesStepSubmitted: trip.expensesStepSubmitted,
                endStepSubmitted: trip.endStepSubmitted,
                status: trip.status,
                deleted: trip.deleted,
            };
            return {
                ...trip,
                ...flattenDiesel(trip.dieselEntries ?? []),
                resumeStep: getResumeStep(flags),
                resumeStepLabel: getResumeLabel(flags),
                wizardProgress: getWizardProgress(flags),
                stepStatuses: computeStepStatuses(trip, {
                    boxCount: trip.boxDetails.length,
                    deliveryCount: trip.deliveries.length,
                    dieselCount: (trip.dieselEntries ?? []).length,
                }),
            };
        });
    },
    /**
     * Orders module — create or locate the day's Shop Order Collection
     * container and upsert its collected-shop plan rows.
     *
     * The container is a vehicle-LESS `trips` row identified by an
     * ORD-YYYYMMDD-NN trip number that Orders supplies (the backend never
     * generates one here, and never assigns a `TR-` number). It only ever
     * holds Orders plan rows in `trip_deliveries` (remarks start with
     * `[ORDER]`). It is NOT a vehicle trip: no vehicle / crew / meter, and
     * none of the Step 1→3 pickup / capacity gates run. It is idempotent by
     * `trip_no`, so a repeated save or a network retry updates the same
     * container instead of creating a second one, and `id = 0` on the wire is
     * never turned into a real numbered DB trip.
     *
     *  - the collection stage is always a permissive "save" (partial
     *    collections allowed, no final validation);
     *  - `startStepSubmitted === true` is Finish Collection — it latches the
     *    container's `start_step_submitted` flag (monotonic, never cleared).
     */
    async saveCollectionContainer(body) {
        const tripNo = str(body.tripNo).trim();
        if (!/^ORD-\d{8}-\d+$/.test(tripNo)) {
            throw new AppError(422, "A valid collection number (ORD-YYYYMMDD-NN) is required.");
        }
        const finished = body.startStepSubmitted === true;
        const planRows = Array.isArray(body.deliveries)
            ? body.deliveries
            : [];
        const tripDate = dateOnly(body.tripDate) ??
            `${tripNo.slice(4, 8)}-${tripNo.slice(8, 10)}-${tripNo.slice(10, 12)}`;
        return withTransaction(async (client) => {
            // One container per ORD trip number (idempotent create-or-locate).
            await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`ord_container_${tripNo}`]);
            let row = (await client.query(`SELECT * FROM trips WHERE trip_no = $1 LIMIT 1`, [tripNo])).rows[0];
            if (row && num(row.vehicle_id) > 0) {
                throw new AppError(409, `${tripNo} is a vehicle trip, not a collection container.`);
            }
            if (!row) {
                row = (await client.query(`INSERT INTO trips (trip_no, trip_date, status, start_step_submitted)
             VALUES ($1, $2::date, 'Draft', $3)
             RETURNING *`, [tripNo, tripDate, finished])).rows[0];
            }
            else if (finished && !row.start_step_submitted) {
                row = (await client.query(`UPDATE trips SET start_step_submitted = TRUE, updated_at = NOW()
             WHERE id = $1 RETURNING *`, [num(row.id)])).rows[0];
            }
            else {
                await client.query(`UPDATE trips SET updated_at = NOW() WHERE id = $1`, [num(row.id)]);
            }
            const containerId = num(row.id);
            // A collection save is a full snapshot of the day's collected shops —
            // replace the plan rows (the same delete + reinsert the Step 4 path
            // uses). No capacity / pickup checks: there is no vehicle yet.
            await client.query(`DELETE FROM trip_deliveries WHERE trip_id = $1`, [containerId]);
            let serial = 0;
            for (const d of planRows) {
                const shopId = numOrNull(d.shopId ?? d.shop_id);
                if (!shopId)
                    continue;
                serial += 1;
                const saleNo = await generateSaleNo(client, containerId, tripNo);
                const rawRemarks = str(d.remarks ?? "").trim();
                const remarks = rawRemarks.startsWith("[ORDER]") ? rawRemarks : "[ORDER]";
                await client.query(`INSERT INTO trip_deliveries
             (trip_id, sale_no, serial_no, box_no, shop_id, shop_name,
              bird_type_id, bird_type, birds, weight, mortality, mort_kg,
              rate, amount, remarks, delivery_mode, client_key)
           VALUES ($1,$2,$3,$4,$5,$6,NULL,'',$7,$8,0,0,NULL,0,$9,'box',$10)`, [
                    containerId,
                    saleNo,
                    num(d.serialNo ?? d.serial_no ?? serial),
                    num(d.boxNo ?? d.box_no ?? 0),
                    shopId,
                    str(d.shopName ?? d.shop_name ?? ""),
                    num(d.birds ?? 0),
                    num(d.weight ?? 0),
                    remarks,
                    d.clientKey == null ? null : str(d.clientKey),
                ]);
            }
            return hydrateTrip(client, row, { includeDcPhoto: false });
        });
    },
    async submitStep(id, step, body) {
        const isSaveMode = body.mode === "save";
        // ── Orders module: the day's Shop Order Collection container ────────────
        // A vehicle-LESS `trips` row identified by an ORD-YYYYMMDD-NN number that
        // only holds Orders plan rows. `POST /trips/0/steps/deliveries` (ORD
        // number in `tripNo`) creates / locates it; a later save may address the
        // same container by its real id. Either way it must NOT run the
        // vehicle-trip Step 1→3 gates or the Step 3 capacity checks.
        if (step === "deliveries") {
            const ordNo = str(body.tripNo).trim();
            let containerRow;
            if (Number.isFinite(id) && id > 0) {
                containerRow = (await query(`SELECT trip_no, vehicle_id FROM trips WHERE id = $1`, [id])).rows[0];
            }
            const isContainer = (/^ORD-\d{8}-\d+$/.test(ordNo) && (!Number.isFinite(id) || id <= 0)) ||
                (containerRow != null &&
                    containerRow.vehicle_id == null &&
                    /^ORD-\d{8}-\d+$/.test(str(containerRow.trip_no)));
            if (isContainer) {
                return this.saveCollectionContainer({
                    ...body,
                    tripNo: ordNo || str(containerRow?.trip_no),
                });
            }
        }
        if (step === "farm" || step === "pickup" || step === "deliveries" || step === "expenses") {
            const gate = await query(`SELECT start_step_submitted, farm_step_submitted, pickup_step_submitted, delivery_step_submitted FROM trips WHERE id = $1`, [id]);
            if (!gate.rowCount)
                throw new AppError(404, `Trip ${id} not found`);
            if (step === "farm" && !Boolean(gate.rows[0].start_step_submitted)) {
                throw new AppError(422, `Complete ${TRIP_STEP_LABELS.start} before ${TRIP_STEP_LABELS.farm}`, {
                    resumeStep: "start",
                    requestedStep: "farm",
                });
            }
            if (step === "pickup" && !Boolean(gate.rows[0].farm_step_submitted)) {
                throw new AppError(422, `Complete ${TRIP_STEP_LABELS.farm} before ${TRIP_STEP_LABELS.pickup}`, {
                    resumeStep: "farm",
                    requestedStep: "pickup",
                });
            }
            if (step === "deliveries" && !Boolean(gate.rows[0].pickup_step_submitted)) {
                throw new AppError(422, `Complete ${TRIP_STEP_LABELS.pickup} before ${TRIP_STEP_LABELS.deliveries}`, {
                    resumeStep: "pickup",
                    requestedStep: "deliveries",
                });
            }
            if (step === "expenses" && !Boolean(gate.rows[0].delivery_step_submitted) && !isSaveMode) {
                throw new AppError(422, `Complete ${TRIP_STEP_LABELS.deliveries} before ${TRIP_STEP_LABELS.expenses}`, {
                    resumeStep: "deliveries",
                    requestedStep: "expenses",
                });
            }
        }
        if (!isSaveMode && step !== "deliveries") {
            validateStepSubmit(step, body);
        }
        if (!isSaveMode && step === "deliveries") {
            if (Array.isArray(body.deliveries) && body.deliveries.length) {
                validateStepSubmit(step, body);
            }
        }
        const existing = await query(`SELECT * FROM trips WHERE id = $1`, [id]);
        if (!existing.rowCount)
            throw new AppError(404, `Trip ${id} not found`);
        const current = existing.rows[0];
        const flags = {
            startStepSubmitted: Boolean(current.start_step_submitted),
            farmStepSubmitted: Boolean(current.farm_step_submitted),
            pickupStepSubmitted: Boolean(current.pickup_step_submitted),
            deliveryStepSubmitted: Boolean(current.delivery_step_submitted),
            expensesStepSubmitted: Boolean(current.expenses_step_submitted),
            endStepSubmitted: Boolean(current.end_step_submitted),
            status: str(current.status),
            deleted: Boolean(current.deleted),
        };
        // Step 2 (farm) only: negative pickup tolls → 0. Empty/null is left alone so
        // COALESCE in save() preserves previously stored Step 2 tolls. Never applied
        // to pickup/deliveries/expenses.
        if (step === "farm") {
            const farmTolls = numOrNull(body.pickupTolls);
            if (farmTolls != null && farmTolls < 0) {
                body.pickupTolls = 0;
            }
            delete body.farmCompletedTrips;
            delete body.farmRate;
            delete body.reachedTime;
            const lat = numOrNull(body.farmGpsLat);
            const lon = numOrNull(body.farmGpsLon);
            const acc = numOrNull(body.farmGpsAccuracy);
            const gpsInvalid = (lat != null && (lat < -90 || lat > 90)) ||
                (lon != null && (lon < -180 || lon > 180)) ||
                (acc != null && acc < 0) ||
                (lat === 0 && lon === 0);
            if (gpsInvalid) {
                delete body.farmGpsLat;
                delete body.farmGpsLon;
                delete body.farmGpsAccuracy;
                delete body.farmGpsTime;
            }
        }
        if (step === "pickup") {
            delete body.pickupLoadTime;
            delete body.dcWeight;
            delete body.totalBirds;
            delete body.boxes;
            delete body.avgWeight;
            const boxDetails = body.boxDetails ?? [];
            const vehCap = current.vehicle_id
                ? await query(`SELECT no_of_boxes FROM vehicles WHERE id = $1`, [current.vehicle_id])
                : { rowCount: 0, rows: [] };
            const vehicleCapacity = vehCap.rowCount ? num(vehCap.rows[0].no_of_boxes) : 0;
            if (isSaveMode) {
                if (boxDetails.length) {
                    assertPickupBoxNumbers(boxDetails, vehicleCapacity, "save");
                }
                body.pickupBoxWrite = "upsert";
            }
            else {
                assertPickupBoxNumbers(boxDetails, vehicleCapacity, "submit");
                body.pickupBoxWrite = "replace";
                body.syncPickupPhotos = true;
                body.pickupPhotoRequired = true;
            }
        }
        if (step === "deliveries") {
            delete body.autoCaptureTime;
            if (isSaveMode) {
                return this.saveDeliveries(id, body);
            }
        }
        if (step === "expenses") {
            stripProtectedStep5Fields(body);
            validateExpensePayload(body);
            if (!isSaveMode) {
                body.skipDiesel = true;
            }
        }
        // "Save Progress" is a permissive autosave: it must never run strict step
        // validation, enforce step order, or lock/submit a step.
        if (isSaveMode) {
            const autosaveBody = { ...body };
            delete autosaveBody.mode;
            delete autosaveBody.startStepSubmitted;
            delete autosaveBody.farmStepSubmitted;
            delete autosaveBody.pickupStepSubmitted;
            delete autosaveBody.deliveryStepSubmitted;
            delete autosaveBody.expensesStepSubmitted;
            delete autosaveBody.endStepSubmitted;
            return this.save(id, autosaveBody);
        }
        assertStepOrder(step, flags);
        if (step === "deliveries") {
            return this.saveDeliveries(id, body, { finalize: true });
        }
        if (step === "expenses") {
            stripProtectedStep5Fields(body);
            validateExpensePayload(body);
            body.skipDiesel = true;
            delete body.endTime;
            delete body.submittedAt;
        }
        // Backend-authoritative Step 2 (Farm) validation — never trust the frontend.
        // Farm Meter must be present and STRICTLY greater than the Step 1 start meter
        // (equality is rejected). Runs only on submit, never on Save Progress.
        if (step === "farm") {
            const tolls = numOrNull(body.pickupTolls);
            if (tolls == null || tolls < 0) {
                body.pickupTolls = 0;
            }
            const farmId = numOrNull(body.sourceFarmId);
            if (farmId == null || farmId <= 0) {
                throw new AppError(422, "Farm is required.");
            }
            const farmAddress = body.farmAddress == null ? "" : str(body.farmAddress).trim();
            if (!farmAddress) {
                throw new AppError(422, "Farm address is required.");
            }
            const avgBird = numOrNull(body.avgBirdWeight);
            if (avgBird == null || avgBird <= 0) {
                throw new AppError(422, "Average Bird Weight is required.");
            }
            const startMeter = numOrNull(current.opening_meter);
            const farmMeter = numOrNull(body.destMeter);
            if (farmMeter == null || farmMeter <= 0) {
                throw new AppError(422, "Farm meter is required for Step 2 submission.");
            }
            if (startMeter != null && farmMeter <= startMeter) {
                throw new AppError(422, `Farm meter (${farmMeter} KM) must be strictly greater than the Step 1 starting meter (${startMeter} KM).`);
            }
            delete body.reachedTime;
            delete body.farmCompletedTrips;
            delete body.farmRate;
        }
        const stepFlags = {
            start: { startStepSubmitted: true },
            farm: { farmStepSubmitted: true },
            pickup: { pickupStepSubmitted: true },
            deliveries: { deliveryStepSubmitted: true },
            expenses: {
                expensesStepSubmitted: true,
                endStepSubmitted: true,
                status: "Pending",
                skipDiesel: true,
                step5Finalize: true,
            },
        };
        const merged = { ...body, ...stepFlags[step] };
        if (step === "start") {
            delete merged.startTime;
            merged.startStepSubmitted = true;
        }
        return this.save(id, merged);
    },
    async softDelete(id, reason) {
        return withTransaction(async (client) => {
            const result = await client.query(`UPDATE trips SET deleted = TRUE, deleted_reason = $2, status = 'Deleted'
         WHERE id = $1 AND COALESCE(deleted, FALSE) = FALSE
         RETURNING id`, [id, reason ?? null]);
            if (!result.rowCount)
                throw new AppError(404, `Trip ${id} not found`);
            return { id, deleted: true };
        });
    },
    async updateStatus(id, body) {
        assertTripStatus(body.status);
        const status = body.status;
        return withTransaction(async (client) => {
            const existing = await client.query(`SELECT * FROM trips WHERE id = $1`, [id]);
            if (!existing.rowCount)
                throw new AppError(404, `Trip ${id} not found`);
            const currentStatus = str(existing.rows[0].status);
            const currentDeleted = Boolean(existing.rows[0].deleted);
            assertTripStatusTransition(currentStatus, status);
            // A deleted trip is deleted forever. Guard against the legacy generic
            // branch (which resets `deleted = FALSE`) ever resurrecting a row that
            // is already flagged as deleted but whose `status` was left inconsistent.
            if (currentDeleted && status !== "Deleted") {
                throw new AppError(422, "Cannot restore a deleted trip", { tripId: id });
            }
            if (status === "Pending") {
                const step5Submitted = Boolean(existing.rows[0].expenses_step_submitted || existing.rows[0].end_step_submitted);
                if (!step5Submitted) {
                    throw new AppError(422, "Complete Step 5 before moving the trip to Pending", {
                        tripId: id,
                    });
                }
            }
            if (status === "Completed") {
                assertTripReadyForCompletion({
                    startStepSubmitted: Boolean(existing.rows[0].start_step_submitted),
                    farmStepSubmitted: Boolean(existing.rows[0].farm_step_submitted),
                    pickupStepSubmitted: Boolean(existing.rows[0].pickup_step_submitted),
                    deliveryStepSubmitted: Boolean(existing.rows[0].delivery_step_submitted),
                    expensesStepSubmitted: Boolean(existing.rows[0].expenses_step_submitted),
                });
            }
            let result;
            try {
                if (status === "Completed") {
                    result = await client.query(`UPDATE trips SET status = $2, approved_by = $3, approved_at = NOW(), deleted = FALSE
             WHERE id = $1 RETURNING *`, [id, status, body.approvedBy ?? "system"]);
                }
                else if (status === "Deleted") {
                    result = await client.query(`UPDATE trips SET status = 'Deleted', deleted = TRUE, deleted_reason = $2
             WHERE id = $1 RETURNING *`, [id, body.reason ?? body.rejectedReason ?? null]);
                }
                else {
                    result = await client.query(`UPDATE trips SET status = $2::trip_status, deleted = FALSE WHERE id = $1 RETURNING *`, [id, status]);
                }
            }
            catch (err) {
                rethrowIfAppError(err);
                if (err.code === "42703" && status === "Completed") {
                    result = await client.query(`UPDATE trips SET status = $2, approved_by = $3, deleted = FALSE WHERE id = $1 RETURNING *`, [id, status, body.approvedBy ?? "system"]);
                }
                else {
                    throw err;
                }
            }
            // Diesel bills synced to fuel_expenses get Approved only when the whole
            // trip completion succeeds â€” same transaction, so failure rolls both back.
            if (status === "Completed") {
                await client.query(`UPDATE fuel_expenses
             SET status = 'Approved', approved_by = $2, approved_date = NOW(),
                 ops_status = 'Approved', updated_at = NOW()
           WHERE trip_id = $1 AND source_type = 'TRIP' AND status = 'Pending'
             AND COALESCE(deleted, FALSE) = FALSE`, [id, body.approvedBy ?? "system"]);
            }
            const trip = await hydrateTrip(client, result.rows[0], { includeDcPhoto: true });
            return { ...trip, ...flattenDiesel(trip.dieselEntries ?? []) };
        });
    },
    /** Backs GET /trips/vehicle/:vehicleId/last-meter â€” the Trip Step 1 opening
     * meter hint. Upgraded to the universal cross-module latest (trips + fuel +
     * maintenance), not just trip closing meters, while keeping the same
     * response shape the frontend already consumes. */
    async lastClosingMeter(vehicleId, excludeTripId) {
        await validateTripForeignKeys({ vehicleId });
        // Part L: on edit, exclude the trip being edited so its own start/end meter
        // is never reported back as its "previous" reading.
        const latest = await getLatestVehicleMeter(null, vehicleId, excludeTripId ?? null);
        if (!latest)
            return null;
        return {
            closingMeter: latest.meter,
            source: latest.sourceType,
            ref: latest.ref,
            tripNo: latest.sourceType === "TRIP_END" || latest.sourceType === "TRIP_START" ? latest.ref : null,
            tripDate: latest.eventDate,
        };
    },
    /**
     * Available masters for Step 1 — the dropdown source of truth.
     * Returns only resources NOT currently occupied by an active trip (status
     * 'Draft' + start_step_submitted = TRUE, matching the resource lock rule).
     * Pass tripId when editing so the trip's own resources stay selectable.
     */
    async availableResources(tripId) {
        const excludeId = tripId && tripId > 0 ? tripId : 0;
        const occupied = `
      WHERE status = 'Draft'
        AND start_step_submitted = TRUE
        AND deleted = FALSE
        AND id <> $1`;
        const vehicles = await query(`SELECT id, vehicle_number
         FROM vehicles
        WHERE id NOT IN (
          SELECT vehicle_id FROM trips
          ${occupied} AND vehicle_id IS NOT NULL
        )
        ORDER BY vehicle_number`, [excludeId]);
        const drivers = await query(`SELECT id, employee_name, department
         FROM employees
        WHERE department = 'Driver'
          AND id NOT IN (
            SELECT driver_id FROM trips
            ${occupied} AND driver_id IS NOT NULL
          )
        ORDER BY employee_name`, [excludeId]);
        const supervisors = await query(`SELECT id, employee_name, department
         FROM employees
        WHERE department = 'Supervisor'
          AND id NOT IN (
            SELECT supervisor_id FROM trips
            ${occupied} AND supervisor_id IS NOT NULL
          )
        ORDER BY employee_name`, [excludeId]);
        // Helpers/loaders are persisted by NAME in trip_crew; exclude by name so the
        // available list stays aligned with the name-based resource lock.
        const helpers = await query(`SELECT e.id, e.employee_name, e.department
         FROM employees e
        WHERE e.department IN ('Helper', 'Labor')
          AND e.employee_name NOT IN (
            SELECT tc.employee_name FROM trip_crew tc
            JOIN trips t ON t.id = tc.trip_id
            WHERE t.status = 'Draft'
              AND t.start_step_submitted = TRUE
              AND t.deleted = FALSE
              AND t.id <> $1
              AND tc.role = 'helper'
          )
        ORDER BY e.employee_name`, [excludeId]);
        const loaders = await query(`SELECT e.id, e.employee_name, e.department
         FROM employees e
        WHERE e.department = 'Loader'
          AND e.employee_name NOT IN (
            SELECT tc.employee_name FROM trip_crew tc
            JOIN trips t ON t.id = tc.trip_id
            WHERE t.status = 'Draft'
              AND t.start_step_submitted = TRUE
              AND t.deleted = FALSE
              AND t.id <> $1
              AND tc.role = 'loader'
          )
        ORDER BY e.employee_name`, [excludeId]);
        return {
            vehicles: vehicles.rows.map((r) => ({
                id: num(r.id),
                vehicleNumber: str(r.vehicle_number),
            })),
            drivers: drivers.rows.map((r) => ({
                id: num(r.id),
                employeeName: str(r.employee_name),
                department: str(r.department),
            })),
            supervisors: supervisors.rows.map((r) => ({
                id: num(r.id),
                employeeName: str(r.employee_name),
                department: str(r.department),
            })),
            helpers: helpers.rows.map((r) => ({
                id: num(r.id),
                employeeName: str(r.employee_name),
                department: str(r.department),
            })),
            loaders: loaders.rows.map((r) => ({
                id: num(r.id),
                employeeName: str(r.employee_name),
                department: str(r.department),
            })),
        };
    },
};
//# sourceMappingURL=tripsService.js.map