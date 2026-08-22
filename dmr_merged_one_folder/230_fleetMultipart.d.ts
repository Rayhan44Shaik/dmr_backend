/**
 * Fleet maintenance document upload helpers.
 *
 * File contents are stored in PostgreSQL (BYTEA). Only the declared MIME types
 * are accepted and the actual file signature is verified from the buffer — the
 * client-supplied MIME type is never trusted alone.
 */
export declare const MAINTENANCE_DOCUMENT_MAX_BYTES: number;
export declare const MAINTENANCE_DOCUMENT_MAX_FILES = 10;
export declare const MAINTENANCE_DOCUMENT_MIME_TYPES: readonly ["image/png", "image/jpeg", "application/pdf"];
export type MaintenanceDocumentMimeType = (typeof MAINTENANCE_DOCUMENT_MIME_TYPES)[number];
/** A normalized uploaded document (multer memory upload). */
export interface UploadedDocument {
    originalName: string;
    mimeType: MaintenanceDocumentMimeType;
    size: number;
    buffer: Buffer;
}
/** Detect the real content type from the first bytes of the buffer. */
export declare function detectFileMimeType(buffer: Buffer): MaintenanceDocumentMimeType | null;
/** Strip any path separators / control characters from an uploaded file name.
 * The DB column is VARCHAR(255); oversized names are rejected with a clear
 * error during the insert loop so a bad name can never silently truncate. */
export declare function sanitizeFileName(name: string): string;
/**
 * Coerce a multer multipart body (all string values) into the shape the
 * existing zod schemas expect. JSON-looking fields (maintenanceType, parts,
 * removeDocumentIds) are parsed; numeric fields are converted.
 */
export declare function coerceMultipartBody(raw: Record<string, unknown>): Record<string, unknown>;
