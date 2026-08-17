import type pg from "pg";
import { AppError } from "../middleware/errorHandler.js";
import type { DieselEntry } from "../types/models.js";
import { num, numOrNull, str } from "./coerce.js";
import { isPgError } from "./pgErrors.js";

type Client = pg.PoolClient;

const tripDieselChains = new Map<number, Promise<unknown>>();

/** In-process mutex so concurrent requests for the same trip cannot skip neighbor validation (PGlite FOR UPDATE is not a reliable barrier). PostgreSQL FOR UPDATE remains in lockTripForDiesel. */
export async function withSerializedTripDiesel<T>(tripId: number, fn: () => Promise<T>): Promise<T> {
  const previous = tripDieselChains.get(tripId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  tripDieselChains.set(
    tripId,
    previous.then(
      () => gate,
      () => gate
    )
  );
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}

async function lockTripForDiesel(client: Client, tripId: number) {
  await client.query(`SELECT pg_advisory_xact_lock($1)`, [tripId]);
  const locked = await client.query(`SELECT * FROM trips WHERE id = $1 FOR UPDATE`, [tripId]);
  if (!locked.rowCount) throw new AppError(404, `Trip ${tripId} not found`);
  return locked.rows[0] as Record<string, unknown>;
}

export const MAX_DIESEL_BILL_BYTES = 1_048_576; // 1 MiB decoded
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function roundMoney(n: number): number {
  return Number(n.toFixed(2));
}

export async function computeDieselAmountSql(
  client: Client,
  litres: number,
  rate: number
): Promise<number> {
  const r = await client.query<{ amt: string }>(
    `SELECT ROUND($1::numeric * $2::numeric, 2)::text AS amt`,
    [litres, rate]
  );
  return Number(r.rows[0].amt);
}

export function computeMileageKmL(
  openingMeter: number | null | undefined,
  closingMeter: number | null | undefined,
  litres: number
): number | null {
  const open = Number(openingMeter ?? 0);
  const close = Number(closingMeter ?? 0);
  const dist = close - open;
  if (!(dist > 0 && litres > 0 && Number.isFinite(dist) && Number.isFinite(litres))) {
    return null;
  }
  return Number((dist / litres).toFixed(2));
}

export function assertFuelBillImage(imageData: unknown, imageName?: unknown): string {
  if (typeof imageData !== "string") {
    throw new AppError(422, "An actual fuel bill / slip upload is required.");
  }
  const data = imageData.trim();
  if (/^(bill|key|true|yes|uploaded|pending)$/i.test(data)) {
    throw new AppError(422, "An actual fuel bill / slip upload is required.");
  }
  if (typeof imageName === "string" && imageName.trim() && data === imageName.trim()) {
    throw new AppError(422, "An actual fuel bill / slip upload is required.");
  }
  const match = data.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    throw new AppError(422, "Fuel bill must be a JPEG or PNG data URL.");
  }
  const mime = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  if (mime !== "image/jpeg" && mime !== "image/png") {
    throw new AppError(422, "Fuel bill must be a JPEG or PNG image.");
  }
  const b64 = match[2].replace(/\s/g, "");
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    throw new AppError(422, "Fuel bill image data is not valid base64.");
  }
  if (!buf.length) {
    throw new AppError(422, "Fuel bill image data is empty.");
  }
  if (buf.length > MAX_DIESEL_BILL_BYTES) {
    throw new AppError(422, "Fuel bill image exceeds the maximum allowed size.");
  }
  const roundTrip = buf.toString("base64").replace(/=+$/, "");
  const incoming = b64.replace(/=+$/, "");
  if (roundTrip.length < incoming.length * 0.9) {
    throw new AppError(422, "Fuel bill image data is not valid base64.");
  }
  if (mime === "image/png") {
    if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) {
      throw new AppError(422, "Fuel bill PNG signature is invalid.");
    }
  } else if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) {
    throw new AppError(422, "Fuel bill JPEG signature is invalid.");
  }
  return data;
}

export function validateGps(body: {
  gpsLat?: unknown;
  gpsLon?: unknown;
  gpsAccuracy?: unknown;
}): { lat: number; lon: number; accuracy: number | null } {
  const lat = numOrNull(body.gpsLat);
  const lon = numOrNull(body.gpsLon);
  if (lat == null || lon == null) {
    throw new AppError(422, "GPS capture is required for a diesel bill.");
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new AppError(422, "Invalid GPS coordinates.");
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new AppError(422, "Invalid GPS coordinates.");
  }
  if (lat === 0 && lon === 0) {
    throw new AppError(422, "GPS 0,0 is not a valid capture.");
  }
  const accuracy = numOrNull(body.gpsAccuracy);
  if (accuracy != null && (!Number.isFinite(accuracy) || accuracy < 0)) {
    throw new AppError(422, "GPS accuracy must be zero or greater.");
  }
  return { lat, lon, accuracy };
}

export function validatePositiveNumber(value: unknown, label: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new AppError(422, `${label} must be greater than 0.`);
  }
  return n;
}

export function validateExpenseAmount(value: unknown, label: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new AppError(422, `${label} is not a valid amount.`);
  }
  if (n < 0) {
    throw new AppError(422, `${label} cannot be negative.`);
  }
  return n;
}

export const EXPENSE_FIELDS = [
  "meals",
  "loading",
  "mealsTiffin",
  "vehicleMaintenance",
  "othersRC",
  "others1Amt",
  "others2Amt",
  "others3Amt",
  "others4Amt",
  "others5Amt",
] as const;

export function validateExpensePayload(body: Record<string, unknown>) {
  const labels: Record<(typeof EXPENSE_FIELDS)[number], string> = {
    meals: "Meals",
    loading: "Loading",
    mealsTiffin: "Meals / Tiffin",
    vehicleMaintenance: "Vehicle Maintenance",
    othersRC: "Tea",
    others1Amt: "Driver",
    others2Amt: "Supervisor",
    others3Amt: "Helper & Loader",
    others4Amt: "Others",
    others5Amt: "Others",
  };
  for (const field of EXPENSE_FIELDS) {
    if (body[field] !== undefined) validateExpenseAmount(body[field], labels[field]);
  }
}

export function stripProtectedStep5Fields(body: Record<string, unknown>) {
  delete body.vehicleId;
  delete body.vehicleNo;
  delete body.driverId;
  delete body.driverName;
  delete body.supervisorId;
  delete body.supervisorName;
  delete body.openingMeter;
  delete body.advanceAmount;
  delete body.advance;
  delete body.destMeter;
  delete body.startTime;
  delete body.submittedAt;
  delete body.submittedAtTimestamp;
  delete body.endTime;
  delete body.dieselEntries;
  delete body.syncFuel;
  for (const key of Object.keys(body)) {
    if (key.startsWith("diesel")) delete body[key];
  }
}

export function mapDieselRow(r: Record<string, unknown>): DieselEntry {
  const litres = numOrNull(r.litres);
  const rate = numOrNull(r.rate);
  const amountStored = numOrNull(r.amount);
  const amount =
    amountStored != null
      ? amountStored
      : litres != null && rate != null
        ? roundMoney(Number((Number(litres) * Number(rate)).toFixed(2)))
        : null;
  return {
    id: num(r.id),
    rowIndex: num(r.row_index),
    litres,
    rate,
    amount,
    meter: numOrNull(r.meter),
    bunkName: r.bunk_name == null ? null : str(r.bunk_name),
    bunkGps: r.bunk_gps == null ? null : str(r.bunk_gps),
    gpsLat: numOrNull(r.gps_lat),
    gpsLon: numOrNull(r.gps_lon),
    gpsAccuracy: numOrNull(r.gps_accuracy),
    gpsCapturedAt: r.gps_captured_at == null ? null : String(r.gps_captured_at),
    imageData: r.image_data == null ? null : str(r.image_data),
    imageName: r.image_name == null ? null : str(r.image_name),
    submitted: Boolean(r.submitted),
    submittedAt: r.submitted_at == null ? null : String(r.submitted_at),
    clientKey: r.client_key == null ? null : str(r.client_key),
  };
}

export function flattenDiesel(entries: DieselEntry[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const e of entries) {
    const i = e.rowIndex;
    out[`dieselId${i}`] = e.id ?? null;
    out[`dieselClientKey${i}`] = e.clientKey ?? null;
    out[`dieselLtr${i}`] = e.litres;
    out[`dieselRate${i}`] = e.rate;
    out[`dieselAmount${i}`] = e.amount;
    out[`dieselMeter${i}`] = e.meter;
    out[`dieselBunk${i}`] = e.bunkName;
    out[`dieselGpsLat${i}`] = e.gpsLat;
    out[`dieselGpsLon${i}`] = e.gpsLon;
    out[`dieselGpsAccuracy${i}`] = e.gpsAccuracy;
    out[`dieselGpsCapturedAt${i}`] = e.gpsCapturedAt;
    out[`dieselImage${i}`] = e.imageData;
    out[`dieselImageName${i}`] = e.imageName;
    out[`dieselSubmitted${i}`] = e.submitted;
    out[`dieselSubmittedAt${i}`] = e.submittedAt;
  }
  return out;
}

export async function loadDieselEntries(client: Client, tripId: number): Promise<DieselEntry[]> {
  const diesel = await client.query(
    `SELECT * FROM trip_diesel_entries
      WHERE trip_id = $1
      ORDER BY submitted_at ASC NULLS LAST, id ASC`,
    [tripId]
  );
  return diesel.rows.map((r) => mapDieselRow(r as Record<string, unknown>));
}

export async function replaceDiesel(
  client: Client,
  tripId: number,
  entries: DieselEntry[] = []
) {
  await client.query(`DELETE FROM trip_diesel_entries WHERE trip_id = $1`, [tripId]);
  for (const e of entries) {
    const litres = e.litres ?? null;
    const rate = e.rate ?? null;
    const submitted = e.submitted ?? Boolean(litres && rate && e.meter && e.bunkName);
    await client.query(
      `INSERT INTO trip_diesel_entries (
         trip_id, row_index, litres, rate, amount, meter, bunk_name, bunk_gps,
         gps_lat, gps_lon, gps_accuracy, gps_captured_at,
         image_data, image_name, submitted, submitted_at, client_key
       ) VALUES (
         $1,$2,$3,$4,
         CASE WHEN $3 IS NULL OR $4 IS NULL THEN NULL ELSE ROUND($3::numeric * $4::numeric, 2) END,
         $5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
         CASE WHEN $14 THEN NOW() ELSE NULL END, $15)`,
      [
        tripId,
        e.rowIndex,
        litres,
        rate,
        e.meter ?? null,
        e.bunkName ?? null,
        e.bunkGps ?? null,
        e.gpsLat ?? null,
        e.gpsLon ?? null,
        e.gpsAccuracy ?? null,
        e.gpsCapturedAt ?? null,
        e.imageData ?? null,
        e.imageName ?? null,
        submitted,
        e.clientKey ?? null,
      ]
    );
  }
}

async function parseDieselBody(client: Client, body: Record<string, unknown>) {
  const litres = validatePositiveNumber(body.litres ?? body.dieselLtr, "Diesel litres");
  const rate = validatePositiveNumber(body.rate ?? body.dieselRate, "Fuel rate");
  const meter = validatePositiveNumber(body.meter ?? body.dieselMeter, "Meter reading");
  const bunk = str(body.bunkName ?? body.fuelBunkAddress ?? body.dieselBunk ?? "").trim();
  if (!bunk) throw new AppError(422, "Fuel bunk address is required.");
  if (/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(bunk)) {
    throw new AppError(422, "Fuel bunk address cannot be GPS coordinates.");
  }
  const gps = validateGps({
    gpsLat: body.gpsLat ?? body.fuelGpsLatitude ?? body.dieselGpsLat,
    gpsLon: body.gpsLon ?? body.fuelGpsLongitude ?? body.dieselGpsLon,
    gpsAccuracy: body.gpsAccuracy ?? body.fuelGpsAccuracy ?? body.dieselGpsAccuracy,
  });
  const imageData = assertFuelBillImage(body.imageData ?? body.dieselImage, body.imageName ?? body.dieselImageName);
  const amount = await computeDieselAmountSql(client, litres, rate);
  const clientAmount = numOrNull(body.amount);
  if (clientAmount != null && roundMoney(clientAmount) !== amount) {
    throw new AppError(422, `Diesel amount must equal litres × rate (${amount.toFixed(2)}).`);
  }
  return {
    litres,
    rate,
    amount,
    meter,
    bunk,
    gps,
    gpsCapturedAt: body.gpsCapturedAt ?? body.fuelGpsCapturedAt ?? body.dieselGpsCapturedAt ?? null,
    imageData,
    imageName: (() => {
      const name = body.imageName ?? body.dieselImageName;
      return name ? str(name) : null;
    })(),
    clientKey: body.clientKey ? str(body.clientKey).slice(0, 120) : null,
  };
}

export async function assertDieselMeterProgress(
  client: Client,
  tripId: number,
  farmMeter: number | null,
  candidateMeter: number,
  excludeId?: number
) {
  if (farmMeter == null || farmMeter <= 0) {
    throw new AppError(422, "Step 2 farm meter is required before submitting diesel.");
  }
  const others = await client.query(
    `SELECT id, meter FROM trip_diesel_entries
      WHERE trip_id = $1 AND submitted = TRUE
      ORDER BY submitted_at ASC NULLS LAST, id ASC`,
    [tripId]
  );
  const list = others.rows.map((r) => ({ id: num(r.id), meter: num(r.meter) }));
  const editIdx = excludeId != null ? list.findIndex((r) => r.id === excludeId) : -1;

  let previous = farmMeter;
  let next: number | null = null;
  if (editIdx >= 0) {
    if (editIdx > 0) previous = list[editIdx - 1].meter;
    if (editIdx < list.length - 1) next = list[editIdx + 1].meter;
  } else if (list.length) {
    previous = list[list.length - 1].meter;
  }

  if (!(candidateMeter > previous)) {
    throw new AppError(
      422,
      `Diesel meter (${candidateMeter}) must be greater than the previous meter (${previous}).`
    );
  }
  if (next != null && !(candidateMeter < next)) {
    throw new AppError(
      422,
      `Diesel meter (${candidateMeter}) must be less than the next meter (${next}).`
    );
  }
}

export function assertSubmittedDieselSequence(farmMeter: number, diesel: DieselEntry[]) {
  const submitted = diesel
    .filter((d) => d.submitted)
    .sort((a, b) => {
      const ta = a.submittedAt ?? "";
      const tb = b.submittedAt ?? "";
      if (ta !== tb) return ta < tb ? -1 : 1;
      return Number(a.id ?? 0) - Number(b.id ?? 0);
    });
  let previous = farmMeter;
  for (const d of submitted) {
    const meter = Number(d.meter ?? 0);
    if (!(meter > previous)) {
      throw new AppError(422, "Submitted diesel meters must never move backward.");
    }
    previous = meter;
  }
}

export async function submitDieselEntry(
  client: Client,
  tripRow: Record<string, unknown>,
  body: Record<string, unknown>
): Promise<DieselEntry> {
  const tripId = num(tripRow.id);
  if (Boolean(tripRow.deleted)) {
    throw new AppError(422, "Cannot modify a deleted trip");
  }
  tripRow = await lockTripForDiesel(client, tripId);
  if (Boolean(tripRow.deleted)) {
    throw new AppError(422, "Cannot modify a deleted trip");
  }
  if (!Boolean(tripRow.farm_step_submitted)) {
    throw new AppError(422, "Complete Farm Loading before submitting diesel.");
  }

  const parsed = await parseDieselBody(client, body);

  if (parsed.clientKey) {
    const existing = await client.query(
      `SELECT * FROM trip_diesel_entries WHERE trip_id = $1 AND client_key = $2`,
      [tripId, parsed.clientKey]
    );
    if (existing.rowCount) {
      return mapDieselRow(existing.rows[0] as Record<string, unknown>);
    }
  }

  const farmMeter = numOrNull(tripRow.dest_meter);
  await assertDieselMeterProgress(client, tripId, farmMeter, parsed.meter);

  const countRes = await client.query(
    `SELECT COUNT(*)::int AS c FROM trip_diesel_entries WHERE trip_id = $1 AND submitted = TRUE`,
    [tripId]
  );
  if (num(countRes.rows[0].c) >= 6) {
    throw new AppError(422, "Maximum of 6 diesel entries allowed.");
  }

  const maxIdx = await client.query(
    `SELECT COALESCE(MAX(row_index), 0)::int AS m FROM trip_diesel_entries WHERE trip_id = $1`,
    [tripId]
  );
  const rowIndex = num(maxIdx.rows[0].m) + 1;

  try {
    const inserted = await client.query(
      `INSERT INTO trip_diesel_entries (
         trip_id, row_index, litres, rate, amount, meter, bunk_name, bunk_gps,
         gps_lat, gps_lon, gps_accuracy, gps_captured_at,
         image_data, image_name, submitted, submitted_at, client_key
       ) VALUES (
         $1,$2,$3,$4, ROUND($3::numeric * $4::numeric, 2), $5,$6,NULL,$7,$8,$9,$10,$11,$12,TRUE,NOW(),$13
       ) RETURNING *`,
      [
        tripId,
        rowIndex,
        parsed.litres,
        parsed.rate,
        parsed.meter,
        parsed.bunk,
        parsed.gps.lat,
        parsed.gps.lon,
        parsed.gps.accuracy,
        parsed.gpsCapturedAt,
        parsed.imageData,
        parsed.imageName,
        parsed.clientKey,
      ]
    );
    return mapDieselRow(inserted.rows[0] as Record<string, unknown>);
  } catch (err) {
    if (isPgError(err) && err.code === "23505" && parsed.clientKey) {
      const existing = await client.query(
        `SELECT * FROM trip_diesel_entries WHERE trip_id = $1 AND client_key = $2`,
        [tripId, parsed.clientKey]
      );
      if (existing.rowCount) {
        return mapDieselRow(existing.rows[0] as Record<string, unknown>);
      }
    }
    throw err;
  }
}

export async function updateDieselEntry(
  client: Client,
  tripRow: Record<string, unknown>,
  entryId: number,
  body: Record<string, unknown>
): Promise<DieselEntry> {
  const tripId = num(tripRow.id);
  tripRow = await lockTripForDiesel(client, tripId);
  const existing = await client.query(
    `SELECT * FROM trip_diesel_entries WHERE id = $1 AND trip_id = $2`,
    [entryId, tripId]
  );
  if (!existing.rowCount) throw new AppError(404, "Diesel bill not found");
  const current = mapDieselRow(existing.rows[0] as Record<string, unknown>);
  if (!current.submitted) {
    throw new AppError(422, "Only submitted diesel bills can be edited.");
  }

  const merged: Record<string, unknown> = {
    litres: body.litres ?? current.litres,
    rate: body.rate ?? current.rate,
    meter: body.meter ?? current.meter,
    bunkName: body.bunkName ?? body.fuelBunkAddress ?? current.bunkName,
    gpsLat: body.gpsLat ?? body.fuelGpsLatitude ?? current.gpsLat,
    gpsLon: body.gpsLon ?? body.fuelGpsLongitude ?? current.gpsLon,
    gpsAccuracy: body.gpsAccuracy ?? body.fuelGpsAccuracy ?? current.gpsAccuracy,
    gpsCapturedAt: body.gpsCapturedAt ?? body.fuelGpsCapturedAt ?? current.gpsCapturedAt,
    imageData: body.imageData ?? current.imageData,
    imageName: body.imageName ?? current.imageName,
    amount: body.amount,
    clientKey: current.clientKey,
  };
  const parsed = await parseDieselBody(client, merged);
  const farmMeter = numOrNull(tripRow.dest_meter);
  await assertDieselMeterProgress(client, tripId, farmMeter, parsed.meter, entryId);

  const updated = await client.query(
    `UPDATE trip_diesel_entries SET
       litres = $3,
       rate = $4,
       amount = ROUND($3::numeric * $4::numeric, 2),
       meter = $5,
       bunk_name = $6,
       gps_lat = $7,
       gps_lon = $8,
       gps_accuracy = $9,
       gps_captured_at = COALESCE($10, gps_captured_at),
       image_data = $11,
       image_name = COALESCE($12, image_name),
       submitted = TRUE,
       submitted_at = COALESCE(submitted_at, NOW())
     WHERE id = $1 AND trip_id = $2
     RETURNING *`,
    [
      entryId,
      tripId,
      parsed.litres,
      parsed.rate,
      parsed.meter,
      parsed.bunk,
      parsed.gps.lat,
      parsed.gps.lon,
      parsed.gps.accuracy,
      parsed.gpsCapturedAt,
      parsed.imageData,
      parsed.imageName,
    ]
  );
  return mapDieselRow(updated.rows[0] as Record<string, unknown>);
}

export async function deleteDieselEntry(client: Client, tripId: number, entryId: number) {
  await lockTripForDiesel(client, tripId);
  const existing = await client.query(
    `SELECT * FROM trip_diesel_entries WHERE id = $1 AND trip_id = $2`,
    [entryId, tripId]
  );
  if (!existing.rowCount) throw new AppError(404, "Diesel bill not found");
  await client.query(`DELETE FROM trip_diesel_entries WHERE id = $1 AND trip_id = $2`, [
    entryId,
    tripId,
  ]);
}

export function validateFinalStep5(
  tripRow: Record<string, unknown>,
  body: Record<string, unknown>,
  diesel: DieselEntry[]
) {
  if (!Boolean(tripRow.delivery_step_submitted)) {
    throw new AppError(422, "Complete Shop Deliveries before submitting Step 5.");
  }
  validateExpensePayload(body);
  const endMeter = numOrNull(body.endMeter ?? body.closingMeter);
  if (endMeter == null || !Number.isFinite(endMeter)) {
    throw new AppError(422, "End Meter Reading is required.");
  }
  const startMeter = numOrNull(tripRow.opening_meter) ?? 0;
  const farmMeter = numOrNull(tripRow.dest_meter) ?? 0;
  const submitted = diesel.filter((d) => d.submitted);
  assertSubmittedDieselSequence(farmMeter, submitted);
  const dieselMeters = submitted.map((d) => Number(d.meter ?? 0));
  const requiredMin = Math.max(startMeter, farmMeter, ...dieselMeters, 0);
  if (endMeter <= requiredMin) {
    throw new AppError(
      422,
      `End Meter Reading (${endMeter}) must be strictly greater than ${requiredMin}.`
    );
  }
  const tolls = body.destinationTolls ?? body.deliveryTolls;
  if (tolls === undefined || tolls === null || tolls === "") {
    throw new AppError(422, "Destination toll gates are required.");
  }
  const tollNum = Number(tolls);
  if (!Number.isFinite(tollNum) || tollNum < 0) {
    throw new AppError(422, "Destination toll gates must be 0 or greater.");
  }
}

export function extractDieselFromBody(body: Record<string, unknown>): DieselEntry[] {
  if (Array.isArray(body.dieselEntries)) {
    return body.dieselEntries as DieselEntry[];
  }
  const indices = new Set<number>();
  for (const key of Object.keys(body)) {
    const match = key.match(/^dieselLtr(\d+)$/);
    if (match) indices.add(Number(match[1]));
  }
  return [...indices]
    .sort((a, b) => a - b)
    .map((rowIndex) => ({
      rowIndex,
      litres: numOrNull(body[`dieselLtr${rowIndex}`]),
      rate: numOrNull(body[`dieselRate${rowIndex}`]),
      meter: numOrNull(body[`dieselMeter${rowIndex}`]),
      bunkName: body[`dieselBunk${rowIndex}`] ? str(body[`dieselBunk${rowIndex}`]) : null,
      bunkGps: body[`dieselBunkGps${rowIndex}`] ? str(body[`dieselBunkGps${rowIndex}`]) : null,
      gpsLat: numOrNull(body[`dieselGpsLat${rowIndex}`]),
      gpsLon: numOrNull(body[`dieselGpsLon${rowIndex}`]),
      gpsAccuracy: numOrNull(body[`dieselGpsAccuracy${rowIndex}`]),
      gpsCapturedAt: body[`dieselGpsCapturedAt${rowIndex}`]
        ? str(body[`dieselGpsCapturedAt${rowIndex}`])
        : null,
      imageData: body[`dieselImage${rowIndex}`] ? str(body[`dieselImage${rowIndex}`]) : null,
      imageName: body[`dieselImageName${rowIndex}`]
        ? str(body[`dieselImageName${rowIndex}`])
        : null,
      submitted: Boolean(body[`dieselSubmitted${rowIndex}`]),
      clientKey: body[`dieselClientKey${rowIndex}`]
        ? str(body[`dieselClientKey${rowIndex}`])
        : null,
    }));
}
