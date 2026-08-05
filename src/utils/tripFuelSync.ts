import type pg from "pg";
import { str } from "./coerce.js";
import type { DieselEntry } from "../types/models.js";

type Client = pg.PoolClient;

/**
 * Upsert fuel_expenses rows from trip diesel entries (Step 5 sync).
 * One bill per diesel row_index; idempotent on trip_id + bill pattern.
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
  }
) {
  for (const entry of entries) {
    const litres = Number(entry.litres ?? 0);
    const rate = Number(entry.rate ?? 0);
    if (litres <= 0 && rate <= 0) continue;

    const amount = Number((litres * rate).toFixed(2));
    const billNo = `TRIP-${tripId}-D${entry.rowIndex}`;

    const existing = await client.query(`SELECT id FROM fuel_expenses WHERE bill_no = $1`, [
      billNo,
    ]);

    if (existing.rowCount) {
      await client.query(
        `UPDATE fuel_expenses SET
           expense_date = $2,
           vehicle_id = COALESCE($3, vehicle_id),
           vehicle_no = COALESCE($4, vehicle_no),
           driver_id = COALESCE($5, driver_id),
           driver_name = COALESCE($6, driver_name),
           supervisor_id = COALESCE($7, supervisor_id),
           supervisor_name = COALESCE($8, supervisor_name),
           trip_id = $9,
           meter_reading = COALESCE($10, meter_reading),
           amount = $11,
           rate = $12,
           litres = $13,
           petrol_bunk = COALESCE($14, petrol_bunk),
           image_data = COALESCE($15, image_data),
           updated_at = NOW()
         WHERE bill_no = $1`,
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
          entry.meter ?? 0,
          amount,
          rate,
          litres,
          entry.bunkName ?? "",
          entry.imageData ?? null,
        ]
      );
      continue;
    }

    await client.query(
      `INSERT INTO fuel_expenses (
         bill_no, expense_date, vehicle_id, vehicle_no, driver_id, driver_name,
         supervisor_id, supervisor_name, trip_id, meter_reading, amount, rate,
         litres, petrol_bunk, remarks, status, image_data, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::approval_status,$17,$18)`,
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
        entry.meter ?? 0,
        amount,
        rate,
        litres,
        entry.bunkName ?? "",
        `Auto-synced from trip ${tripId} diesel row ${entry.rowIndex}`,
        "Pending",
        entry.imageData ?? null,
        context.createdBy ?? "trip-sync",
      ]
    );
  }

  // Remove fuel bills for diesel rows that were deleted
  const activeBills = entries
    .filter((e) => Number(e.litres ?? 0) > 0 || Number(e.rate ?? 0) > 0)
    .map((e) => `TRIP-${tripId}-D${e.rowIndex}`);

  if (activeBills.length === 0) {
    await client.query(
      `DELETE FROM fuel_expenses
       WHERE trip_id = $1 AND bill_no LIKE $2 AND status = 'Pending'`,
      [tripId, `TRIP-${tripId}-D%`]
    );
  } else {
    await client.query(
      `DELETE FROM fuel_expenses
       WHERE trip_id = $1 AND bill_no LIKE $2 AND status = 'Pending'
         AND bill_no <> ALL($3::text[])`,
      [tripId, `TRIP-${tripId}-D%`, activeBills]
    );
  }
}

export async function loadDcPhoto(
  client: Client,
  tripId: number,
  dcPhotoKey: string | null
): Promise<{ dcPhotoData: string | null; dcPhotoMime: string | null }> {
  if (!dcPhotoKey) return { dcPhotoData: null, dcPhotoMime: null };

  const result = await client.query(
    `SELECT data_base64, mime_type FROM trip_media
     WHERE trip_id = $1 AND media_key = $2`,
    [tripId, dcPhotoKey]
  );
  if (!result.rowCount) return { dcPhotoData: null, dcPhotoMime: null };

  return {
    dcPhotoData: result.rows[0].data_base64 ? str(result.rows[0].data_base64) : null,
    dcPhotoMime: result.rows[0].mime_type ? str(result.rows[0].mime_type) : null,
  };
}
