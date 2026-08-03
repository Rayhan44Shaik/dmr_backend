import { Router } from "express";
import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import { tripsService } from "../services/tripsService.js";

export const tripsRouter = Router();

tripsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(
      await tripsService.list({
        fromDate: typeof req.query.fromDate === "string" ? req.query.fromDate : undefined,
        toDate: typeof req.query.toDate === "string" ? req.query.toDate : undefined,
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        vehicleId: req.query.vehicleId ? Number(req.query.vehicleId) : undefined,
        includeDeleted: req.query.includeDeleted === "true",
      })
    );
  })
);

tripsRouter.get(
  "/vehicle/:vehicleId/last-meter",
  asyncHandler(async (req, res) => {
    res.json(await tripsService.lastClosingMeter(Number(req.params.vehicleId)));
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
