import { Router } from "express";
import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import { tripsService } from "../services/tripsService.js";
import { parsePagination } from "../utils/pagination.js";

export const tripsRouter = Router();

function tripListFilters(req: {
  query: Record<string, unknown>;
}) {
  const { params: pagination, enabled } = parsePagination(req.query);
  return {
    fromDate: typeof req.query.fromDate === "string" ? req.query.fromDate : undefined,
    toDate: typeof req.query.toDate === "string" ? req.query.toDate : undefined,
    status: typeof req.query.status === "string" ? req.query.status : undefined,
    vehicleId: req.query.vehicleId ? Number(req.query.vehicleId) : undefined,
    supervisorId: req.query.supervisorId ? Number(req.query.supervisorId) : undefined,
    search: typeof req.query.search === "string" ? req.query.search : undefined,
    includeDeleted: req.query.includeDeleted === "true",
    full: req.query.full === "true",
    pagination: enabled ? pagination : null,
  };
}

tripsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await tripsService.list(tripListFilters(req)));
  })
);

tripsRouter.get(
  "/vehicle/:vehicleId/last-meter",
  asyncHandler(async (req, res) => {
    res.json(await tripsService.lastClosingMeter(Number(req.params.vehicleId)));
  })
);

/**
 * Final Step 1 submission.
 * This is intentionally the only API call made while submitting Step 1.
 * It creates the trip once in PostgreSQL; it is NOT a draft/autosave endpoint.
 * Keep this route before GET /:id so "steps" is not interpreted as an id.
 */
tripsRouter.post(
  "/steps/start",
  asyncHandler(async (req, res) => {
    const payload = {
      ...req.body,
      status: "Draft" as const,
      startStepSubmitted: true,
      startTime: req.body?.startTime || new Date().toISOString(),
    };

    res.status(201).json(await tripsService.save(null, payload));
  })
);

tripsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await tripsService.getById(Number(req.params.id)));
  })
);

tripsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    // Create draft or full save without id
    if (req.body?.startStepSubmitted || req.body?.vehicleId || req.body?.helpers) {
      res.status(201).json(await tripsService.save(null, req.body));
    } else {
      res.status(201).json(await tripsService.createDraft(req.body));
    }
  })
);

tripsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await tripsService.save(Number(req.params.id), req.body));
  })
);

tripsRouter.post(
  "/:id/steps/:step",
  asyncHandler(async (req, res) => {
    const step = req.params.step;
    if (!["start", "farm", "pickup", "deliveries", "expenses"].includes(step)) {
      throw new AppError(400, "Invalid step. Use start|farm|pickup|deliveries|expenses");
    }
    res.json(
      await tripsService.submitStep(
        Number(req.params.id),
        step as "start" | "farm" | "pickup" | "deliveries" | "expenses",
        req.body
      )
    );
  })
);

tripsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(
      await tripsService.softDelete(
        Number(req.params.id),
        typeof req.body?.reason === "string" ? req.body.reason : undefined
      )
    );
  })
);

tripsRouter.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    res.json(await tripsService.updateStatus(Number(req.params.id), req.body));
  })
);
