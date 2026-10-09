import type pg from "pg";
import { dateOnly, num, numOrNull, str } from "./coerce.js";
import { AppError } from "../middleware/errorHandler.js";
import type { DieselEntry } from "../types/models.js";

type Client = pg.PoolClient;

/**
 * Upsert fuel_expenses rows from trip diesel entries (Step 5 sync).
 *
 * Identity is (trip_id, trip_fuel_entry_index) — the diesel row's stable
 * rowIndex — backed by a partial unique index (source_type='TRIP', not
 * deleted). This makes the sync idempotent under repeat/concurrent Step 5
 * submissions (INSERT ... ON CONFLICT) instead of relying on bill_no text
 * matching. Manual entries (source_type='MANUAL') are never touched here.
 */
/**
 * Allocate the next backend-authoritative fuel bill number for a trip:
 * <trip_no>-F001, -F002, ... (supports 5/10/100+ records; width grows).
 *
 * The per-trip sequence lives in trip_fuel_bill_counters. The atomic upsert
 * below takes the row lock for (trip_id) — and the caller holds
 * pg_advisory_xact_lock('trip_fuel_<id>') for the whole sync — so concurrent
 * creates for the SAME trip serialize and each gets a distinct increment.
 * The counter never decreases, so deleted/cancelled/rejected numbers stay
 * permanently consumed and are never re-issued.
 *
 * fuel_expenses.bill_no UNIQUE is the final guard; any residual collision
 * surfaces as 23505 (409) and the whole transaction rolls back.
 */
export async function allocateTripFuelBillNo(
  client: Client,
  tripId: number,
  tripNo: string
): Promise<string> {
  const cleanNo = str(tripNo).trim();
  if (!cleanNo) {
    throw new AppError(422, "Trip number is required to generate a fuel bill number.", {
      code: "FUEL_NUMBER_CONFLICT",
      tripId,
    });
  }
  const counter = await client.query<{ last_sequence: string }>(
    `INSERT INTO trip_fuel_bill_counters (trip_id, last_sequence)
     VALUES ($1, 1)
     ON CONFLICT (trip_id)
     DO UPDATE SET last_sequence = trip_fuel_bill_counters.last_sequence + 1
     RETURNING last_sequence`,
    [tripId]
  );
  const seq = Number(counter.rows[0].last_sequence);
  return `${cleanNo}-F${String(seq).padStart(3, "0")}`;
}

export async function syncDieselToFuelExpenses(
  client: Client,
  tripId: number,
  tripDate: string,
  entries: DieselEntry[],
  context: {
    vehicleId?: number | null;
    vehicleNo?: string | null;
    driverId?: number | null;
    driverName?: string | null;
    supervisorId?: number | null;
    supervisorName?: string | null;
    createdBy?: string;
  }
) {
  const activeIndices: number[] = [];
  // Serialize every fuel sync for this trip: concurrent Step 5 submissions for
  // the same trip queue here, so per-trip sequence allocation below can never
  // collide (the global UNIQUE bill_no stays the final guard).
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`trip_fuel_${tripId}`]);
  const tripNoRow = await client.query<{ trip_no: string }>(
    `SELECT trip_no FROM trips WHERE id = $1`, [tripId]);
  const tripNo = tripNoRow.rowCount ? str(tripNoRow.rows[0].trip_no) : "";

  for (const entry of entries) {
    const litres = Number(entry.litres ?? 0);
    const rate = Number(entry.rate ?? 0);
    if (litres <= 0 && rate <= 0) continue;

    activeIndices.push(entry.rowIndex);
    const amount = Number((litres * rate).toFixed(2));

    // Only allocate a new bill_no when inserting. Re-generating on every upsert
    // races under multi-bill trips and can fail UNIQUE(bill_no).
    const existingFuel = await client.query<{ id: number; bill_no: string }>(
      `SELECT id, bill_no FROM fuel_expenses
        WHERE trip_id = $1 AND trip_fuel_entry_index = $2
          AND source_type = 'TRIP' AND COALESCE(deleted, FALSE) = FALSE
        LIMIT 1`,
      [tripId, entry.rowIndex]
    );

    let billNo: string;
    if (existingFuel.rowCount) {
      billNo = existingFuel.rows[0].bill_no;
    } else {
      billNo = await allocateTripFuelBillNo(client, tripId, tripNo);
      // (bill number allocated on the line above)
    }

    await client.query(
      `INSERT INTO fuel_expenses (
         bill_no, expense_date, vehicle_id, vehicle_no, driver_id, driver_name,
         supervisor_id, supervisor_name, trip_id, trip_fuel_entry_index, source_type,
         meter_reading, amount, rate, litres, petrol_bunk, pump_name, bunk_address,
         remarks, status, ops_status, image_data, image_name, created_by
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'TRIP',
         $11,$12,$13,$14,$15,$15,$16,
         $17,'Pending'::approval_status,'Pending Approval'::ops_record_status,$18,$19,$20
       )
       ON CONFLICT (trip_id, trip_fuel_entry_index) WHERE source_type = 'TRIP' AND deleted = FALSE
       DO UPDATE SET
         expense_date = EXCLUDED.expense_date,
         vehicle_id = COALESCE(EXCLUDED.vehicle_id, fuel_expenses.vehicle_id),
         vehicle_no = COALESCE(EXCLUDED.vehicle_no, fuel_expenses.vehicle_no),
         driver_id = COALESCE(EXCLUDED.driver_id, fuel_expenses.driver_id),
         driver_name = COALESCE(EXCLUDED.driver_name, fuel_expenses.driver_name),
         supervisor_id = COALESCE(EXCLUDED.supervisor_id, fuel_expenses.supervisor_id),
         supervisor_name = COALESCE(EXCLUDED.supervisor_name, fuel_expenses.supervisor_name),
         meter_reading = COALESCE(EXCLUDED.meter_reading, fuel_expenses.meter_reading),
         amount = EXCLUDED.amount,
         rate = EXCLUDED.rate,
         litres = EXCLUDED.litres,
         petrol_bunk = COALESCE(EXCLUDED.petrol_bunk, fuel_expenses.petrol_bunk),
         pump_name = COALESCE(EXCLUDED.pump_name, fuel_expenses.pump_name),
         bunk_address = COALESCE(EXCLUDED.bunk_address, fuel_expenses.bunk_address),
         image_data = COALESCE(EXCLUDED.image_data, fuel_expenses.image_data),
         image_name = COALESCE(EXCLUDED.image_name, fuel_expenses.image_name),
         updated_at = NOW()
       WHERE fuel_expenses.status = 'Pending'`,
      [
        billNo,
        tripDate,
        context.vehicleId ?? null,
        context.vehicleNo ?? null,
        context.driverId ?? null,
        context.driverName ?? null,
        context.supervisorId ?? null,
        context.supervisorName ?? null,
        tripId,
        entry.rowIndex,
        entry.meter ?? 0,
        amount,
        rate,
        litres,
        entry.bunkName ?? "",
        entry.bunkGps ?? "",
        `Auto-synced from Trip #${tripId} diesel row ${entry.rowIndex}`,
        entry.imageData ?? null,
        entry.imageName ?? null,
        context.createdBy ?? "trip-sync",
      ]
    );
  }

  if (activeIndices.length === 0) {
    await client.query(
      `DELETE FROM fuel_expenses
       WHERE trip_id = $1 AND source_type = 'TRIP' AND status = 'Pending' AND deleted = FALSE`,
      [tripId]
    );
  } else {
    await client.query(
      `DELETE FROM fuel_expenses
       WHERE trip_id = $1 AND source_type = 'TRIP' AND status = 'Pending' AND deleted = FALSE
         AND trip_fuel_entry_index <> ALL($2::int[])`,
      [tripId, activeIndices]
    );
  }
}

/**
 * Load live diesel rows from trip_diesel_entries and upsert Fuel Expenses.
 * Prefer this over syncing a request body — Step 5 expense payloads omit diesel
 * (bills are POSTed to /diesel separately), so body-based sync was a no-op.
 */
export async function syncTripFuelFromDb(
  client: Client,
  tripId: number,
  opts: { approveIfCompleted?: boolean; createdBy?: string } = {}
): Promise<number> {
  const tripRes = await client.query(
    `SELECT id, trip_date, status, vehicle_id, vehicle_no, driver_id, driver_name,
            supervisor_id, supervisor_name
     FROM trips WHERE id = $1`,
    [tripId]
  );
  if (!tripRes.rowCount) return 0;
  const trip = tripRes.rows[0] as Record<string, unknown>;

  const dieselRows = await client.query(
    `SELECT row_index, litres, rate, meter, bunk_name, bunk_gps, image_data, image_name
     FROM trip_diesel_entries WHERE trip_id = $1 ORDER BY row_index`,
    [tripId]
  );
  const entries: DieselEntry[] = dieselRows.rows.map((r) => ({
    rowIndex: num(r.row_index),
    litres: r.litres == null ? null : num(r.litres),
    rate: r.rate == null ? null : num(r.rate),
    meter: r.meter == null ? null : num(r.meter),
    bunkName: r.bunk_name == null ? null : str(r.bunk_name),
    bunkGps: r.bunk_gps == null ? null : str(r.bunk_gps),
    imageData: r.image_data == null ? null : str(r.image_data),
    imageName: r.image_name == null ? null : str(r.image_name),
  }));

  await syncDieselToFuelExpenses(client, tripId, dateOnly(trip.trip_date) ?? "", entries, {
    vehicleId: numOrNull(trip.vehicle_id),
    vehicleNo: trip.vehicle_no == null ? null : str(trip.vehicle_no),
    driverId: numOrNull(trip.driver_id),
    driverName: trip.driver_name == null ? null : str(trip.driver_name),
    supervisorId: numOrNull(trip.supervisor_id),
    supervisorName: trip.supervisor_name == null ? null : str(trip.supervisor_name),
    createdBy: opts.createdBy ?? "trip-diesel-sync",
  });

  if (opts.approveIfCompleted && str(trip.status) === "Completed") {
    await client.query(
      `UPDATE fuel_expenses
         SET status = 'Approved',
             approved_by = COALESCE($2, approved_by, 'system'),
             approved_date = COALESCE(approved_date, NOW()),
             ops_status = 'Approved',
             updated_at = NOW()
       WHERE trip_id = $1 AND source_type = 'TRIP' AND status = 'Pending'
         AND COALESCE(deleted, FALSE) = FALSE`,
      [tripId, opts.createdBy ?? "system"]
    );
  }

  return entries.filter((e) => Number(e.litres ?? 0) > 0 || Number(e.rate ?? 0) > 0).length;
}

export async function loadDcPhoto(
  client: Client,
  tripId: number,
  dcPhotoKey: string | null,
  legId?: number | null
): Promise<{
  dcPhotoKey: string | null;
  dcPhotoMime: string | null;
  dcPhotoData: string | null;
  dcPhotoKey2: string | null;
  dcPhotoMime2: string | null;
  dcPhotoData2: string | null;
  pickupPhotos: Array<{ key: string; mime: string; data: string }>;
}> {
  const empty = {
    dcPhotoKey: dcPhotoKey ?? null,
    dcPhotoMime: null,
    dcPhotoData: null,
    dcPhotoKey2: null,
    dcPhotoMime2: null,
    dcPhotoData2: null,
    pickupPhotos: [],
  };
  const result = await client.query(
    `SELECT media_key, mime_type, data_base64 FROM trip_media
     WHERE trip_id = $1 AND media_type = 'image'
       AND ($2::int IS NULL OR leg_id = $2)
     ORDER BY media_key`,
    [tripId, legId ?? null]
  );
  if (!result.rowCount) return empty;

  const photos = result.rows
    .map((r) => ({
      key: str(r.media_key),
      mime: r.mime_type ? str(r.mime_type) : null,
      data: r.data_base64 ? str(r.data_base64) : null,
    }))
    .filter((p) => p.data);

  const primary = photos.find((p) => p.key === dcPhotoKey) ?? photos[0] ?? null;
  const secondary = photos.find((p) => p.key !== (primary?.key ?? "")) ?? null;

  return {
    dcPhotoKey: primary?.key ?? null,
    dcPhotoMime: primary?.mime ?? null,
    dcPhotoData: primary?.data ?? null,
    dcPhotoKey2: secondary?.key ?? null,
    dcPhotoMime2: secondary?.mime ?? null,
    dcPhotoData2: secondary?.data ?? null,
    pickupPhotos: photos.map((photo) => ({
      key: photo.key,
      mime: photo.mime ?? "image/jpeg",
      data: photo.data!,
    })),
  };
}
