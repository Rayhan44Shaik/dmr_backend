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

/** Final Step 1 submission — must be registered before /:id. */
tripsRouter.post(
  "/steps/start",
  asyncHandler(async (req, res) => {
    res.status(201).json(await tripsService.createSubmittedStartStep(req.body));
  })
);

tripsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await tripsService.getById(Number(req.params.id)));
  })
);

tripsRouter.post(
  "/:id/steps/:step",
  asyncHandler(async (req, res) => {
    const step = req.params.step;
    if (!["start", "farm", "pickup", "deliveries", "expenses"].includes(step)) {
      throw new AppError(400, "Invalid step. Use start|farm|pickup|deliveries|expenses");
    }
    const mode = req.body?.mode === "save" ? "save" : "submit";
    if (step === "start" && mode === "submit") {
      throw new AppError(410, "New Step 1 submissions use POST /api/trips/steps/start");
    }
    res.json(
      await tripsService.saveWizardStep(
        Number(req.params.id),
        step as "start" | "farm" | "pickup" | "deliveries" | "expenses",
        req.body,
        mode
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
