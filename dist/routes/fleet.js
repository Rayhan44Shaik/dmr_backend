import { Router } from "express";
import multer from "multer";
import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import { analyticsService } from "../services/analyticsService.js";
import { parseAnalyticsQuery } from "../validation/analytics.js";
import { fleetMaintenanceService } from "../services/fleetMaintenanceService.js";
import { vehiclePermitService } from "../services/vehiclePermitService.js";
import { vehicleEmiService } from "../services/vehicleEmiService.js";
import { coercePermitMultipartBody } from "../validation/permits.js";
import { coerceMultipartBody, MAINTENANCE_DOCUMENT_MAX_BYTES, MAINTENANCE_DOCUMENT_MAX_FILES, } from "../utils/fleetMultipart.js";
import { parsePagination } from "../utils/pagination.js";
import { getLatestVehicleMeter, listLatestVehicleMeters, listVehicleMeterHistory, } from "../utils/vehicleMeterLedger.js";
export const fleetRouter = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAINTENANCE_DOCUMENT_MAX_BYTES,
        files: MAINTENANCE_DOCUMENT_MAX_FILES,
    },
});
/** Apply multer for multipart requests; leave JSON bodies untouched. */
function maintenanceUpload(req, res, next) {
    upload.array("documents", MAINTENANCE_DOCUMENT_MAX_FILES)(req, res, (err) => {
        if (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === "LIMIT_FILE_SIZE") {
                    return next(new AppError(400, "File size cannot exceed 10 MB."));
                }
                if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
                    return next(new AppError(400, `Maximum ${MAINTENANCE_DOCUMENT_MAX_FILES} documents are allowed.`));
                }
                return next(new AppError(400, err.message));
            }
            return next(err);
        }
        next();
    });
}
/** Multipart bodies arrive as strings — coerce them; JSON bodies pass through. */
function bodyAndFiles(req) {
    const files = req.files;
    const body = files ? coerceMultipartBody(req.body) : req.body;
    return { body, files };
}
// ── Universal vehicle meter — cross-module timeline / latest reading ──────
// Backs the Vehicle History meter timeline and the "Latest Meter: X KM" hint
// shown on Fuel Entry / Maintenance Entry vehicle selection. Read-only —
// derived from trips + fuel_expenses + fleet_maintenance, never written to.
// NOTE: registered before the /:vehicleId routes so "meter-summary" is never
// parsed as a vehicle id.
fleetRouter.get("/vehicles/meter-summary", asyncHandler(async (_req, res) => {
    res.json(await listLatestVehicleMeters());
}));
fleetRouter.get("/vehicles/:vehicleId/meter-history", asyncHandler(async (req, res) => {
    res.json(await listVehicleMeterHistory(Number(req.params.vehicleId)));
}));
fleetRouter.get("/vehicles/:vehicleId/latest-meter", asyncHandler(async (req, res) => {
    res.json(await getLatestVehicleMeter(null, Number(req.params.vehicleId)));
}));
// ── Fleet → Entry / History (Vehicle Maintenance) ────────────────
fleetRouter.get("/maintenance", asyncHandler(async (req, res) => {
    const { params: pagination, enabled } = parsePagination(req.query);
    res.json(await fleetMaintenanceService.list({
        vehicleId: req.query.vehicleId ? Number(req.query.vehicleId) : undefined,
        driverId: req.query.driverId ? Number(req.query.driverId) : undefined,
        fromDate: typeof req.query.fromDate === "string" ? req.query.fromDate : undefined,
        toDate: typeof req.query.toDate === "string" ? req.query.toDate : undefined,
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        search: typeof req.query.search === "string" ? req.query.search : undefined,
        includeDeleted: req.query.includeDeleted === "true",
        latestApproved: req.query.latestApproved === "true",
        pagination: enabled ? pagination : null,
    }));
}));
fleetRouter.get("/maintenance/:id", asyncHandler(async (req, res) => {
    res.json(await fleetMaintenanceService.getById(Number(req.params.id)));
}));
// Create — supports multipart/form-data (documents) AND plain JSON.
fleetRouter.post("/maintenance", maintenanceUpload, asyncHandler(async (req, res) => {
    const { body, files } = bodyAndFiles(req);
    res.status(201).json(await fleetMaintenanceService.create(body, files));
}));
// Update — supports multipart/form-data (new documents + removeDocumentIds) and JSON.
fleetRouter.put("/maintenance/:id", maintenanceUpload, asyncHandler(async (req, res) => {
    const { body, files } = bodyAndFiles(req);
    res.json(await fleetMaintenanceService.update(Number(req.params.id), body, files));
}));
fleetRouter.post("/maintenance/:id/approve", asyncHandler(async (req, res) => {
    res.json(await fleetMaintenanceService.approve(Number(req.params.id), req.body));
}));
fleetRouter.post("/maintenance/:id/reject", asyncHandler(async (req, res) => {
    res.json(await fleetMaintenanceService.reject(Number(req.params.id), req.body));
}));
fleetRouter.delete("/maintenance/:id", asyncHandler(async (req, res) => {
    res.json(await fleetMaintenanceService.softDelete(Number(req.params.id), typeof req.body?.reason === "string" ? req.body.reason : undefined));
}));
// ── Maintenance bill / spare-part documents ──────────────────────
fleetRouter.get("/maintenance/:id/documents", asyncHandler(async (req, res) => {
    res.json(await fleetMaintenanceService.listDocuments(Number(req.params.id)));
}));
fleetRouter.get("/maintenance/:id/documents/:documentId", asyncHandler(async (req, res) => {
    const doc = await fleetMaintenanceService.getDocumentBinary(Number(req.params.id), Number(req.params.documentId));
    res.setHeader("Content-Type", doc.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${doc.fileName.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(doc.buffer);
}));
fleetRouter.delete("/maintenance/:id/documents/:documentId", asyncHandler(async (req, res) => {
    res.json(await fleetMaintenanceService.deleteDocument(Number(req.params.id), Number(req.params.documentId)));
}));
// ── Fleet → Permits (Vehicle permit / document expiry) ─────────────
/** Optional single scan per permit record; JSON bodies are left untouched. */
function permitUpload(req, res, next) {
    upload.single("document")(req, res, (err) => {
        if (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === "LIMIT_FILE_SIZE") {
                    return next(new AppError(400, "File size cannot exceed 10 MB."));
                }
                return next(new AppError(400, err.message));
            }
            return next(err);
        }
        return next();
    });
}
/** Multipart permit bodies arrive as strings — coerce them; JSON passes through.
 * Multipart is detected by content type, not by file presence, so a plain
 * multipart upsert (dates only, no scan) is still coerced correctly. */
function permitBodyAndFile(req) {
    const file = req.file;
    const isMultipart = req.is("multipart/form-data");
    const body = isMultipart
        ? coercePermitMultipartBody(req.body)
        : req.body;
    return { body, file };
}
fleetRouter.get("/permits", asyncHandler(async (_req, res) => {
    res.json(await vehiclePermitService.list());
}));
fleetRouter.get("/permits/summary", asyncHandler(async (_req, res) => {
    res.json(await vehiclePermitService.summary());
}));
// Upsert the current record for (vehicle, doc_type). Multipart (optional scan)
// and plain JSON are both supported.
fleetRouter.put("/permits/:vehicleId/:docType", permitUpload, asyncHandler(async (req, res) => {
    const { body, file } = permitBodyAndFile(req);
    res.json(await vehiclePermitService.upsert(Number(req.params.vehicleId), req.params.docType, body, file));
}));
fleetRouter.delete("/permits/:vehicleId/:docType", asyncHandler(async (req, res) => {
    res.json(await vehiclePermitService.remove(Number(req.params.vehicleId), req.params.docType));
}));
fleetRouter.get("/permits/:vehicleId/:docType/document", asyncHandler(async (req, res) => {
    const doc = await vehiclePermitService.getDocumentBinary(Number(req.params.vehicleId), req.params.docType);
    res.setHeader("Content-Type", doc.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${doc.fileName.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(doc.buffer);
}));
// ── Fleet → EMI (Vehicle EMIs) ─────────────────────────────────────
// Backs the EMI page. EMI records are per-vehicle summaries joined against
// the Vehicle Master for the real registration number; the persisted schedule
// (vehicle_emi_installments) is the single source of truth for paid/pending/
// next/status. Payment advances the schedule transactionally.
fleetRouter.get("/emis", asyncHandler(async (req, res) => {
    res.json(await vehicleEmiService.list({
        vehicleId: req.query.vehicleId ? Number(req.query.vehicleId) : undefined,
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        search: typeof req.query.search === "string" ? req.query.search : undefined,
    }));
}));
// NOTE: must be registered before /emis/:id so "vehicle" is not parsed as an id.
fleetRouter.get("/emis/vehicle/:vehicleId", asyncHandler(async (req, res) => {
    res.json(await vehicleEmiService.getByVehicleId(Number(req.params.vehicleId)));
}));
// EMI Management overview — every ACTIVE vehicle from the Vehicle Master with
// its EMI status (purchase amount/date, total EMI, completed/pending, next EMI
// date) derived from the master + existing payment schedule. Read-only. Must be
// registered before /emis/:id so "overview" is not parsed as an EMI id.
fleetRouter.get("/emis/overview", asyncHandler(async (_req, res) => {
    res.json(await vehicleEmiService.overview());
}));
fleetRouter.get("/emis/:id", asyncHandler(async (req, res) => {
    res.json(await vehicleEmiService.getById(Number(req.params.id)));
}));
fleetRouter.get("/emis/:id/schedule", asyncHandler(async (req, res) => {
    res.json(await vehicleEmiService.listSchedule(Number(req.params.id)));
}));
fleetRouter.post("/emis", asyncHandler(async (req, res) => {
    res.status(201).json(await vehicleEmiService.create(req.body));
}));
fleetRouter.put("/emis/:id", asyncHandler(async (req, res) => {
    res.json(await vehicleEmiService.update(Number(req.params.id), req.body));
}));
fleetRouter.delete("/emis/:id", asyncHandler(async (req, res) => {
    res.json(await vehicleEmiService.remove(Number(req.params.id)));
}));
fleetRouter.post("/emis/:id/pay", asyncHandler(async (req, res) => {
    res.json(await vehicleEmiService.pay(Number(req.params.id), req.body));
}));
// ── Fleet → Vehicle Analytics ─────────────────────────────────────
// Read-only aggregation over the authoritative Fleet sources
// (trips / fuel_expenses / fleet_maintenance / vehicles). Accepts the same
// fromDate / toDate / vehicleId filter the Analytics page sends.
fleetRouter.get("/analytics", asyncHandler(async (req, res) => {
    res.json(await analyticsService.get(parseAnalyticsQuery(req.query)));
}));
//# sourceMappingURL=fleet.js.map