import type pg from "pg";
import { str, num, numOrNull, dateOnly } from "./coerce.js";
import { tripFuelBillNo } from "./fuelBillNumbering.js";
import { computeFuelAmountSql } from "./fuelExpenseRules.js";
import type { DieselEntry } from "../types/models.js";

type Client = pg.PoolClient;

/**
 * Upsert fuel_expenses rows from trip diesel entries (Step 5 sync).
 *
 * Identity is (trip_id, trip_fuel_entry_index) — the diesel row's stable
 * rowIndex — backed by a partial unique index (source_type='TRIP', not
 * deleted). This makes the sync idempotent under repeat/concurrent processing.
 * Manual entries (source_type='MANUAL') are never touched here.
 *
 * Bill numbers are TR-YYYYMMDD-NNN where NNN is the diesel row_index for that
 * trip. Two trips on the same date may share the same display bill_no; they
 * are distinguished by trip_id.
 */
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
    tripStatus?: string | null;
    tripNo?: string | null;
  }
) {
  const activeIndices: number[] = [];
  const autoApprove = context.tripStatus === "Completed";
  const tripNo = context.tripNo ?? null;

  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`fuel-ingest-${tripId}`]);

  for (const entry of entries) {
    const litres = Number(entry.litres ?? 0);
    const rate = Number(entry.rate ?? 0);
    if (!(litres > 0) || !(rate > 0)) continue;

    activeIndices.push(entry.rowIndex);
    const amount = await computeFuelAmountSql(client, litres, rate);
    const billNo = tripFuelBillNo(tripDate, entry.rowIndex);
    const gpsLat = numOrNull(entry.gpsLat);
    const gpsLon = numOrNull(entry.gpsLon);
    const gpsCapturedAt =
      entry.gpsCapturedAt == null || entry.gpsCapturedAt === ""
        ? null
        : new Date(String(entry.gpsCapturedAt)).toISOString();

    const approveFlag = autoApprove ? 1 : 0;

    const existing = await client.query(
      `SELECT id, ops_status, bill_no, litres, rate, amount
       FROM fuel_expenses
       WHERE source_type = 'TRIP'
         AND COALESCE(deleted, FALSE) = FALSE
         AND (
           (source_trip_id IS NOT NULL AND source_trip_id = $1 AND trip_fuel_entry_index = $2)
           OR (trip_id = $1 AND trip_fuel_entry_index = $2)
         )
       LIMIT 1`,
      [tripId, entry.rowIndex]
    );

    if (existing.rowCount) {
      const row = existing.rows[0];
      // Posted financial records are immutable. Reconcile / Step 5 edits
      // must not silently rewrite litres, rate, amount, or bill_no.
      if (str(row.ops_status) === "Approved" || str(row.status) === "Approved") {
        continue;
      }
      await client.query(
        `UPDATE fuel_expenses SET
           source_trip_id = COALESCE(source_trip_id, $2),
           source_trip_no = COALESCE(NULLIF(source_trip_no, ''), $3),
           expense_date = $4,
           vehicle_id = COALESCE($5, vehicle_id),
           vehicle_no = COALESCE($6, vehicle_no),
           driver_id = COALESCE($7, driver_id),
           driver_name = COALESCE($8, driver_name),
           supervisor_id = COALESCE($9, supervisor_id),
           supervisor_name = COALESCE($10, supervisor_name),
           meter_reading = COALESCE($11, meter_reading),
           amount = $12,
           rate = $13,
           litres = $14,
           petrol_bunk = COALESCE($15, petrol_bunk),
           pump_name = COALESCE($15, pump_name),
           bunk_address = COALESCE($16, bunk_address),
           image_data = COALESCE($17, image_data),
           image_name = COALESCE($18, image_name),
           gps_lat = COALESCE($19, gps_lat),
           gps_lon = COALESCE($20, gps_lon),
           gps_accuracy = COALESCE($21, gps_accuracy),
           gps_captured_at = COALESCE($22, gps_captured_at),
           status = CASE WHEN $23::int = 1 THEN 'Approved'::approval_status ELSE status END,
           ops_status = CASE WHEN $23::int = 1 THEN 'Approved'::ops_record_status ELSE ops_status END,
           approved_by = CASE WHEN $23::int = 1 THEN COALESCE(approved_by, $24) ELSE approved_by END,
           approved_date = CASE WHEN $23::int = 1 THEN COALESCE(approved_date, NOW()) ELSE approved_date END,
           updated_at = NOW()
         WHERE id = $1 AND ops_status <> 'Approved'`,
        [
          row.id,
          tripId,
          tripNo,
          tripDate,
          context.vehicleId ?? null,
          context.vehicleNo ?? null,
          context.driverId ?? null,
          context.driverName ?? null,
          context.supervisorId ?? null,
          context.supervisorName ?? null,
          entry.meter ?? 0,
          amount,
          rate,
          litres,
          entry.bunkName ?? "",
          entry.bunkGps ?? "",
          entry.imageData ?? null,
          entry.imageName ?? null,
          gpsLat,
          gpsLon,
          entry.gpsAccuracy ?? null,
          gpsCapturedAt,
          approveFlag,
          context.createdBy ?? "trip-sync",
        ]
      );
      continue;
    }

    await client.query(
      `INSERT INTO fuel_expenses (
         bill_no, expense_date, vehicle_id, vehicle_no, driver_id, driver_name,
         supervisor_id, supervisor_name, trip_id, source_trip_id, source_trip_no,
         trip_fuel_entry_index, source_type,
         meter_reading, amount, rate, litres, petrol_bunk, pump_name, bunk_address,
         remarks, status, ops_status, image_data, image_name,
         gps_lat, gps_lon, gps_accuracy, gps_captured_at,
         approved_by, approved_date, created_by
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$26,$10,'TRIP',
         $11,$12,$13,$14,$15,$15,$16,
         $17,
         CASE WHEN $21::int = 1 THEN 'Approved'::approval_status ELSE 'Pending'::approval_status END,
         CASE WHEN $21::int = 1 THEN 'Approved'::ops_record_status ELSE 'Pending Approval'::ops_record_status END,
         $18,$19,
         $22,$23,$24,$25,
         CASE WHEN $21::int = 1 THEN $20 ELSE NULL END,
         CASE WHEN $21::int = 1 THEN NOW() ELSE NULL END,
         $20
       )
       ON CONFLICT (source_trip_id, trip_fuel_entry_index)
         WHERE source_type = 'TRIP' AND deleted = FALSE AND source_trip_id IS NOT NULL
       DO NOTHING`,
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
        approveFlag,
        gpsLat,
        gpsLon,
        entry.gpsAccuracy ?? null,
        gpsCapturedAt,
        tripNo,
      ]
    );
  }

  if (autoApprove) return;

  if (activeIndices.length === 0) {
    await client.query(
      `DELETE FROM fuel_expenses
       WHERE trip_id = $1 AND source_type = 'TRIP' AND status = 'Pending'
         AND ops_status <> 'Approved' AND deleted = FALSE`,
      [tripId]
    );
  } else {
    await client.query(
      `DELETE FROM fuel_expenses
       WHERE trip_id = $1 AND source_type = 'TRIP' AND status = 'Pending'
         AND ops_status <> 'Approved' AND deleted = FALSE
         AND trip_fuel_entry_index <> ALL($2::int[])`,
      [tripId, activeIndices]
    );
  }
}
function mapDieselRow(r: Record<string, unknown>): DieselEntry {
  return {
    rowIndex: num(r.row_index),
    litres: r.litres == null ? null : num(r.litres),
    rate: r.rate == null ? null : num(r.rate),
    amount: r.amount == null ? null : num(r.amount),
    meter: r.meter == null ? null : num(r.meter),
    bunkName: r.bunk_name == null ? null : str(r.bunk_name),
    bunkGps: r.bunk_gps == null ? null : str(r.bunk_gps),
    gpsLat: numOrNull(r.gps_lat),
    gpsLon: numOrNull(r.gps_lon),
    gpsAccuracy: numOrNull(r.gps_accuracy),
    gpsCapturedAt: r.gps_captured_at == null ? null : new Date(String(r.gps_captured_at)).toISOString(),
    imageData: r.image_data == null ? null : str(r.image_data),
    imageName: r.image_name == null ? null : str(r.image_name),
    submitted: Boolean(r.submitted),
  };
}

/**
 * Fuel-only pull of existing Trip Step 5 diesel bills.
 * Does not change trip tables. Used because Step 5 persist and trip completion
 * live in the Trip module, which this task must not edit.
 */
export async function ingestCompletedTripDieselToFuel(
  client: Client,
  tripId?: number
): Promise<number> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('fuel-reconcile-all'))`);
  const trips = await client.query(
    `SELECT t.id, t.trip_no, t.trip_date, t.status, t.vehicle_id, t.vehicle_no,
            t.driver_id, t.driver_name, t.supervisor_id, t.supervisor_name
     FROM trips t
     WHERE COALESCE(t.deleted, FALSE) = FALSE
       AND t.status = 'Completed'
       AND ($1::int IS NULL OR t.id = $1)
       AND EXISTS (
         SELECT 1 FROM trip_diesel_entries d
         WHERE d.trip_id = t.id
           AND COALESCE(d.submitted, TRUE) = TRUE
           AND COALESCE(d.litres, 0) > 0
           AND COALESCE(d.rate, 0) > 0
       )
     ORDER BY t.id DESC
     LIMIT 200`,
    [tripId ?? null]
  );

  let touched = 0;
  for (const t of trips.rows) {
    const diesel = await client.query(
      `SELECT * FROM trip_diesel_entries
       WHERE trip_id = $1 AND COALESCE(submitted, TRUE) = TRUE
       ORDER BY row_index`,
      [t.id]
    );
    const entries = diesel.rows.map((r) => mapDieselRow(r as Record<string, unknown>));
    if (!entries.length) continue;
    await syncDieselToFuelExpenses(client, num(t.id), dateOnly(t.trip_date) ?? "", entries, {
      vehicleId: t.vehicle_id == null ? null : num(t.vehicle_id),
      vehicleNo: t.vehicle_no == null ? null : str(t.vehicle_no),
      driverId: t.driver_id == null ? null : num(t.driver_id),
      driverName: t.driver_name == null ? null : str(t.driver_name),
      supervisorId: t.supervisor_id == null ? null : num(t.supervisor_id),
      supervisorName: t.supervisor_name == null ? null : str(t.supervisor_name),
      createdBy: "fuel-ingest",
      tripStatus: str(t.status),
      tripNo: t.trip_no == null ? null : str(t.trip_no),
    });
    touched += 1;
  }
  return touched;
}

export async function loadDcPhoto(
  client: Client,
  tripId: number,
  dcPhotoKey: string | null
): Promise<{
  dcPhotoKey: string | null;
  dcPhotoMime: string | null;
  dcPhotoData: string | null;
  dcPhotoKey2: string | null;
  dcPhotoMime2: string | null;
  dcPhotoData2: string | null;
}> {
  const empty = {
    dcPhotoKey: dcPhotoKey ?? null,
    dcPhotoMime: null,
    dcPhotoData: null,
    dcPhotoKey2: null,
    dcPhotoMime2: null,
    dcPhotoData2: null,
  };
  const result = await client.query(
    `SELECT media_key, mime_type, data_base64 FROM trip_media
     WHERE trip_id = $1 AND media_type = 'image' ORDER BY media_key`,
    [tripId]
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
  };
}
