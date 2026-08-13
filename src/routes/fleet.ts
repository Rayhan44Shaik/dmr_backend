import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import { fleetMaintenanceService } from "../services/fleetMaintenanceService.js";
import {
  coerceMultipartBody,
  MAINTENANCE_DOCUMENT_MAX_BYTES,
  MAINTENANCE_DOCUMENT_MAX_FILES,
} from "../utils/fleetMultipart.js";
import { parsePagination } from "../utils/pagination.js";

export const fleetRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAINTENANCE_DOCUMENT_MAX_BYTES,
    files: MAINTENANCE_DOCUMENT_MAX_FILES,
  },
});

/** Apply multer for multipart requests; leave JSON bodies untouched. */
function maintenanceUpload(req: Request, res: Response, next: NextFunction) {
  upload.array("documents", MAINTENANCE_DOCUMENT_MAX_FILES)(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(new AppError(400, "File size cannot exceed 10 MB."));
        }
        if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
          return next(
            new AppError(400, `Maximum ${MAINTENANCE_DOCUMENT_MAX_FILES} documents are allowed.`)
          );
        }
        return next(new AppError(400, err.message));
      }
      return next(err);
    }
    next();
  });
}

/** Multipart bodies arrive as strings — coerce them; JSON bodies pass through. */
function bodyAndFiles(
  req: Request
): { body: Record<string, unknown>; files: Express.Multer.File[] | undefined } {
  const files = req.files as Express.Multer.File[] | undefined;
  const body = files ? coerceMultipartBody(req.body as Record<string, unknown>) : req.body;
  return { body, files };
}

// ── Fleet → Entry / History (Vehicle Maintenance) ────────────────
fleetRouter.get(
  "/maintenance",
  asyncHandler(async (req, res) => {
    const { params: pagination, enabled } = parsePagination(req.query);
    res.json(
      await fleetMaintenanceService.list({
        vehicleId: req.query.vehicleId ? Number(req.query.vehicleId) : undefined,
        driverId: req.query.driverId ? Number(req.query.driverId) : undefined,
        fromDate: typeof req.query.fromDate === "string" ? req.query.fromDate : undefined,
        toDate: typeof req.query.toDate === "string" ? req.query.toDate : undefined,
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        search: typeof req.query.search === "string" ? req.query.search : undefined,
        includeDeleted: req.query.includeDeleted === "true",
        pagination: enabled ? pagination : null,
      })
    );
  })
);

fleetRouter.get(
  "/maintenance/:id",
  asyncHandler(async (req, res) => {
    res.json(await fleetMaintenanceService.getById(Number(req.params.id)));
  })
);

// Create — supports multipart/form-data (documents) AND plain JSON.
fleetRouter.post(
  "/maintenance",
  maintenanceUpload,
  asyncHandler(async (req, res) => {
    const { body, files } = bodyAndFiles(req);
    res.status(201).json(await fleetMaintenanceService.create(body, files));
  })
);

// Update — supports multipart/form-data (new documents + removeDocumentIds) and JSON.
fleetRouter.put(
  "/maintenance/:id",
  maintenanceUpload,
  asyncHandler(async (req, res) => {
    const { body, files } = bodyAndFiles(req);
    res.json(await fleetMaintenanceService.update(Number(req.params.id), body, files));
  })
);

fleetRouter.post(
  "/maintenance/:id/approve",
  asyncHandler(async (req, res) => {
    res.json(await fleetMaintenanceService.approve(Number(req.params.id), req.body));
  })
);

fleetRouter.post(
  "/maintenance/:id/reject",
  asyncHandler(async (req, res) => {
    res.json(await fleetMaintenanceService.reject(Number(req.params.id), req.body));
  })
);

fleetRouter.delete(
  "/maintenance/:id",
  asyncHandler(async (req, res) => {
    res.json(
      await fleetMaintenanceService.softDelete(
        Number(req.params.id),
        typeof req.body?.reason === "string" ? req.body.reason : undefined
      )
    );
  })
);

// ── Maintenance bill / spare-part documents ──────────────────────
fleetRouter.get(
  "/maintenance/:id/documents",
  asyncHandler(async (req, res) => {
    res.json(await fleetMaintenanceService.listDocuments(Number(req.params.id)));
  })
);

fleetRouter.get(
  "/maintenance/:id/documents/:documentId",
  asyncHandler(async (req, res) => {
    const doc = await fleetMaintenanceService.getDocumentBinary(
      Number(req.params.id),
      Number(req.params.documentId)
    );
    res.setHeader("Content-Type", doc.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${doc.fileName.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(doc.buffer);
  })
);

fleetRouter.delete(
  "/maintenance/:id/documents/:documentId",
  asyncHandler(async (req, res) => {
    res.json(
      await fleetMaintenanceService.deleteDocument(
        Number(req.params.id),
        Number(req.params.documentId)
      )
    );
  })
);
