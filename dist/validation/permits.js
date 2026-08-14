/** Fleet → Permits request validation. */
import { z } from "zod";
import { PERMIT_DOC_TYPES } from "../types/fleet.js";
import { parseBody } from "./operations.js";
const isDateString = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());
export const permitDocTypeSchema = z.enum(PERMIT_DOC_TYPES);
/** Upsert body for a single (vehicle, doc_type) permit record. expiryDate is
 * mandatory — the Permits matrix is driven by expiry dates. The document scan
 * itself is optional and travels as a multipart file, never in this body. */
export const permitBodySchema = z.object({
    vehicleId: z.number().int().optional(),
    documentNumber: z.string().max(100).optional(),
    validFrom: z
        .string()
        .refine(isDateString, "Valid-from date must be a valid YYYY-MM-DD value")
        .nullable()
        .optional(),
    expiryDate: z
        .string()
        .min(1, "Expiry date is required")
        .refine(isDateString, "Expiry date must be a valid YYYY-MM-DD value"),
    remarks: z.string().nullable().optional(),
    createdBy: z.string().optional(),
    /** Explicitly remove the attached scan without replacing it. */
    removeDocument: z.boolean().optional(),
});
/** Coerce a multer multipart body (all string values) into the permit schema
 * shape. Non-multipart JSON bodies pass through untouched by the route. */
export function coercePermitMultipartBody(raw) {
    const out = {};
    const first = (v) => {
        if (Array.isArray(v))
            return v[0] == null ? undefined : String(v[0]);
        return v == null ? undefined : String(v);
    };
    const toNullableNum = (v) => {
        if (v === undefined || v === "" || v === "null" || v === "undefined")
            return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    };
    if ("vehicleId" in raw)
        out.vehicleId = toNullableNum(first(raw.vehicleId));
    if ("documentNumber" in raw)
        out.documentNumber = first(raw.documentNumber);
    if ("validFrom" in raw)
        out.validFrom = first(raw.validFrom) ?? null;
    if ("expiryDate" in raw)
        out.expiryDate = first(raw.expiryDate);
    if ("remarks" in raw)
        out.remarks = first(raw.remarks) ?? null;
    if ("createdBy" in raw)
        out.createdBy = first(raw.createdBy);
    if ("removeDocument" in raw)
        out.removeDocument = first(raw.removeDocument) === "true";
    return out;
}
export { parseBody };
//# sourceMappingURL=permits.js.map