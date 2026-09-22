/**
 * Same-trip multi-load helpers: trip_legs holds repeated Farm→Pickup→Deliveries
 * cycles (max 4) while Step 1 / Step 5 stay on the trips row.
 */
import type pg from "pg";
import { AppError } from "../middleware/errorHandler.js";
import type { BoxDetail, ShopDelivery } from "../types/models.js";
import { isoOrNull, num, numOrNull, str } from "./coerce.js";

type Client = pg.PoolClient;

export const MAX_TRIP_LEGS = 4;

export interface TripLegRow {
  id: number;
  tripId: number;
  legIndex: number;
  sourceFarmId: number | null;
  sourceFarm: string | null;
  reachedTime: string | null;
  destMeter: number | null;
  pickupTolls: number;
  farmAddress: string | null;
  avgBirdWeight: number | null;
  farmRemarks: string | null;
  farmBirdTypeId: number | null;
  farmBirdType: string | null;
  farmBirdCount: number | null;
  farmLoadWeight: number | null;
  farmRate: number | null;
  farmAmount: number | null;
  farmGpsLat: number | null;
  farmGpsLon: number | null;
  farmGpsAccuracy: number | null;
  farmGpsTime: string | null;
  farmStepSubmitted: boolean;
  farmStepSubmittedAt: string | null;
  dcWeight: number;
  totalBirds: number;
  boxes: number;
  avgWeight: number;
  pickupLoadTime: string | null;
  dcPhotoKey: string | null;
  pickupStepSubmitted: boolean;
  pickupStepSubmittedAt: string | null;
  deliveryStepSubmitted: boolean;
  deliveriesStepSubmittedAt: string | null;
  boxDetails?: BoxDetail[];
  deliveries?: ShopDelivery[];
}

export function mapTripLeg(row: Record<string, unknown>): TripLegRow {
  return {
    id: num(row.id),
    tripId: num(row.trip_id),
    legIndex: num(row.leg_index),
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
  };
}

export function resolveLegIndex(body: Record<string, unknown> | null | undefined): number {
  const raw = body?.legIndex ?? body?.loadIndex ?? body?.leg_index;
  if (raw == null || raw === "") return 1;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_TRIP_LEGS) {
    throw new AppError(400, `legIndex must be an integer from 1 to ${MAX_TRIP_LEGS}`);
  }
  return n;
}

export async function ensureTripLeg1(client: Client, tripId: number): Promise<TripLegRow> {
  try {
    const existing = await client.query(`SELECT * FROM trip_legs WHERE trip_id = $1 AND leg_index = 1`, [
      tripId,
    ]);
    if (existing.rowCount) return mapTripLeg(existing.rows[0]);

    const inserted = await client.query(
      `INSERT INTO trip_legs (trip_id, leg_index) VALUES ($1, 1) RETURNING *`,
      [tripId]
    );
    await client.query(`UPDATE trips SET leg_count = GREATEST(COALESCE(leg_count, 1), 1) WHERE id = $1`, [
      tripId,
    ]);
    return mapTripLeg(inserted.rows[0]);
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "42P01" || code === "42703") {
      throw new AppError(
        503,
        "Multi-load support needs database migration 049_trip_legs.sql. Run backend db:migrate, then retry."
      );
    }
    throw err;
  }
}

export async function getTripLeg(
  client: Client,
  tripId: number,
  legIndex: number
): Promise<TripLegRow | null> {
  const result = await client.query(
    `SELECT * FROM trip_legs WHERE trip_id = $1 AND leg_index = $2`,
    [tripId, legIndex]
  );
  return result.rowCount ? mapTripLeg(result.rows[0]) : null;
}

export async function requireTripLeg(
  client: Client,
  tripId: number,
  legIndex: number
): Promise<TripLegRow> {
  const leg = await getTripLeg(client, tripId, legIndex);
  if (!leg) {
    throw new AppError(404, `Load ${legIndex} not found on trip ${tripId}`);
  }
  return leg;
}

export async function listTripLegs(client: Client, tripId: number): Promise<TripLegRow[]> {
  const result = await client.query(
    `SELECT * FROM trip_legs WHERE trip_id = $1 ORDER BY leg_index`,
    [tripId]
  );
  return result.rows.map((r) => mapTripLeg(r));
}

/** Mirror leg 1 Step 2–4 fields onto trips for list/report compatibility. */
export async function mirrorLeg1ToTrip(client: Client, tripId: number): Promise<void> {
  const leg = await getTripLeg(client, tripId, 1);
  if (!leg) return;
  await client.query(
    `UPDATE trips SET
       source_farm_id = $2,
       source_farm = $3,
       reached_time = $4,
       dest_meter = $5,
       pickup_tolls = $6,
       farm_address = $7,
       avg_bird_weight = $8,
       farm_remarks = $9,
       farm_bird_type_id = $10,
       farm_bird_type = $11,
       farm_bird_count = $12,
       farm_load_weight = $13,
       farm_rate = $14,
       farm_amount = $15,
       farm_gps_lat = $16,
       farm_gps_lon = $17,
       farm_gps_accuracy = $18,
       farm_gps_time = $19,
       farm_step_submitted = $20,
       farm_step_submitted_at = COALESCE($21::timestamptz, farm_step_submitted_at),
       dc_weight = $22,
       total_birds = $23,
       boxes = $24,
       avg_weight = $25,
       pickup_load_time = $26,
       dc_photo_key = $27,
       pickup_step_submitted = $28,
       pickup_step_submitted_at = COALESCE($29::timestamptz, pickup_step_submitted_at),
       delivery_step_submitted = $30,
       deliveries_step_submitted_at = COALESCE($31::timestamptz, deliveries_step_submitted_at),
       updated_at = NOW()
     WHERE id = $1`,
    [
      tripId,
      leg.sourceFarmId,
      leg.sourceFarm,
      leg.reachedTime,
      leg.destMeter,
      leg.pickupTolls,
      leg.farmAddress,
      leg.avgBirdWeight,
      leg.farmRemarks,
      leg.farmBirdTypeId,
      leg.farmBirdType,
      leg.farmBirdCount,
      leg.farmLoadWeight,
      leg.farmRate,
      leg.farmAmount,
      leg.farmGpsLat,
      leg.farmGpsLon,
      leg.farmGpsAccuracy,
      leg.farmGpsTime,
      leg.farmStepSubmitted,
      leg.farmStepSubmittedAt,
      leg.dcWeight,
      leg.totalBirds,
      leg.boxes,
      leg.avgWeight,
      leg.pickupLoadTime,
      leg.dcPhotoKey,
      leg.pickupStepSubmitted,
      leg.pickupStepSubmittedAt,
      leg.deliveryStepSubmitted,
      leg.deliveriesStepSubmittedAt,
    ]
  );
}

/**
 * Trip-level farm/pickup/delivery flags are true only when EVERY load has
 * submitted that step — used for Step 5 gating and resume when leg_count > 1.
 */
export function aggregateLegStepFlags(legs: TripLegRow[]): {
  farmStepSubmitted: boolean;
  pickupStepSubmitted: boolean;
  deliveryStepSubmitted: boolean;
} {
  if (!legs.length) {
    return {
      farmStepSubmitted: false,
      pickupStepSubmitted: false,
      deliveryStepSubmitted: false,
    };
  }
  return {
    farmStepSubmitted: legs.every((l) => l.farmStepSubmitted),
    pickupStepSubmitted: legs.every((l) => l.pickupStepSubmitted),
    deliveryStepSubmitted: legs.every((l) => l.deliveryStepSubmitted),
  };
}

export async function syncTripStepFlagsFromLegs(client: Client, tripId: number): Promise<void> {
  const legs = await listTripLegs(client, tripId);
  const agg = aggregateLegStepFlags(legs);
  // Keep trip row flags as leg-1 mirror for single-load; for multi-load use
  // aggregate so expenses cannot submit until every load finishes deliveries.
  if (legs.length <= 1) {
    await mirrorLeg1ToTrip(client, tripId);
    return;
  }
  await client.query(
    `UPDATE trips SET
       farm_step_submitted = $2,
       pickup_step_submitted = $3,
       delivery_step_submitted = $4,
       updated_at = NOW()
     WHERE id = $1`,
    [tripId, agg.farmStepSubmitted, agg.pickupStepSubmitted, agg.deliveryStepSubmitted]
  );
  // Still mirror leg-1 farm identity for reports that read trips.source_farm_*
  const leg1 = legs.find((l) => l.legIndex === 1);
  if (leg1) {
    await client.query(
      `UPDATE trips SET
         source_farm_id = $2, source_farm = $3, dest_meter = $4,
         farm_bird_count = $5, farm_load_weight = $6,
         dc_weight = $7, total_birds = $8, boxes = $9, avg_weight = $10,
         dc_photo_key = $11
       WHERE id = $1`,
      [
        tripId,
        leg1.sourceFarmId,
        leg1.sourceFarm,
        leg1.destMeter,
        leg1.farmBirdCount,
        leg1.farmLoadWeight,
        leg1.dcWeight,
        leg1.totalBirds,
        leg1.boxes,
        leg1.avgWeight,
        leg1.dcPhotoKey,
      ]
    );
  }
}

export async function maxDieselMeter(client: Client, tripId: number): Promise<number> {
  const result = await client.query<{ m: string | null }>(
    `SELECT MAX(meter) AS m FROM trip_diesel_entries WHERE trip_id = $1 AND meter IS NOT NULL`,
    [tripId]
  );
  return num(result.rows[0]?.m);
}

/**
 * Floor for farm dest meter on a load:
 * - Load 1: opening meter
 * - Load N: max(all prior load destinations, max diesel so far)
 */
export async function farmMeterFloor(
  client: Client,
  tripId: number,
  legIndex: number,
  openingMeter: number | null
): Promise<{ floor: number; label: string }> {
  if (legIndex <= 1) {
    const floor = openingMeter != null && openingMeter > 0 ? openingMeter : 0;
    return { floor, label: "Step 1 starting meter" };
  }
  const priorDestResult = await client.query<{ m: string | null }>(
    `SELECT MAX(dest_meter) AS m
       FROM trip_legs
      WHERE trip_id = $1 AND leg_index < $2 AND dest_meter IS NOT NULL`,
    [tripId, legIndex]
  );
  const prevDest = num(priorDestResult.rows[0]?.m);
  const dieselMax = await maxDieselMeter(client, tripId);
  const floor = Math.max(prevDest, dieselMax);
  const label =
    dieselMax >= prevDest && dieselMax > 0
      ? "last diesel meter on this trip"
      : "previous load destination meter";
  return { floor, label };
}

/** Persist Step 2–4 scalar fields onto a trip_legs row from a step body. */
export async function upsertLegFields(
  client: Client,
  legId: number,
  body: Record<string, unknown>,
  flags: {
    farmStepSubmitted?: boolean;
    pickupStepSubmitted?: boolean;
    deliveryStepSubmitted?: boolean;
  } = {}
): Promise<void> {
  await client.query(
    `UPDATE trip_legs SET
       source_farm_id = COALESCE($2, source_farm_id),
       source_farm = COALESCE($3, source_farm),
       dest_meter = COALESCE($4, dest_meter),
       pickup_tolls = COALESCE($5, pickup_tolls),
       farm_address = COALESCE($6, farm_address),
       avg_bird_weight = COALESCE($7, avg_bird_weight),
       farm_remarks = COALESCE($8, farm_remarks),
       farm_bird_type_id = COALESCE($9, farm_bird_type_id),
       farm_bird_type = COALESCE($10, farm_bird_type),
       farm_bird_count = COALESCE($11, farm_bird_count),
       farm_load_weight = COALESCE($12, farm_load_weight),
       farm_rate = COALESCE($13, farm_rate),
       farm_amount = COALESCE($14, farm_amount),
       farm_gps_lat = COALESCE($15, farm_gps_lat),
       farm_gps_lon = COALESCE($16, farm_gps_lon),
       farm_gps_accuracy = COALESCE($17, farm_gps_accuracy),
       farm_gps_time = COALESCE($18, farm_gps_time),
       farm_step_submitted = COALESCE($19, farm_step_submitted),
       farm_step_submitted_at = CASE
         WHEN COALESCE($19::boolean, FALSE) AND farm_step_submitted_at IS NULL THEN NOW()
         ELSE farm_step_submitted_at END,
       reached_time = CASE
         WHEN COALESCE($19::boolean, FALSE) AND reached_time IS NULL THEN NOW()
         ELSE reached_time END,
       dc_weight = COALESCE($20, dc_weight),
       total_birds = COALESCE($21, total_birds),
       boxes = COALESCE($22, boxes),
       avg_weight = COALESCE($23, avg_weight),
       dc_photo_key = COALESCE($24, dc_photo_key),
       pickup_step_submitted = COALESCE($25, pickup_step_submitted),
       pickup_step_submitted_at = CASE
         WHEN COALESCE($25::boolean, FALSE) AND pickup_step_submitted_at IS NULL THEN NOW()
         ELSE pickup_step_submitted_at END,
       pickup_load_time = CASE
         WHEN COALESCE($25::boolean, FALSE) AND pickup_load_time IS NULL THEN NOW()
         ELSE pickup_load_time END,
       delivery_step_submitted = COALESCE($26, delivery_step_submitted),
       deliveries_step_submitted_at = CASE
         WHEN COALESCE($26::boolean, FALSE) AND deliveries_step_submitted_at IS NULL THEN NOW()
         ELSE deliveries_step_submitted_at END,
       updated_at = NOW()
     WHERE id = $1`,
    [
      legId,
      body.sourceFarmId ?? null,
      body.sourceFarm ?? null,
      body.destMeter ?? null,
      body.pickupTolls ?? null,
      body.farmAddress ?? null,
      body.avgBirdWeight ?? null,
      body.farmRemarks ?? body.remarks ?? null,
      body.farmBirdTypeId ?? null,
      body.farmBirdType ?? null,
      body.farmBirdCount ?? body.totalBirds ?? null,
      body.farmLoadWeight ?? body.dcWeight ?? null,
      body.farmRate ?? null,
      body.farmAmount ?? null,
      body.farmGpsLat ?? null,
      body.farmGpsLon ?? null,
      body.farmGpsAccuracy ?? null,
      body.farmGpsTime ?? null,
      flags.farmStepSubmitted ?? body.farmStepSubmitted ?? null,
      body.dcWeight ?? null,
      body.totalBirds ?? null,
      body.boxes ?? null,
      body.avgWeight ?? null,
      body.dcPhotoKey ?? null,
      flags.pickupStepSubmitted ?? body.pickupStepSubmitted ?? null,
      flags.deliveryStepSubmitted ?? body.deliveryStepSubmitted ?? null,
    ]
  );
}

export function overlayLegOntoTripBase(
  base: Record<string, unknown>,
  leg: TripLegRow
): Record<string, unknown> {
  return {
    ...base,
    sourceFarmId: leg.sourceFarmId,
    sourceFarm: leg.sourceFarm,
    reachedTime: leg.reachedTime,
    destMeter: leg.destMeter,
    pickupTolls: leg.pickupTolls,
    farmAddress: leg.farmAddress,
    avgBirdWeight: leg.avgBirdWeight,
    farmRemarks: leg.farmRemarks,
    farmBirdTypeId: leg.farmBirdTypeId,
    farmBirdType: leg.farmBirdType,
    farmBirdCount: leg.farmBirdCount,
    farmLoadWeight: leg.farmLoadWeight,
    farmRate: leg.farmRate,
    farmAmount: leg.farmAmount,
    farmGpsLat: leg.farmGpsLat,
    farmGpsLon: leg.farmGpsLon,
    farmGpsAccuracy: leg.farmGpsAccuracy,
    farmGpsTime: leg.farmGpsTime,
    farmStepSubmitted: leg.farmStepSubmitted,
    farmStepSubmittedAt: leg.farmStepSubmittedAt,
    dcWeight: leg.dcWeight,
    totalBirds: leg.totalBirds,
    boxes: leg.boxes,
    avgWeight: leg.avgWeight,
    pickupLoadTime: leg.pickupLoadTime,
    dcPhotoKey: leg.dcPhotoKey,
    pickupStepSubmitted: leg.pickupStepSubmitted,
    pickupStepSubmittedAt: leg.pickupStepSubmittedAt,
    deliveryStepSubmitted: leg.deliveryStepSubmitted,
    deliveriesStepSubmittedAt: leg.deliveriesStepSubmittedAt,
  };
}

export async function addTripLeg(client: Client, tripId: number): Promise<TripLegRow> {
  const trip = await client.query<{ status: string; leg_count: number; deleted: boolean }>(
    `SELECT status, leg_count, deleted FROM trips WHERE id = $1 FOR UPDATE`,
    [tripId]
  );
  if (!trip.rowCount) throw new AppError(404, `Trip ${tripId} not found`);
  if (trip.rows[0].deleted) throw new AppError(422, "Cannot modify a deleted trip");
  if (str(trip.rows[0].status) !== "Draft") {
    throw new AppError(422, "Additional loads can only be added while the trip is Draft");
  }

  const legs = await listTripLegs(client, tripId);
  if (!legs.length) {
    await ensureTripLeg1(client, tripId);
    legs.push(...(await listTripLegs(client, tripId)));
  }
  if (legs.length >= MAX_TRIP_LEGS) {
    throw new AppError(422, `Maximum of ${MAX_TRIP_LEGS} loads per trip`);
  }

  const last = legs[legs.length - 1];
  if (!last.deliveryStepSubmitted) {
    throw new AppError(
      422,
      `Complete deliveries for Load ${last.legIndex} before adding another load`
    );
  }

  const nextIndex = last.legIndex + 1;
  const inserted = await client.query(
    `INSERT INTO trip_legs (trip_id, leg_index) VALUES ($1, $2) RETURNING *`,
    [tripId, nextIndex]
  );
  await client.query(`UPDATE trips SET leg_count = $2, updated_at = NOW() WHERE id = $1`, [
    tripId,
    nextIndex,
  ]);
  // Multi-load: trip-level delivery flag goes false until the new load finishes
  await client.query(
    `UPDATE trips SET
       farm_step_submitted = FALSE,
       pickup_step_submitted = FALSE,
       delivery_step_submitted = FALSE
     WHERE id = $1`,
    [tripId]
  );
  return mapTripLeg(inserted.rows[0]);
}
