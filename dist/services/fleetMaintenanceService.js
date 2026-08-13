import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { dateOnly, num, numOrNull, str } from "../utils/coerce.js";
import { assertEmployeeExists, assertVehicleExists, } from "../utils/fkValidation.js";
import { detectFileMimeType, MAINTENANCE_DOCUMENT_MAX_BYTES, MAINTENANCE_DOCUMENT_MAX_FILES, sanitizeFileName, } from "../utils/fleetMultipart.js";
import { nextDocNo } from "../utils/operationsHelpers.js";
import { paginatedResult, } from "../utils/pagination.js";
import { rethrowIfAppError } from "../utils/pgErrors.js";
import { fleetMaintenanceApproveSchema, fleetMaintenanceBodySchema, fleetMaintenanceRejectSchema, fleetMaintenanceUpdateSchema, parseBody, } from "../validation/fleet.js";
function mapDocumentMeta(row) {
    return {
        id: num(row.id),
        maintenanceId: num(row.maintenance_id),
        fileName: str(row.file_name),
        mimeType: str(row.mime_type),
        fileSize: num(row.file_size),
        createdAt: row.created_at == null ? null : str(row.created_at),
    };
}
function mapDocuments(value) {
    if (!value)
        return [];
    if (Array.isArray(value))
        return value.map(mapDocumentMeta);
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed))
                return parsed.map(mapDocumentMeta);
        }
        catch {
            return [];
        }
    }
    return [];
}
function mapMaintenance(row) {
    const status = (str(row.status) || "Pending Approval");
    return {
        id: num(row.id),
        billNo: str(row.bill_no),
        date: dateOnly(row.maintenance_date) ?? "",
        vehicleId: numOrNull(row.vehicle_id),
        vehicleNo: row.vehicle_no == null ? null : str(row.vehicle_no),
        driverId: numOrNull(row.driver_id),
        driverName: row.driver_name == null ? null : str(row.driver_name),
        currentKM: num(row.current_km),
        nextServiceKM: numOrNull(row.next_service_km),
        maintenanceType: str(row.maintenance_type),
        serviceType: str(row.service_type),
        garage: str(row.garage),
        mechanic: str(row.mechanic),
        totalCost: num(row.total_cost),
        parts: Array.isArray(row.parts)
            ? row.parts
            : [],
        remarks: row.remarks == null ? null : str(row.remarks),
        status,
        paymentStatus: status === "Approved" ? "approved" : "pending",
        deleted: Boolean(row.deleted),
        deletedReason: row.deleted_reason == null ? null : str(row.deleted_reason),
        approvedBy: row.approved_by == null ? null : str(row.approved_by),
        approvedAt: row.approved_at == null ? null : str(row.approved_at),
        rejectedBy: row.rejected_by == null ? null : str(row.rejected_by),
        rejectedAt: row.rejected_at == null ? null : str(row.rejected_at),
        rejectedReason: row.rejected_reason == null ? null : str(row.rejected_reason),
        createdBy: str(row.created_by),
        createdAt: row.created_at == null ? null : str(row.created_at),
        updatedAt: row.updated_at == null ? null : str(row.updated_at),
        documents: mapDocuments(row.documents_json),
    };
}
const MAINT_SELECT = `
  SELECT fm.*, v.vehicle_number AS v_current_vehicle_number,
    COALESCE(
      (SELECT json_agg(
         json_build_object(
           'id', d.id,
           'maintenance_id', d.maintenance_id,
           'file_name', d.file_name,
           'mime_type', d.mime_type,
           'file_size', d.file_size,
           'created_at', d.created_at
         ) ORDER BY d.id)
       FROM fleet_maintenance_documents d
       WHERE d.maintenance_id = fm.id),
      '[]'::json
    ) AS documents_json
  FROM fleet_maintenance fm
  LEFT JOIN vehicles v ON v.id = fm.vehicle_id
`;
function buildWhere(filters) {
    const clauses = [];
    const params = [];
    if (!filters.includeDeleted) {
        clauses.push(`COALESCE(fm.deleted, FALSE) = FALSE`);
    }
    if (filters.vehicleId) {
        params.push(filters.vehicleId);
        clauses.push(`fm.vehicle_id = $${params.length}`);
    }
    if (filters.driverId) {
        params.push(filters.driverId);
        clauses.push(`fm.driver_id = $${params.length}`);
    }
    if (filters.fromDate) {
        params.push(filters.fromDate);
        clauses.push(`fm.maintenance_date >= $${params.length}`);
    }
    if (filters.toDate) {
        params.push(filters.toDate);
        clauses.push(`fm.maintenance_date <= $${params.length}`);
    }
    if (filters.status && filters.status !== "ALL") {
        params.push(filters.status);
        clauses.push(`fm.status = $${params.length}::ops_record_status`);
    }
    if (filters.search) {
        params.push(`%${filters.search}%`);
        const p = params.length;
        clauses.push(`(fm.bill_no ILIKE $${p} OR fm.vehicle_no ILIKE $${p}
        OR fm.driver_name ILIKE $${p} OR fm.service_type ILIKE $${p}
        OR fm.mechanic ILIKE $${p} OR fm.maintenance_type ILIKE $${p})`);
    }
    return {
        where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
        params,
    };
}
function normalizeMaintenanceType(value) {
    if (Array.isArray(value)) {
        return value.map((v) => str(v).trim()).filter(Boolean).join(", ");
    }
    return str(value).trim();
}
function normalizeParts(input) {
    return input
        .filter((p) => str(p.name ?? "").trim() !== "")
        .map((p) => {
        const quantity = num(p.quantity, 0);
        const rate = num(p.rate, 0);
        return {
            name: str(p.name).trim(),
            specification: str(p.specification),
            quantity,
            rate,
            amount: p.amount != null && Number.isFinite(Number(p.amount))
                ? num(p.amount)
                : Number((quantity * rate).toFixed(2)),
        };
    });
}
function computeTotalCost(parts) {
    return Number(parts.reduce((sum, p) => sum + num(p.amount), 0).toFixed(2));
}
/** Resolve vehicle number / driver name snapshots from the masters so the
 * history always carries the authoritative master values. */
async function resolveSnapshots(client, body) {
    let vehicleNo = body.vehicleNo ?? null;
    let driverName = body.driverName ?? null;
    if (body.vehicleId != null) {
        const v = await client.query(`SELECT vehicle_number FROM vehicles WHERE id = $1 LIMIT 1`, [body.vehicleId]);
        if (v.rowCount)
            vehicleNo = str(v.rows[0].vehicle_number);
    }
    if (body.driverId != null) {
        const e = await client.query(`SELECT employee_name FROM employees WHERE id = $1 LIMIT 1`, [body.driverId]);
        if (e.rowCount)
            driverName = str(e.rows[0].employee_name);
    }
    return { vehicleNo, driverName };
}
/** Validate uploaded files against the supported types / limits and return
 * normalized documents whose mime type was verified from file contents. */
function validateDocuments(files, options = {}) {
    const required = options.required ?? true;
    if (!files || files.length === 0) {
        if (required) {
            throw new AppError(400, "Maintenance bill / spare-part document is required.");
        }
        return [];
    }
    if (files.length > MAINTENANCE_DOCUMENT_MAX_FILES) {
        throw new AppError(400, `Maximum ${MAINTENANCE_DOCUMENT_MAX_FILES} documents are allowed.`);
    }
    return files.map((f) => {
        if (!f.buffer || f.buffer.length === 0) {
            throw new AppError(400, `File "${f.originalname}" is empty.`);
        }
        if (f.buffer.length > MAINTENANCE_DOCUMENT_MAX_BYTES) {
            throw new AppError(400, `File size cannot exceed 10 MB. ("${f.originalname}")`);
        }
        const mimeType = detectFileMimeType(f.buffer);
        if (!mimeType) {
            throw new AppError(400, "Only PNG, JPG/JPEG, and PDF files are supported.");
        }
        return {
            originalName: sanitizeFileName(f.originalname),
            mimeType,
            size: f.buffer.length,
            buffer: f.buffer,
        };
    });
}
/** Insert documents for a maintenance row inside the caller's transaction. */
async function insertDocuments(client, maintenanceId, documents) {
    for (const doc of documents) {
        // Deliberately checked per-file inside the transaction so a failure on any
        // later file rolls back the whole operation (including the maintenance row
        // and any earlier documents already inserted).
        if (doc.originalName.length > 255) {
            throw new AppError(400, `File name "${doc.originalName}" is too long.`);
        }
        await client.query(`INSERT INTO fleet_maintenance_documents
         (maintenance_id, file_name, mime_type, file_size, file_data)
       VALUES ($1, $2, $3, $4, $5)`, [maintenanceId, doc.originalName, doc.mimeType, doc.size, doc.buffer]);
    }
}
export const fleetMaintenanceService = {
    async list(filters = {}) {
        const { where, params } = buildWhere(filters);
        if (filters.pagination) {
            const countResult = await query(`SELECT COUNT(*)::text AS c FROM fleet_maintenance fm ${where}`, params);
            const total = Number(countResult.rows[0]?.c ?? 0);
            const pagedParams = [...params, filters.pagination.limit, filters.pagination.offset];
            const result = await query(`${MAINT_SELECT} ${where}
         ORDER BY fm.maintenance_date DESC, fm.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, pagedParams);
            return paginatedResult(result.rows.map(mapMaintenance), total, filters.pagination);
        }
        const result = await query(`${MAINT_SELECT} ${where}
       ORDER BY fm.maintenance_date DESC, fm.created_at DESC`, params);
        return result.rows.map(mapMaintenance);
    },
    async getById(id) {
        const result = await query(`${MAINT_SELECT} WHERE fm.id = $1 AND COALESCE(fm.deleted, FALSE) = FALSE`, [id]);
        if (!result.rowCount)
            throw new AppError(404, "Maintenance record not found");
        return mapMaintenance(result.rows[0]);
    },
    async create(body, documents) {
        const data = parseBody(fleetMaintenanceBodySchema, body);
        const docs = validateDocuments(documents);
        return withTransaction(async (client) => {
            try {
                await assertVehicleExists(data.vehicleId, client);
                await assertEmployeeExists(data.driverId, "Driver", client);
                const maintenanceType = normalizeMaintenanceType(data.maintenanceType);
                if (!maintenanceType) {
                    throw new AppError(400, "Maintenance type is required.");
                }
                const parts = normalizeParts(data.parts ?? []);
                const totalCost = computeTotalCost(parts);
                const { vehicleNo, driverName } = await resolveSnapshots(client, data);
                const billNo = data.billNo || (await nextDocNo(client, "MNT", "fleet_maintenance", "bill_no"));
                const result = await client.query(`INSERT INTO fleet_maintenance (
             bill_no, maintenance_date, vehicle_id, vehicle_no, driver_id, driver_name,
             current_km, next_service_km, maintenance_type, service_type, garage, mechanic,
             total_cost, parts, remarks, status, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
             'Pending Approval'::ops_record_status, $16)
           RETURNING id`, [
                    billNo,
                    data.date,
                    data.vehicleId,
                    vehicleNo,
                    data.driverId ?? null,
                    driverName,
                    num(data.currentKM),
                    data.nextServiceKM ?? null,
                    maintenanceType,
                    str(data.serviceType).trim(),
                    str(data.garage).trim(),
                    str(data.mechanic).trim(),
                    totalCost,
                    JSON.stringify(parts),
                    data.remarks ?? null,
                    data.createdBy ?? "",
                ]);
                const maintenanceId = num(result.rows[0].id);
                // Atomic: if any document insert fails the whole transaction rolls back
                // (maintenance row + any documents already inserted).
                await insertDocuments(client, maintenanceId, docs);
                const full = await client.query(`${MAINT_SELECT} WHERE fm.id = $1`, [maintenanceId]);
                return mapMaintenance(full.rows[0]);
            }
            catch (err) {
                rethrowIfAppError(err);
                throw err;
            }
        });
    },
    async update(id, body, documents) {
        const data = parseBody(fleetMaintenanceUpdateSchema, body);
        const docs = validateDocuments(documents, { required: false });
        const removeIds = data.removeDocumentIds ?? [];
        return withTransaction(async (client) => {
            try {
                const existing = await client.query(`SELECT id FROM fleet_maintenance WHERE id = $1 AND COALESCE(deleted, FALSE) = FALSE`, [id]);
                if (!existing.rowCount)
                    throw new AppError(404, "Maintenance record not found");
                await assertVehicleExists(data.vehicleId, client);
                await assertEmployeeExists(data.driverId, "Driver", client);
                // Remove explicitly requested documents (never silently).
                if (removeIds.length > 0) {
                    const docRows = await client.query(`SELECT COUNT(*)::int AS c FROM fleet_maintenance_documents
             WHERE maintenance_id = $1 AND id = ANY($2::int[])`, [id, removeIds]);
                    const found = Number(docRows.rows[0]?.c ?? 0);
                    if (found !== removeIds.length) {
                        throw new AppError(404, "One or more documents to remove were not found");
                    }
                    const remaining = Number((await client.query(`SELECT COUNT(*)::int AS c FROM fleet_maintenance_documents WHERE maintenance_id = $1`, [id])).rows[0]?.c ?? 0);
                    if (remaining - removeIds.length + docs.length < 1) {
                        throw new AppError(400, "At least one document must remain on a maintenance entry.");
                    }
                    await client.query(`DELETE FROM fleet_maintenance_documents WHERE maintenance_id = $1 AND id = ANY($2::int[])`, [id, removeIds]);
                }
                const parts = data.parts != null ? normalizeParts(data.parts) : null;
                const totalCost = parts != null ? computeTotalCost(parts) : null;
                const maintenanceType = data.maintenanceType != null ? normalizeMaintenanceType(data.maintenanceType) : null;
                const { vehicleNo, driverName } = await resolveSnapshots(client, data);
                const result = await client.query(`UPDATE fleet_maintenance SET
             maintenance_date = COALESCE($2, maintenance_date),
             vehicle_id = COALESCE($3, vehicle_id),
             vehicle_no = COALESCE($4, vehicle_no),
             driver_id = COALESCE($5, driver_id),
             driver_name = COALESCE($6, driver_name),
             current_km = COALESCE($7, current_km),
             next_service_km = COALESCE($8, next_service_km),
             maintenance_type = COALESCE($9, maintenance_type),
             service_type = COALESCE($10, service_type),
             garage = COALESCE($11, garage),
             mechanic = COALESCE($12, mechanic),
             total_cost = COALESCE($13, total_cost),
             parts = COALESCE($14, parts),
             remarks = COALESCE($15, remarks)
           WHERE id = $1 AND COALESCE(deleted, FALSE) = FALSE
           RETURNING id`, [
                    id,
                    data.date ?? null,
                    data.vehicleId ?? null,
                    vehicleNo,
                    data.driverId ?? null,
                    driverName,
                    data.currentKM ?? null,
                    data.nextServiceKM ?? null,
                    maintenanceType,
                    data.serviceType ?? null,
                    data.garage ?? null,
                    data.mechanic ?? null,
                    totalCost,
                    parts != null ? JSON.stringify(parts) : null,
                    data.remarks ?? null,
                ]);
                if (!result.rowCount)
                    throw new AppError(404, "Maintenance record not found");
                // New documents are appended — existing documents are never touched.
                await insertDocuments(client, id, docs);
                const full = await client.query(`${MAINT_SELECT} WHERE fm.id = $1`, [id]);
                return mapMaintenance(full.rows[0]);
            }
            catch (err) {
                rethrowIfAppError(err);
                throw err;
            }
        });
    },
    async approve(id, body) {
        const data = parseBody(fleetMaintenanceApproveSchema, body);
        return withTransaction(async (client) => {
            const existing = await client.query(`SELECT status FROM fleet_maintenance WHERE id = $1 AND COALESCE(deleted, FALSE) = FALSE`, [id]);
            if (!existing.rowCount)
                throw new AppError(404, "Maintenance record not found");
            const current = str(existing.rows[0].status);
            if (current !== "Pending Approval" && current !== "Draft") {
                throw new AppError(409, `Maintenance record is already ${current}`);
            }
            const result = await client.query(`UPDATE fleet_maintenance SET
           status = 'Approved'::ops_record_status,
           approved_by = $2,
           approved_at = NOW(),
           rejected_by = NULL,
           rejected_at = NULL,
           rejected_reason = NULL,
           updated_at = NOW()
         WHERE id = $1
         RETURNING *`, [id, data.approvedBy ?? "system"]);
            return mapMaintenance(result.rows[0]);
        });
    },
    async reject(id, body) {
        const data = parseBody(fleetMaintenanceRejectSchema, body);
        return withTransaction(async (client) => {
            const existing = await client.query(`SELECT status FROM fleet_maintenance WHERE id = $1 AND COALESCE(deleted, FALSE) = FALSE`, [id]);
            if (!existing.rowCount)
                throw new AppError(404, "Maintenance record not found");
            const current = str(existing.rows[0].status);
            if (current !== "Pending Approval" && current !== "Draft") {
                throw new AppError(409, `Maintenance record is already ${current}`);
            }
            const result = await client.query(`UPDATE fleet_maintenance SET
           status = 'Rejected'::ops_record_status,
           rejected_by = $2,
           rejected_at = NOW(),
           rejected_reason = $3,
           updated_at = NOW()
         WHERE id = $1
         RETURNING *`, [id, data.rejectedBy ?? "system", data.reason]);
            return mapMaintenance(result.rows[0]);
        });
    },
    async softDelete(id, reason) {
        return withTransaction(async (client) => {
            const result = await client.query(`UPDATE fleet_maintenance SET
           deleted = TRUE,
           deleted_reason = $2,
           status = 'Deleted'::ops_record_status,
           rejected_by = NULL,
           rejected_at = NULL,
           rejected_reason = NULL,
           updated_at = NOW()
         WHERE id = $1 AND COALESCE(deleted, FALSE) = FALSE
         RETURNING *`, [id, reason ?? null]);
            if (!result.rowCount)
                throw new AppError(404, "Maintenance record not found");
            return mapMaintenance(result.rows[0]);
        });
    },
    async listDocuments(maintenanceId) {
        const maint = await query(`SELECT id FROM fleet_maintenance WHERE id = $1`, [maintenanceId]);
        if (!maint.rowCount)
            throw new AppError(404, "Maintenance record not found");
        const result = await query(`SELECT id, maintenance_id, file_name, mime_type, file_size, created_at
       FROM fleet_maintenance_documents
       WHERE maintenance_id = $1
       ORDER BY id`, [maintenanceId]);
        return result.rows.map(mapDocumentMeta);
    },
    async getDocumentBinary(maintenanceId, documentId) {
        const result = await query(`SELECT file_name, mime_type, file_data
       FROM fleet_maintenance_documents
       WHERE id = $1 AND maintenance_id = $2`, [documentId, maintenanceId]);
        if (!result.rowCount)
            throw new AppError(404, "Document not found");
        const row = result.rows[0];
        return {
            buffer: row.file_data,
            mimeType: str(row.mime_type),
            fileName: str(row.file_name),
        };
    },
    async deleteDocument(maintenanceId, documentId) {
        return withTransaction(async (client) => {
            const maint = await client.query(`SELECT id FROM fleet_maintenance WHERE id = $1`, [maintenanceId]);
            if (!maint.rowCount)
                throw new AppError(404, "Maintenance record not found");
            const doc = await client.query(`SELECT id FROM fleet_maintenance_documents WHERE id = $1 AND maintenance_id = $2`, [documentId, maintenanceId]);
            if (!doc.rowCount)
                throw new AppError(404, "Document not found");
            // Never allow a maintenance entry to be left with zero documents.
            const count = await client.query(`SELECT COUNT(*)::int AS c FROM fleet_maintenance_documents WHERE maintenance_id = $1`, [maintenanceId]);
            if (Number(count.rows[0]?.c ?? 0) <= 1) {
                throw new AppError(400, "At least one document must remain on a maintenance entry.");
            }
            await client.query(`DELETE FROM fleet_maintenance_documents WHERE id = $1`, [documentId]);
            return { id: documentId, maintenanceId };
        });
    },
};
//# sourceMappingURL=fleetMaintenanceService.js.map