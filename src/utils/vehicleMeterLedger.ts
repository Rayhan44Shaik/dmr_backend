import type pg from "pg";
import { query } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { dateOnly, num, str } from "./coerce.js";

type Client = pg.PoolClient;
type Queryable = Client | null;

/**
 * Millisecond-precise ISO string for a DB timestamptz value being re-used as
 * a validateVehicleMeter `eventInstant`. NOT the same as coerce.ts's
 * isoOrNull(), which round-trips through Date.toString() and silently
 * truncates to whole seconds — harmless for display, but two records
 * created within the same second then collapse to the same instant (or
 * worse, one that no longer reflects true creation order), which is exactly
 * the precision this validator depends on to pick the right neighbor.
 */
export function preciseIsoOrUndefined(value: unknown): string | undefined {
  if (value == null) return undefined;
  const d = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export type MeterSourceType = "TRIP_START" | "TRIP_END" | "FUEL" | "MAINTENANCE";

export interface MeterEvent {
  vehicleId: number;
  sourceType: MeterSourceType;
  recordId: string;
  ref: string;
  meter: number;
  eventDate: string;
  eventInstant: string;
}

const SOURCE_LABELS: Record<MeterSourceType, string> = {
  TRIP_START: "Trip start",
  TRIP_END: "Trip end",
  FUEL: "Fuel bill",
  MAINTENANCE: "Maintenance entry",
};

function mapEvent(row: Record<string, unknown>): MeterEvent {
  return {
    vehicleId: num(row.vehicle_id),
    sourceType: str(row.source_type) as MeterSourceType,
    recordId: str(row.record_id),
    ref: str(row.ref),
    meter: num(row.meter),
    eventDate: dateOnly(row.event_date) ?? "",
    eventInstant: preciseIsoOrUndefined(row.event_instant) ?? "",
  };
}

async function run(client: Queryable, sql: string, params: unknown[]) {
  return client ? client.query(sql, params) : query(sql, params);
}

/**
 * Lock the vehicle's row so a concurrent write for the same vehicle serializes
 * behind this one. Must be called inside the same transaction as the
 * subsequent validateVehicleMeter() + write, before either happens — this is
 * what makes "read latest -> validate -> write" atomic (see db.ts withTransaction).
 */
export async function lockVehicleForMeterWrite(client: Client, vehicleId: number): Promise<void> {
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
export async function getLatestVehicleMeter(
  client: Queryable,
  vehicleId: number
): Promise<MeterEvent | null> {
  const result = await run(
    client,
    `SELECT * FROM vehicle_meter_events
     WHERE vehicle_id = $1
     ORDER BY event_date DESC, event_instant DESC, created_at DESC, record_id DESC
     LIMIT 1`,
    [vehicleId]
  );
  if (!result.rowCount) return null;
  return mapEvent(result.rows[0]);
}

/** Latest accepted reading for every vehicle that has meter history. */
export async function listLatestVehicleMeters(): Promise<Array<{ vehicleId: number; meter: number }>> {
  const result = await query(
    `SELECT DISTINCT ON (vehicle_id) vehicle_id, meter
     FROM vehicle_meter_events
     ORDER BY vehicle_id, event_date DESC, event_instant DESC, created_at DESC, record_id DESC`
  );
  return result.rows.map((row) => ({ vehicleId: num(row.vehicle_id), meter: num(row.meter) }));
}

interface ExcludeSpec {
  sourceType: MeterSourceType | MeterSourceType[];
  recordId: string | number;
}

function excludeClause(exclude: ExcludeSpec | undefined, paramOffset: number) {
  if (!exclude) return { clause: "", params: [] as unknown[] };
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
export async function validateVehicleMeter(
  client: Client,
  opts: {
    vehicleId: number;
    newMeter: number;
    eventDate: string;
    eventInstant?: string;
    exclude?: ExcludeSpec;
    context: string;
  }
): Promise<void> {
  const eventInstant = opts.eventInstant ?? new Date().toISOString();
  const { clause, params } = excludeClause(opts.exclude, 4);

  const prevResult = await client.query(
    `SELECT * FROM vehicle_meter_events
     WHERE vehicle_id = $1
       AND (event_date, event_instant) <= ($2::date, $3::timestamptz)
       ${clause}
     ORDER BY event_date DESC, event_instant DESC, created_at DESC, record_id DESC
     LIMIT 1`,
    [opts.vehicleId, opts.eventDate, eventInstant, ...params]
  );
  const prev = prevResult.rowCount ? mapEvent(prevResult.rows[0]) : null;

  if (prev && opts.newMeter < prev.meter) {
    throw new AppError(
      422,
      `${opts.context} cannot be less than the vehicle's latest recorded reading of ${prev.meter} KM (${SOURCE_LABELS[prev.sourceType]} ${prev.ref}).`,
      { latestMeter: prev.meter, latestSource: prev.sourceType, latestRef: prev.ref }
    );
  }

  const nextResult = await client.query(
    `SELECT * FROM vehicle_meter_events
     WHERE vehicle_id = $1
       AND (event_date, event_instant) > ($2::date, $3::timestamptz)
       ${clause}
     ORDER BY event_date ASC, event_instant ASC, created_at ASC, record_id ASC
     LIMIT 1`,
    [opts.vehicleId, opts.eventDate, eventInstant, ...params]
  );
  const next = nextResult.rowCount ? mapEvent(nextResult.rows[0]) : null;

  if (next && opts.newMeter > next.meter) {
    throw new AppError(
      422,
      `${opts.context} of ${opts.newMeter} KM exceeds a later recorded reading of ${next.meter} KM (${SOURCE_LABELS[next.sourceType]} ${next.ref}) and would break the vehicle's chronological meter history.`,
      { nextMeter: next.meter, nextSource: next.sourceType, nextRef: next.ref }
    );
  }
}

/** Full ordered timeline for a vehicle — backs the Vehicle History UI. */
export async function listVehicleMeterHistory(vehicleId: number): Promise<
  Array<MeterEvent & { diffFromPrevious: number | null }>
> {
  const result = await query(
    `SELECT * FROM vehicle_meter_events
     WHERE vehicle_id = $1
     ORDER BY event_date ASC, event_instant ASC, created_at ASC, record_id ASC`,
    [vehicleId]
  );
  const events = result.rows.map(mapEvent);
  let prevMeter: number | null = null;
  return events.map((e) => {
    const diff = prevMeter == null ? null : Number((e.meter - prevMeter).toFixed(2));
    prevMeter = e.meter;
    return { ...e, diffFromPrevious: diff };
  });
}
