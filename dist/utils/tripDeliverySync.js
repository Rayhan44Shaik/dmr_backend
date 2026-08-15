import { AppError } from "../middleware/errorHandler.js";
const EDIT_WINDOW_DAYS = 10;
/** Trip statuses finalized enough to receive/carry a Rate Entry and, once
 * locked, to be Shop-Sales-eligible. Single shared source — Rate Entry
 * eligibility (rateEntryService.ts) and Shop Sales eligibility (below) must
 * never drift apart, since a trip that can be rate-locked but can't reach
 * Shop Sales afterwards would be a dead end. */
export const RATE_ENTRY_ELIGIBLE_STATUSES = ["Approved", "Completed"];
/** Anchor date for the 10-day edit window: when the trip was completed
 * (approved_at), falling back to the trip date for older/legacy rows that
 * predate approved_at being populated. */
function editWindowAnchor(trip) {
    const anchor = trip.approvedAt ?? trip.tripDate;
    return new Date(anchor);
}
export function editWindowExpiresAt(trip) {
    const anchor = editWindowAnchor(trip);
    const expires = new Date(anchor);
    expires.setDate(expires.getDate() + EDIT_WINDOW_DAYS);
    return expires;
}
/** A trip (and therefore its Shop Sales) is editable only while it has not
 * yet reached the finalized "Completed" state (still mid-workflow, handled
 * elsewhere), or — once Completed — only within EDIT_WINDOW_DAYS of
 * completion. Deleted trips are never editable. */
export function isTripEditable(trip) {
    if (trip.deleted)
        return false;
    if (trip.status !== "Completed")
        return true;
    return new Date() <= editWindowExpiresAt(trip);
}
export function assertTripEditable(trip) {
    if (trip.deleted) {
        throw new AppError(409, `Trip ${trip.tripNo ?? ""} is deleted and cannot be edited`.trim());
    }
    if (trip.status === "Completed" && !isTripEditable(trip)) {
        const expired = editWindowExpiresAt(trip);
        throw new AppError(409, `Trip ${trip.tripNo ?? ""} is locked — the 10-day edit window closed on ${expired
            .toISOString()
            .slice(0, 10)}. No edits, deletes, or field changes are allowed.`.replace(/\s+/g, " ").trim());
    }
}
/** Shop Sales is the post-completion editable layer over trip_deliveries —
 * Draft/Pending trips must only be mutated through Trip Entry Step 4
 * (replaceDeliveries), never through this API. Deleted trips are already
 * rejected by assertTripEditable; this additionally rejects any trip that
 * hasn't reached a finalized status yet. Uses the same
 * RATE_ENTRY_ELIGIBLE_STATUSES as Rate Entry — a trip whose rate can be
 * locked must always be able to reach Shop Sales afterwards. */
export function assertTripCompletedForShopSales(trip) {
    if (!RATE_ENTRY_ELIGIBLE_STATUSES.includes(trip.status)) {
        throw new AppError(409, `Trip ${trip.tripNo ?? ""} is not Approved/Completed (status: ${trip.status}). ` +
            `Shop Sales can only be created, edited, or deleted once the trip is Approved or Completed.`.replace(/\s+/g, " "));
    }
}
/** Same advisory-lock + MAX(seq)+1 pattern as tripsService.generateTripNo,
 * scoped per trip instead of per trip-date. Format: "<tripNo>-S01". */
export async function generateSaleNo(client, tripId, tripNo) {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`sale_no_${tripId}`]);
    const escapedTripNo = tripNo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const result = await client.query(`SELECT COALESCE(MAX((substring(sale_no from '\\d+$'))::int), 0)::text AS m
       FROM trip_deliveries
      WHERE trip_id = $1 AND sale_no ~ ('^' || $2 || '-S\\d+$')`, [tripId, escapedTripNo]);
    const seq = String(Number(result.rows[0].m) + 1).padStart(2, "0");
    return `${tripNo}-S${seq}`;
}
/** Recomputes every delivered-side KPI column on trips — total_shops,
 * total_delivered_weight, total_birds_delivered, total_mortality(_count/_weight),
 * weight_loss, survival_rate, last_shop — from the live, non-deleted
 * trip_deliveries rows. These are exactly the columns computeTripKpis()
 * (tripCalculations.ts) derives from deliveries at Trip Entry time; calling
 * this after every Shop Sale create/update/delete keeps them in sync with
 * Trip List/Trip View without touching any Trip List/Trip Entry UI or
 * duplicating these totals anywhere else. */
export async function recalcTripDeliveryTotals(client, tripId) {
    await client.query(`UPDATE trips t SET
       total_shops = sub.cnt,
       total_delivered_weight = sub.wt,
       total_birds_delivered = sub.birds,
       total_mortality_count = sub.mort_cnt,
       total_mortality_weight = sub.mort_wt,
       total_mortality = sub.mort_wt,
       -- Same farmLoadWeight ?? dcWeight / farmBirdCount ?? totalBirds
       -- fallback computeTripKpis() (tripCalculations.ts) already uses —
       -- Step 2 farm-load fields take precedence when genuinely populated,
       -- otherwise fall back to the mandatory Step 3 Pickup values.
       weight_loss = (CASE WHEN t.farm_load_weight > 0 THEN t.farm_load_weight ELSE t.dc_weight END)
                     - sub.wt - sub.mort_wt,
       survival_rate = CASE WHEN COALESCE(NULLIF(t.farm_bird_count, 0), t.total_birds) > 0
                         THEN ROUND(sub.birds::numeric / COALESCE(NULLIF(t.farm_bird_count, 0), t.total_birds), 4)
                         ELSE 0 END,
       last_shop = sub.last_shop,
       updated_at = NOW()
     FROM (
       SELECT COUNT(*)::int AS cnt,
              COALESCE(SUM(weight), 0) AS wt,
              COALESCE(SUM(birds), 0)::int AS birds,
              COALESCE(SUM(mortality), 0)::int AS mort_cnt,
              COALESCE(SUM(mort_kg), 0) AS mort_wt,
              (SELECT d2.shop_name FROM trip_deliveries d2
                WHERE d2.trip_id = $1 AND d2.deleted = FALSE
                ORDER BY d2.id DESC LIMIT 1) AS last_shop
       FROM trip_deliveries
       WHERE trip_id = $1 AND deleted = FALSE
     ) sub
     WHERE t.id = $1`, [tripId]);
}
/** Sums birds/weight AND mortality (mortality/mort_kg) of active
 * (non-deleted) trip_deliveries for a trip, optionally excluding one row
 * (the sale being edited). Farm capacity is consumed by delivered birds/
 * weight AND mortality together — a bird/kg either reaches a shop or is
 * recorded as mortality, but either way it came out of the farm load. */
export async function sumActiveDeliveries(client, tripId, excludeId) {
    const result = await client.query(`SELECT COALESCE(SUM(birds), 0)::text AS birds,
            COALESCE(SUM(weight), 0)::text AS weight,
            COALESCE(SUM(mortality), 0)::text AS mortality_count,
            COALESCE(SUM(mort_kg), 0)::text AS mortality_weight
       FROM trip_deliveries
      WHERE trip_id = $1 AND deleted = FALSE ${excludeId ? "AND id <> $2" : ""}`, excludeId ? [tripId, excludeId] : [tripId]);
    const row = result.rows[0];
    return {
        birds: Number(row.birds),
        weight: Number(row.weight),
        mortalityCount: Number(row.mortality_count),
        mortalityWeight: Number(row.mortality_weight),
    };
}
export function assertWithinCapacity(opts) {
    // No bypass: the caller resolves `available` from Step 3 Pickup
    // (total_birds/dc_weight), which is mandatory before a trip can be
    // Completed — a Completed trip's capacity is never legitimately "not
    // tracked". If it resolves to 0, that is a real data problem and any
    // positive delivery is correctly rejected rather than silently allowed.
    const total = opts.alreadyAllocated + opts.requested;
    if (total > opts.available) {
        const noun = opts.label === "birds" ? "birds" : "weight";
        throw new AppError(422, `Shop delivery ${noun} exceed the trip available ${noun}. ` +
            `Available: ${opts.available}, already allocated: ${opts.alreadyAllocated}, requested: ${opts.requested}.`);
    }
}
//# sourceMappingURL=tripDeliverySync.js.map