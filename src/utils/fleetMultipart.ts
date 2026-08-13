/**
 * Fleet maintenance document upload helpers.
 *
 * File contents are stored in PostgreSQL (BYTEA). Only the declared MIME types
 * are accepted and the actual file signature is verified from the buffer — the
 * client-supplied MIME type is never trusted alone.
 */

export const MAINTENANCE_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file
export const MAINTENANCE_DOCUMENT_MAX_FILES = 10; // max files per entry

export const MAINTENANCE_DOCUMENT_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "application/pdf",
] as const;

export type MaintenanceDocumentMimeType =
  (typeof MAINTENANCE_DOCUMENT_MIME_TYPES)[number];

/** A normalized uploaded document (multer memory upload). */
export interface UploadedDocument {
  originalName: string;
  mimeType: MaintenanceDocumentMimeType;
  size: number;
  buffer: Buffer;
}

/** Detect the real content type from the first bytes of the buffer. */
export function detectFileMimeType(buffer: Buffer): MaintenanceDocumentMimeType | null {
  if (!buffer || buffer.length < 8) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  // PDF: "%PDF-"
  if (buffer.length >= 5 && buffer.toString("latin1", 0, 5) === "%PDF-") {
    return "application/pdf";
  }
  return null;
}

/** Strip any path separators / control characters from an uploaded file name.
 * The DB column is VARCHAR(255); oversized names are rejected with a clear
 * error during the insert loop so a bad name can never silently truncate. */
export function sanitizeFileName(name: string): string {
  return String(name ?? "")
    .replace(/[\\/]/g, "-")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim() || "document";
}

/**
 * Coerce a multer multipart body (all string values) into the shape the
 * existing zod schemas expect. JSON-looking fields (maintenanceType, parts,
 * removeDocumentIds) are parsed; numeric fields are converted.
 */
export function coerceMultipartBody(
  raw: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  const first = (v: unknown): string | undefined => {
    if (Array.isArray(v)) return v[0] == null ? undefined : String(v[0]);
    return v == null ? undefined : String(v);
  };
  const toNum = (v: string | undefined): number | undefined => {
    if (v === undefined || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const toNullableNum = (v: string | undefined): number | null => {
    if (v === undefined || v === "" || v === "null" || v === "undefined") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const tryJson = (v: string | undefined, fallback: unknown): unknown => {
    if (v === undefined || v === "") return fallback;
    try {
      return JSON.parse(v);
    } catch {
      return fallback;
    }
  };

  if ("date" in raw) out.date = first(raw.date);
  if ("billNo" in raw) out.billNo = first(raw.billNo);
  if ("vehicleId" in raw) out.vehicleId = toNum(first(raw.vehicleId));
  if ("vehicleNo" in raw) out.vehicleNo = first(raw.vehicleNo) ?? null;
  if ("driverId" in raw) out.driverId = toNullableNum(first(raw.driverId));
  if ("driverName" in raw) out.driverName = first(raw.driverName) ?? null;
  if ("currentKM" in raw) out.currentKM = toNum(first(raw.currentKM));
  if ("nextServiceKM" in raw) out.nextServiceKM = toNullableNum(first(raw.nextServiceKM));
  if ("maintenanceType" in raw) {
    out.maintenanceType = tryJson(first(raw.maintenanceType), first(raw.maintenanceType));
  }
  if ("serviceType" in raw) out.serviceType = first(raw.serviceType);
  if ("garage" in raw) out.garage = first(raw.garage);
  if ("mechanic" in raw) out.mechanic = first(raw.mechanic);
  if ("parts" in raw) out.parts = tryJson(first(raw.parts), undefined);
  if ("totalCost" in raw) out.totalCost = toNum(first(raw.totalCost));
  if ("remarks" in raw) out.remarks = first(raw.remarks) ?? null;
  if ("createdBy" in raw) out.createdBy = first(raw.createdBy);
  if ("removeDocumentIds" in raw) {
    out.removeDocumentIds = tryJson(first(raw.removeDocumentIds), undefined);
  }

  return out;
}
