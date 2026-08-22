import { AppError } from "../middleware/errorHandler.js";
import { numOrNull, str } from "./coerce.js";
import type pg from "pg";

export const MAX_FUEL_LITRES = 20_000;
export const MAX_FUEL_RATE = 10_000;
export const MAX_FUEL_BILL_BYTES = 1_048_576;
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function assertFinitePositive(value: unknown, label: string, max: number): number {
  if (value === null || value === undefined || value === "") {
    throw new AppError(422, `${label} is required.`);
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || Number.isNaN(n)) {
    throw new AppError(422, `${label} must be a finite number.`);
  }
  if (n <= 0) {
    throw new AppError(422, `${label} must be greater than 0.`);
  }
  if (n > max) {
    throw new AppError(422, `${label} exceeds the allowed maximum (${max}).`);
  }
  return n;
}

export function assertCalendarDate(value: unknown): string {
  const s = str(value, "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new AppError(400, "Expense date must be a valid YYYY-MM-DD calendar date.");
  }
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new AppError(400, "Expense date is not a real calendar date.");
  }
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const max = todayUtc + 24 * 60 * 60 * 1000;
  if (dt.getTime() > max) {
    throw new AppError(422, "Expense date cannot be more than one day in the future.");
  }
  return s;
}

export function sanitizeFuelFileName(name: unknown): string | null {
  if (name == null || name === "") return null;
  const raw = str(name).replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = raw.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 180);
  return cleaned || "bill.png";
}

export function parseOptionalGps(body: {
  gpsLat?: unknown;
  gpsLon?: unknown;
  gpsAccuracy?: unknown;
}): { lat: number | null; lon: number | null; accuracy: number | null } {
  const lat = numOrNull(body.gpsLat);
  const lon = numOrNull(body.gpsLon);
  if (lat == null && lon == null) {
    return { lat: null, lon: null, accuracy: numOrNull(body.gpsAccuracy) };
  }
  if (lat == null || lon == null) {
    throw new AppError(422, "Both GPS latitude and longitude are required when location is provided.");
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

export function validateOptionalFuelImage(
  imageData: unknown,
  imageName?: unknown
): { data: string | null; mime: string | null; name: string | null } {
  if (imageData == null || imageData === "") {
    return { data: null, mime: null, name: sanitizeFuelFileName(imageName) };
  }
  if (typeof imageData !== "string") {
    throw new AppError(422, "Bill photo must be a JPEG or PNG data URL.");
  }
  const data = imageData.trim();
  if (/^(bill|key|true|yes|uploaded|pending)$/i.test(data)) {
    throw new AppError(422, "Bill photo must be an actual image upload.");
  }
  const match = data.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    throw new AppError(422, "Bill photo must be a JPEG or PNG data URL.");
  }
  const mime = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  if (mime !== "image/jpeg" && mime !== "image/png") {
    throw new AppError(422, "Bill photo must be a JPEG or PNG image.");
  }
  const b64 = match[2].replace(/\s/g, "");
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    throw new AppError(422, "Bill photo data is not valid base64.");
  }
  if (!buf.length) {
    throw new AppError(422, "Bill photo is empty.");
  }
  if (buf.length > MAX_FUEL_BILL_BYTES) {
    throw new AppError(422, "Bill photo exceeds the maximum allowed size.");
  }
  if (mime === "image/png") {
    if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) {
      throw new AppError(422, "Bill photo PNG signature is invalid.");
    }
  } else if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) {
    throw new AppError(422, "Bill photo JPEG signature is invalid.");
  }
  return { data, mime, name: sanitizeFuelFileName(imageName) ?? `bill.${mime === "image/png" ? "png" : "jpg"}` };
}

export async function computeFuelAmountSql(
  client: pg.PoolClient,
  litres: number,
  rate: number
): Promise<number> {
  const r = await client.query<{ amt: string }>(
    `SELECT ROUND($1::numeric * $2::numeric, 2)::text AS amt`,
    [litres, rate]
  );
  return Number(r.rows[0].amt);
}
