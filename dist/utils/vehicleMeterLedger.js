import { query } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { dateOnly, num, str } from "./coerce.js";
/**
 * Millisecond-precise ISO string for a DB timestamptz value being re-used as
 * a validateVehicleMeter `eventInstant`. NOT the same as coerce.ts's
 * isoOrNull(), which round-trips through Date.toString() and silently
 * truncates to whole seconds — harmless for display, but two records
 * created within the same second then collapse to the same instant (or
 * worse, one that no longer reflects true creation order), which is exactly
 * the precision this validator depends on to pick the right neighbor.
 */
export function preciseIsoOrUndefined(value) {
    if (value == null)
        return undefined;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
const SOURCE_LABELS = {
    TRIP_START: "Trip start",
    TRIP_END: "Trip end",
    FUEL: "Fuel bill",
    MAINTENANCE: "Maintenance entry",
};
function mapEvent(row) {
    return {
        vehicleId: num(row.vehicle_id),
        sourceType: str(row.source_type),
        recordId: str(row.record_id),
        ref: str(row.ref),
        tripId: row.trip_id == null ? undefined : str(row.trip_id),
        meter: num(row.meter),
        eventDate: dateOnly(row.event_date) ?? "",
        eventInstant: preciseIsoOrUndefined(row.event_instant) ?? "",
        tripStatus: row.trip_status == null ? undefined : str(row.trip_status),
    };
}
async function run(client, sql, params) {
    return client ? client.query(sql, params) : query(sql, params);
}
/**
 * Lock the vehicle's row so a concurrent write for the same vehicle serializes
 * behind this one. Must be called inside the same transaction as the
 * subsequent validateVehicleMeter() + write, before either happens — this is
 * what makes "read latest -> validate -> write" atomic (see db.ts withTransaction).
 */
export async function lockVehicleForMeterWrite(client, vehicleId) {
    const result = await client.query(`SELECT id FROM vehicles WHERE id = $1 FOR UPDATE`, [
        vehicleId,
    ]);
    if (!result.rowCount) {
        throw new AppError(422, "Vehicle not found", { vehicleId });
    }
}
/** Advisory read: the single latest accepted meter reading for a vehicle,
 * across trips (start + end), fuel expenses, and fleet maintenance — ordered
 * by business date first (event_date), then the most precise available
 * "actually happened at" timestamp (event_instant) — never MAX(meter). */
export async function getLatestVehicleMeter(client, vehicleId, excludeTripId) {
    // Editing a trip must never report the trip's own start/end meter - or the
    // fuel synced from its own diesel rows - as the "previous" reading.
    const params = [vehicleId];
    let exclude = "";
    if (excludeTripId != null && excludeTripId > 0) {
        params.push(excludeTripId);
        exclude = `AND NOT (source_type IN ('TRIP_START', 'TRIP_END') AND record_id = $2)
     AND NOT (source_type = 'FUEL' AND EXISTS (
       SELECT 1 FROM fuel_expenses fe
       WHERE fe.id::text = vehicle_meter_events.record_id AND fe.trip_id = $2
     ))`;
    }
    const result = await run(client, `SELECT * FROM vehicle_meter_events
     WHERE vehicle_id = $1
     ${exclude}
     ORDER BY event_date DESC, event_instant DESC, created_at DESC, record_id DESC
     LIMIT 1`, params);
    if (!result.rowCount)
        return null;
    return mapEvent(result.rows[0]);
}
/** Latest accepted reading for every vehicle that has meter history. */
export async function listLatestVehicleMeters() {
    const result = await query(`SELECT DISTINCT ON (vehicle_id) vehicle_id, meter
     FROM vehicle_meter_events
     ORDER BY vehicle_id, event_date DESC, event_instant DESC, created_at DESC, record_id DESC`);
    return result.rows.map((row) => ({ vehicleId: num(row.vehicle_id), meter: num(row.meter) }));
}
function excludeClause(exclude, paramOffset) {
    if (!exclude)
        return { clause: "", params: [] };
    const types = Array.isArray(exclude.sourceType) ? exclude.sourceType : [exclude.sourceType];
    return {
        clause: `AND NOT (source_type = ANY($${paramOffset}::text[]) AND record_id = $${paramOffset + 1})`,
        params: [types, String(exclude.recordId)],
    };
}
/**
 * The one universal meter validator. Looks at the vehicle's chronological
 * neighbors relative to (eventDate, eventInstant) — excluding the record
 * being written, when editing — and rejects `newMeter` if it would either:
 *   - fall below the previous neighbor (the forward-only CREATE rule), or
 *   - rise above the next neighbor (the "don't break historical order" EDIT
 *     rule — a create has no next neighbor, so this never fires for creates).
 *
 * `eventDate` is the record's business date (required — this is the primary
 * chronological key, see the view's comment for why). `eventInstant` tiebreaks
 * same-day records and defaults to "now" when the caller has no more precise
 * timestamp (matching how the view falls back to created_at for Fuel/Maintenance).
 *
 * Must run inside the same transaction as lockVehicleForMeterWrite() and the
 * write itself.
 */
export async function validateVehicleMeter(client, opts) {
    const eventInstant = opts.eventInstant ?? new Date().toISOString();
    const { clause, params } = excludeClause(opts.exclude, 4);
    const prevResult = await client.query(`SELECT * FROM vehicle_meter_events
     WHERE vehicle_id = $1
       AND (event_date, event_instant) <= ($2::date, $3::timestamptz)
       ${clause}
     ORDER BY event_date DESC, event_instant DESC, created_at DESC, record_id DESC
     LIMIT 1`, [opts.vehicleId, opts.eventDate, eventInstant, ...params]);
    const prev = prevResult.rowCount ? mapEvent(prevResult.rows[0]) : null;
    if (prev && opts.newMeter < prev.meter) {
        throw new AppError(422, `${opts.context} cannot be less than the vehicle's latest recorded reading of ${prev.meter} KM (${SOURCE_LABELS[prev.sourceType]} ${prev.ref}).`, { latestMeter: prev.meter, latestSource: prev.sourceType, latestRef: prev.ref });
    }
    const nextResult = await client.query(`SELECT * FROM vehicle_meter_events
     WHERE vehicle_id = $1
       AND (event_date, event_instant) > ($2::date, $3::timestamptz)
       ${clause}
     ORDER BY event_date ASC, event_instant ASC, created_at ASC, record_id ASC
     LIMIT 1`, [opts.vehicleId, opts.eventDate, eventInstant, ...params]);
    const next = nextResult.rowCount ? mapEvent(nextResult.rows[0]) : null;
    if (next && opts.newMeter > next.meter) {
        throw new AppError(422, `${opts.context} of ${opts.newMeter} KM exceeds a later recorded reading of ${next.meter} KM (${SOURCE_LABELS[next.sourceType]} ${next.ref}) and would break the vehicle's chronological meter history.`, { nextMeter: next.meter, nextSource: next.sourceType, nextRef: next.ref });
    }
}
/** Full ordered timeline for a vehicle — backs the Vehicle History UI. */
export async function listVehicleMeterHistory(vehicleId) {
    const result = await query(`SELECT vme.*,
            CASE
              WHEN vme.source_type = 'FUEL' AND trip_fuel.source_type = 'TRIP'
                THEN trip_fuel.trip_id::text
              ELSE NULL
            END AS trip_id,
            CASE
              WHEN vme.source_type IN ('TRIP_START', 'TRIP_END') THEN trip.status
              WHEN vme.source_type = 'FUEL' AND trip_fuel.source_type = 'TRIP' THEN fuel_trip.status
              ELSE NULL
            END AS trip_status
     FROM vehicle_meter_events vme
     LEFT JOIN trips trip
       ON vme.source_type IN ('TRIP_START', 'TRIP_END')
      AND trip.id::text = vme.record_id
     LEFT JOIN fuel_expenses trip_fuel
       ON vme.source_type = 'FUEL'
      AND trip_fuel.id::text = vme.record_id
      AND trip_fuel.source_type = 'TRIP'
     LEFT JOIN trips fuel_trip
       ON fuel_trip.id = trip_fuel.trip_id
     WHERE vme.vehicle_id = $1
       AND (
         vme.source_type NOT IN ('TRIP_START', 'TRIP_END')
         OR EXISTS (
           SELECT 1
           FROM trips t
           WHERE t.id::text = vme.record_id
             AND t.status IN ('Approved', 'Completed')
             AND COALESCE(t.deleted, FALSE) = FALSE
         )
       )
       AND (
         vme.source_type <> 'FUEL'
         OR NOT EXISTS (
           SELECT 1
           FROM fuel_expenses fe
           WHERE fe.id::text = vme.record_id
             AND fe.source_type = 'TRIP'
         )
         OR EXISTS (
           SELECT 1
           FROM fuel_expenses fe
           JOIN trips t ON t.id = fe.trip_id
           WHERE fe.id::text = vme.record_id
             AND fe.source_type = 'TRIP'
             AND t.status IN ('Approved', 'Completed')
             AND COALESCE(t.deleted, FALSE) = FALSE
         )
       )
     ORDER BY vme.event_date ASC, vme.event_instant ASC, vme.created_at ASC, vme.record_id ASC`, [vehicleId]);
    const events = result.rows.map(mapEvent);
    let prevMeter = null;
    return events.map((e) => {
        const diff = prevMeter == null ? null : Number((e.meter - prevMeter).toFixed(2));
        prevMeter = e.meter;
        return { ...e, diffFromPrevious: diff };
    });
}
//# sourceMappingURL=vehicleMeterLedger.js.map