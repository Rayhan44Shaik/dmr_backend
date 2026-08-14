/** Fleet → Permits request validation. */
import { z } from "zod";
import { parseBody } from "./operations.js";
export declare const permitDocTypeSchema: z.ZodEnum<["insurance", "fitness", "permit", "puc", "rc"]>;
/** Upsert body for a single (vehicle, doc_type) permit record. expiryDate is
 * mandatory — the Permits matrix is driven by expiry dates. The document scan
 * itself is optional and travels as a multipart file, never in this body. */
export declare const permitBodySchema: z.ZodObject<{
    vehicleId: z.ZodOptional<z.ZodNumber>;
    documentNumber: z.ZodOptional<z.ZodString>;
    validFrom: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    expiryDate: z.ZodEffects<z.ZodString, string, string>;
    remarks: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdBy: z.ZodOptional<z.ZodString>;
    /** Explicitly remove the attached scan without replacing it. */
    removeDocument: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    expiryDate: string;
    vehicleId?: number | undefined;
    remarks?: string | null | undefined;
    createdBy?: string | undefined;
    documentNumber?: string | undefined;
    validFrom?: string | null | undefined;
    removeDocument?: boolean | undefined;
}, {
    expiryDate: string;
    vehicleId?: number | undefined;
    remarks?: string | null | undefined;
    createdBy?: string | undefined;
    documentNumber?: string | undefined;
    validFrom?: string | null | undefined;
    removeDocument?: boolean | undefined;
}>;
/** Coerce a multer multipart body (all string values) into the permit schema
 * shape. Non-multipart JSON bodies pass through untouched by the route. */
export declare function coercePermitMultipartBody(raw: Record<string, unknown>): Record<string, unknown>;
export { parseBody };
