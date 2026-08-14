import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { dateOnly, num, numOrNull, str } from "../utils/coerce.js";
import { assertVehicleExists } from "../utils/fkValidation.js";
import { detectFileMimeType, MAINTENANCE_DOCUMENT_MAX_BYTES, sanitizeFileName, } from "../utils/fleetMultipart.js";
import { parseBody, permitBodySchema } from "../validation/permits.js";
/** Shared list selector — always joined against the Vehicle Master so the
 * vehicle number is resolved server-side, never synthesized. */
const PERMIT_SELECT = `
  SELECT pd.*, v.vehicle_number
  FROM vehicle_permit_documents pd
  JOIN vehicles v ON v.id = pd.vehicle_id
`;
function mapPermit(row) {
    return {
        id: num(row.id),
        vehicleId: num(row.vehicle_id),
        vehicleNo: str(row.vehicle_number),
        docType: str(row.doc_type),
        documentNumber: str(row.document_number),
        validFrom: row.valid_from == null ? null : dateOnly(row.valid_from),
        expiryDate: dateOnly(row.expiry_date) ?? "",
        remarks: row.remarks == null ? null : str(row.remarks),
        hasDocument: Boolean(row.file_name && row.file_data != null),
        fileName: row.file_name == null ? null : str(row.file_name),
        mimeType: row.mime_type == null ? null : str(row.mime_type),
        fileSize: row.file_size == null ? null : numOrNull(row.file_size),
        createdBy: str(row.created_by),
        createdAt: row.created_at == null ? null : str(row.created_at),
        updatedAt: row.updated_at == null ? null : str(row.updated_at),
    };
}
function validateDocType(value) {
    const t = str(value).trim().toLowerCase();
    if (t !== "insurance" &&
        t !== "fitness" &&
        t !== "permit" &&
        t !== "puc" &&
        t !== "rc") {
        throw new AppError(400, "Invalid document type. Allowed: insurance, fitness, permit, puc, rc");
    }
    return t;
}
/** Validate an optional single upload. Returns null when no file was sent. */
function validateOptionalFile(file) {
    if (!file || !file.buffer || file.buffer.length === 0)
        return null;
    if (file.buffer.length > MAINTENANCE_DOCUMENT_MAX_BYTES) {
        throw new AppError(400, `File size cannot exceed 10 MB. ("${file.originalname}")`);
    }
    const mimeType = detectFileMimeType(file.buffer);
    if (!mimeType) {
        throw new AppError(400, "Only PNG, JPG/JPEG, and PDF files are supported.");
    }
    return {
        originalName: sanitizeFileName(file.originalname),
        mimeType,
        size: file.buffer.length,
        buffer: file.buffer,
    };
}
/** Shared read of a single row (after insert/update) inside the caller's tx. */
async function fetchPermit(client, id) {
    const full = await client.query(`${PERMIT_SELECT} WHERE pd.id = $1`, [id]);
    return mapPermit(full.rows[0]);
}
export const vehiclePermitService = {
    /** All permit records across every vehicle (used by the Permits matrix). */
    async list() {
        const result = await query(`${PERMIT_SELECT} ORDER BY v.vehicle_number, pd.doc_type`);
        return result.rows.map(mapPermit);
    },
    /** Per-type totals + expiry buckets, grouped at the database level. */
    async summary() {
        const result = await query(`SELECT pd.doc_type,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE pd.expiry_date < CURRENT_DATE)::int AS expired,
              COUNT(*) FILTER (WHERE pd.expiry_date >= CURRENT_DATE
                               AND pd.expiry_date <= CURRENT_DATE + INTERVAL '30 days')::int AS expiring,
              COUNT(*) FILTER (WHERE pd.expiry_date > CURRENT_DATE + INTERVAL '30 days')::int AS safe
       FROM vehicle_permit_documents pd
       GROUP BY pd.doc_type`);
        const byType = {
            insurance: { total: 0, expired: 0, expiring: 0, safe: 0 },
            fitness: { total: 0, expired: 0, expiring: 0, safe: 0 },
            permit: { total: 0, expired: 0, expiring: 0, safe: 0 },
            puc: { total: 0, expired: 0, expiring: 0, safe: 0 },
            rc: { total: 0, expired: 0, expiring: 0, safe: 0 },
        };
        for (const row of result.rows) {
            const key = str(row.doc_type);
            byType[key] = {
                total: num(row.total),
                expired: num(row.expired),
                expiring: num(row.expiring),
                safe: num(row.safe),
            };
        }
        const total = Object.values(byType).reduce((sum, v) => sum + v.total, 0);
        return { total, byType };
    },
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
    async upsert(vehicleId, docTypeValue, body, file) {
        const docType = validateDocType(docTypeValue);
        const data = parseBody(permitBodySchema, body);
        const upload = validateOptionalFile(file ?? null);
        return withTransaction(async (client) => {
            await assertVehicleExists(vehicleId, client);
            const existing = await client.query(`SELECT id FROM vehicle_permit_documents
         WHERE vehicle_id = $1 AND doc_type = $2`, [vehicleId, docType]);
            let id;
            if (existing.rowCount) {
                id = num(existing.rows[0].id);
                const params = [id];
                const sets = [];
                const push = (column, value) => {
                    params.push(value);
                    sets.push(`${column} = $${params.length}`);
                };
                if (data.documentNumber != null)
                    push("document_number", str(data.documentNumber));
                if (data.validFrom !== undefined)
                    push("valid_from", data.validFrom);
                if (data.expiryDate)
                    push("expiry_date", data.expiryDate);
                if (data.remarks !== undefined)
                    push("remarks", data.remarks);
                if (upload) {
                    push("file_name", upload.originalName);
                    push("mime_type", upload.mimeType);
                    push("file_size", upload.size);
                    push("file_data", upload.buffer);
                }
                else if (data.removeDocument === true) {
                    push("file_name", null);
                    push("mime_type", null);
                    push("file_size", null);
                    push("file_data", null);
                }
                const result = await client.query(`UPDATE vehicle_permit_documents SET ${sets.join(", ")}
           WHERE id = $1
           RETURNING id`, params);
                if (!result.rowCount)
                    throw new AppError(404, "Permit document not found");
            }
            else {
                const result = await client.query(`INSERT INTO vehicle_permit_documents
             (vehicle_id, doc_type, document_number, valid_from, expiry_date,
              file_name, mime_type, file_size, file_data, remarks, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING id`, [
                    vehicleId,
                    docType,
                    str(data.documentNumber),
                    data.validFrom ?? null,
                    data.expiryDate,
                    upload?.originalName ?? null,
                    upload?.mimeType ?? null,
                    upload?.size ?? null,
                    upload?.buffer ?? null,
                    data.remarks ?? null,
                    str(data.createdBy ?? ""),
                ]);
                id = num(result.rows[0].id);
            }
            return fetchPermit(client, id);
        });
    },
    /** Hard-delete the current record for (vehicleId, docType). */
    async remove(vehicleId, docTypeValue) {
        const docType = validateDocType(docTypeValue);
        const result = await query(`DELETE FROM vehicle_permit_documents
       WHERE vehicle_id = $1 AND doc_type = $2
       RETURNING id`, [vehicleId, docType]);
        if (!result.rowCount) {
            throw new AppError(404, "Permit document not found");
        }
        return { id: num(result.rows[0].id), vehicleId, docType };
    },
    /** Fetch the attached scan binary (only when one exists). */
    async getDocumentBinary(vehicleId, docTypeValue) {
        const docType = validateDocType(docTypeValue);
        const result = await query(`SELECT file_name, mime_type, file_data
       FROM vehicle_permit_documents
       WHERE vehicle_id = $1 AND doc_type = $2`, [vehicleId, docType]);
        if (!result.rowCount)
            throw new AppError(404, "Permit document not found");
        const row = result.rows[0];
        if (row.file_data == null) {
            throw new AppError(404, "No scan is attached to this permit document");
        }
        return {
            buffer: row.file_data,
            mimeType: str(row.mime_type),
            fileName: str(row.file_name),
        };
    },
};
//# sourceMappingURL=vehiclePermitService.js.map