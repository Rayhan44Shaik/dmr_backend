import type { VehiclePermitDocument } from "../types/fleet.js";
/** The single document scan allowed on a permit record. */
interface RawUploadedFile {
    originalname: string;
    buffer: Buffer;
    size?: number;
}
export declare const vehiclePermitService: {
    /** All permit records across every vehicle (used by the Permits matrix). */
    list(): Promise<VehiclePermitDocument[]>;
    /** Per-type totals + expiry buckets, grouped at the database level. */
    summary(): Promise<{
        total: number;
        byType: Record<string, {
            total: number;
            expired: number;
            expiring: number;
            safe: number;
        }>;
    }>;
    /**
     * Create or update the current record for (vehicleId, docType).
     *
     * - The unique (vehicle_id, doc_type) constraint means re-saving the same
     *   type simply updates the existing row — the matrix stays one-per-type.
     * - A newly uploaded scan replaces the stored binary; sending removeDocument
     *   clears the scan without deleting the record. An absent scan leaves the
     *   existing binary untouched.
     * - Dates/numbers are mandatory; uploads are optional.
     */
    upsert(vehicleId: number, docTypeValue: string, body: unknown, file?: RawUploadedFile | null): Promise<VehiclePermitDocument>;
    /** Hard-delete the current record for (vehicleId, docType). */
    remove(vehicleId: number, docTypeValue: string): Promise<{
        id: number;
        vehicleId: number;
        docType: "insurance" | "fitness" | "permit" | "puc" | "rc";
    }>;
    /** Fetch the attached scan binary (only when one exists). */
    getDocumentBinary(vehicleId: number, docTypeValue: string): Promise<{
        buffer: Buffer;
        mimeType: string;
        fileName: string;
    }>;
};
export {};
