import type pg from "pg";
import { AppError } from "../middleware/errorHandler.js";
import { dateOnly, num, numOrNull, str } from "./coerce.js";
import { preciseIsoOrUndefined, validateVehicleMeter } from "./vehicleMeterLedger.js";

type Client = pg.PoolClient;

export type MeterLockKind = "trip" | "maintenance" | "fuel";

export interface MeterLockReason {
  kind: MeterLockKind;
  /** Human ref: trip_no / bill_no of the locking event. */
  ref: string;
  eventDate: string;
  approvedAt: string | null;
}

export interface TripMeterLock {
  locked: boolean;
  reason: MeterLockReason | null;
}

const KIND_LABEL: Record<MeterLockKind, string> = {
  trip: "trip",
  maintenance: "maintenance record",
  fuel: "fuel bill",
};

/**
 * Core trip meter lock (fuel/meter production validation).
 *
 * A non-final trip (Draft/Pending) for a vehicle is meter-LOCKED when a LATER
 * authoritative same-vehicle event became approved after the trip's meters
 * were last submitted:
 *   - another trip reaching Completed,
 *   - a maintenance bill reaching Approved,
 *   - a manual (or other-trip) fuel bill reaching Approved.
 *
 * "Later" is two-dimensional and uses business chronology, never bare
 * created_at ordering: the event must cover the trip's business date or a
 * later one (event_date >= trip_date) AND its approval instant must be newer
 * than the trip's meter baseline (expenses submit > start submit > created).
 * An approval that predates the trip's own submission was already visible to
 * validation at submit time, so it never locks.
 *
 * Completed/Deleted trips are final and never lock (their own lifecycle owns
 * them); deleted source rows never participate.
 *
 * Must run inside the caller's transaction AFTER lockVehicleForMeterWrite so
 * a concurrent approval for the same vehicle serializes first — a stale page
 * that submits after another session's approval always observes the lock.
 */
export async function getTripMeterLock(
  client: Client,
  tripId: number
): Promise<TripMeterLock> {
  const tripRes = await client.query(
    `SELECT id, trip_date, status, deleted, vehicle_id,
            start_step_submitted_at, expenses_step_submitted_at, created_at
     FROM trips WHERE id = $1`,
    [tripId]
  );
  if (!tripRes.rowCount) throw new AppError(404, `Trip ${tripId} not found`);
  const trip = tripRes.rows[0];
  const status = str(trip.status);
  if (Boolean(trip.deleted) || status === "Completed" || status === "Deleted") {
    return { locked: false, reason: null };
  }
  const vehicleId = num(trip.vehicle_id, 0);
  if (!vehicleId) return { locked: false, reason: null };
  const tripDate = dateOnly(trip.trip_date) ?? "";
  if (!tripDate) return { locked: false, reason: null };
  const baseline =
    preciseIsoOrUndefined(trip.expenses_step_submitted_at) ??
    preciseIsoOrUndefined(trip.start_step_submitted_at) ??
    preciseIsoOrUndefined(trip.created_at);
  if (!baseline) return { locked: false, reason: null };

  // Another completed trip for the same vehicle covering this date or later,
  // approved after this trip's meters were submitted. Trips completed by the
  // legacy fallback path may lack approved_at — created_at is the proxy.
  const laterTrip = await client.query(
    `SELECT trip_no AS ref, trip_date AS event_date, approved_at
     FROM trips
     WHERE vehicle_id = $1 AND id <> $2
       AND COALESCE(deleted, FALSE) = FALSE AND status = 'Completed'
       AND trip_date >= $3::date
       AND COALESCE(approved_at, created_at) > $4::timestamptz
     ORDER BY trip_date DESC, COALESCE(approved_at, created_at) DESC
     LIMIT 1`,
    [vehicleId, tripId, tripDate, baseline]
  );
  if (laterTrip.rowCount) {
    const row = laterTrip.rows[0];
    return {
      locked: true,
      reason: {
        kind: "trip",
        ref: str(row.ref),
        eventDate: dateOnly(row.event_date) ?? "",
        approvedAt: preciseIsoOrUndefined(row.approved_at) ?? null,
      },
    };
  }

  // An approved maintenance bill for the same vehicle covering this date or
  // later, approved after this trip's meters were submitted.
  const laterMaint = await client.query(
    `SELECT bill_no AS ref, maintenance_date AS event_date, approved_at
     FROM fleet_maintenance
     WHERE vehicle_id = $1
       AND COALESCE(deleted, FALSE) = FALSE AND status = 'Approved'
       AND maintenance_date >= $2::date
       AND COALESCE(approved_at, created_at) > $3::timestamptz
     ORDER BY maintenance_date DESC, COALESCE(approved_at, created_at) DESC
     LIMIT 1`,
    [vehicleId, tripDate, baseline]
  );
  if (laterMaint.rowCount) {
    const row = laterMaint.rows[0];
    return {
      locked: true,
      reason: {
        kind: "maintenance",
        ref: str(row.ref),
        eventDate: dateOnly(row.event_date) ?? "",
        approvedAt: preciseIsoOrUndefined(row.approved_at) ?? null,
      },
    };
  }

  // An approved fuel bill for the same vehicle (any source except this trip's
  // own synced rows) covering this date or later, approved after baseline.
  const laterFuel = await client.query(
    `SELECT bill_no AS ref, expense_date AS event_date, approved_date AS approved_at
     FROM fuel_expenses
     WHERE vehicle_id = $1
       AND COALESCE(deleted, FALSE) = FALSE AND ops_status = 'Approved'
       AND (trip_id IS NULL OR trip_id <> $2)
       AND expense_date >= $3::date
       AND COALESCE(approved_date, created_at) > $4::timestamptz
     ORDER BY expense_date DESC, COALESCE(approved_date, created_at) DESC
     LIMIT 1`,
    [vehicleId, tripId, tripDate, baseline]
  );
  if (laterFuel.rowCount) {
    const row = laterFuel.rows[0];
    return {
      locked: true,
      reason: {
        kind: "fuel",
        ref: str(row.ref),
        eventDate: dateOnly(row.event_date) ?? "",
        approvedAt: preciseIsoOrUndefined(row.approved_at) ?? null,
      },
    };
  }

  return { locked: false, reason: null };
}

/**
 * Trip completion prerequisites (fuel/meter scope).
 *
 * 1. Every MANUAL fuel bill linked to this trip must be Approved — trip-synced
 *    bills are auto-approved by completion itself in the same transaction, so
 *    only manual bills gate here.
 * 2. The trip's vehicle must have no actionable (Draft / Pending Approval)
 *    maintenance record — fuel/meter work cannot finalize while a related
 *    maintenance bill is not approved.
 *
 * Backend-enforced at updateStatus(→Completed); the frontend only improves UX.
 */
export async function assertTripCompletionGates(
  client: Client,
  tripId: number,
  vehicleId: number | null
): Promise<void> {
  const pendingFuel = await client.query(
    `SELECT bill_no FROM fuel_expenses
     WHERE trip_id = $1 AND source_type = 'MANUAL'
       AND COALESCE(deleted, FALSE) = FALSE AND ops_status <> 'Approved'
     ORDER BY bill_no LIMIT 1`,
    [tripId]
  );
  if (pendingFuel.rowCount) {
    throw new AppError(
      422,
      "Fuel entry cannot be completed because the related fuel bill is not approved.",
      {
        code: "FUEL_NOT_APPROVED",
        tripId,
        billNo: str(pendingFuel.rows[0].bill_no),
      }
    );
  }

  if (vehicleId) {
    const pendingMaint = await client.query(
      `SELECT bill_no FROM fleet_maintenance
       WHERE vehicle_id = $1 AND COALESCE(deleted, FALSE) = FALSE
         AND status <> 'Approved' AND status <> 'Rejected'
       ORDER BY maintenance_date DESC LIMIT 1`,
      [vehicleId]
    );
    if (pendingMaint.rowCount) {
      throw new AppError(
        422,
        "Fuel entry cannot be saved because the related maintenance record/bill is not approved.",
        {
          code: "MAINTENANCE_NOT_APPROVED",
          tripId,
          vehicleId,
          billNo: str(pendingMaint.rows[0].bill_no),
        }
      );
    }
  }
}

/**
 * Re-run the universal meter validation at trip completion (the stale window
 * between Step 5 submit and completion may have admitted a later approved
 * event). Mirrors the save() submit checks with excludeTripId so the trip's
 * own readings never compare against themselves.
 */
export async function revalidateTripMetersForCompletion(
  client: Client,
  tripRow: Record<string, unknown>
): Promise<void> {
  const vehicleId = num(tripRow.vehicle_id, 0);
  if (!vehicleId) return;
  const tripBusinessDate = dateOnly(tripRow.trip_date) ?? "";
  if (!tripBusinessDate) return;
  const tripId = num(tripRow.id);

  const opening = numOrNull(tripRow.opening_meter);
  const closing = numOrNull(tripRow.closing_meter) ?? numOrNull(tripRow.end_meter);
  if (opening != null && closing != null && closing < opening) {
    throw new AppError(
      422,
      `Trip closing meter (${closing} KM) cannot be less than the trip's own opening meter (${opening} KM).`
    );
  }

  const openingInstant =
    preciseIsoOrUndefined(tripRow.start_step_submitted_at) ??
    preciseIsoOrUndefined(tripRow.start_time) ??
    preciseIsoOrUndefined(tripRow.created_at);
  const closingInstant =
    preciseIsoOrUndefined(tripRow.expenses_step_submitted_at) ??
    preciseIsoOrUndefined(tripRow.end_time) ??
    preciseIsoOrUndefined(tripRow.created_at);

  if (opening != null) {
    await validateVehicleMeter(client, {
      vehicleId,
      newMeter: opening,
      eventDate: tripBusinessDate,
      eventInstant: openingInstant,
      excludeTripId: tripId,
      context: "Trip start meter",
    });
  }
  if (closing != null) {
    await validateVehicleMeter(client, {
      vehicleId,
      newMeter: closing,
      eventDate: tripBusinessDate,
      eventInstant: closingInstant,
      excludeTripId: tripId,
      context: "Trip closing meter",
    });
  }

  const diesel = await client.query(
    `SELECT meter FROM trip_diesel_entries WHERE trip_id = $1 AND meter IS NOT NULL AND meter > 0`,
    [tripId]
  );
  for (const row of diesel.rows) {
    await validateVehicleMeter(client, {
      vehicleId,
      newMeter: num(row.meter),
      eventDate: tripBusinessDate,
      eventInstant: closingInstant,
      excludeTripId: tripId,
      context: "Diesel entry meter reading",
    });
  }
}

/** Throw 409 when the trip's meters are locked; resolve silently otherwise. */
export async function assertTripMetersEditable(
  client: Client,
  tripId: number
): Promise<void> {
  const lock = await getTripMeterLock(client, tripId);
  if (!lock.locked || !lock.reason) return;
  const label = KIND_LABEL[lock.reason.kind];
  throw new AppError(
    409,
    `Trip meter readings are locked — a later approved ${label} (${lock.reason.ref}) exists for this vehicle.`,
    {
      code: "TRIP_METER_LOCKED",
      tripId,
      lockKind: lock.reason.kind,
      lockRef: lock.reason.ref,
      lockEventDate: lock.reason.eventDate,
    }
  );
}
