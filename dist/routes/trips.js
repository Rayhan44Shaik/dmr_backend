import { Router } from "express";
import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import { tripsService } from "../services/tripsService.js";
import { parsePagination } from "../utils/pagination.js";
import { validateStepSubmit } from "../validation/trips.js";
export const tripsRouter = Router();
function positiveId(value, label = "Trip id") {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw new AppError(400, `${label} must be a positive integer`);
    }
    return id;
}
function tripListFilters(req) {
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
tripsRouter.get("/", asyncHandler(async (req, res) => {
    const filters = tripListFilters(req);
    res.json(await tripsService.list(filters));
}));
tripsRouter.get("/vehicle/:vehicleId/last-meter", asyncHandler(async (req, res) => {
    res.json(await tripsService.lastClosingMeter(positiveId(req.params.vehicleId, "Vehicle id")));
}));
/**
 * Final Step 1 submission.
 * This is intentionally the only API call made while submitting Step 1.
 * It creates the trip once in PostgreSQL; it is NOT a draft/autosave endpoint.
 * Keep this route before GET /:id so "steps" is not interpreted as an id.
 */
tripsRouter.post("/steps/start", asyncHandler(async (req, res) => {
    validateStepSubmit("start", req.body);
    const payload = {
        ...req.body,
        status: "Draft",
        startStepSubmitted: true,
        startTime: req.body?.startTime || new Date().toISOString(),
    };
    const trip = await tripsService.save(null, payload);
    res.status(201).json(trip);
}));
/**
 * Available masters for Step 1 dropdowns (vehicles/drivers/supervisors/
 * helpers/loaders not occupied by an active trip). Optional ?tripId= excludes
 * the current trip's own resources during edit. Keep before GET /:id so
 * "available-resources" is not interpreted as an id.
 */
tripsRouter.get("/available-resources", asyncHandler(async (req, res) => {
    const tripId = req.query.tripId ? Number(req.query.tripId) : undefined;
    res.json(await tripsService.availableResources(tripId));
}));
tripsRouter.get("/:id", asyncHandler(async (req, res) => {
    const id = positiveId(req.params.id);
    res.json(await tripsService.getById(id));
}));
tripsRouter.post("/", asyncHandler(async (req, res) => {
    // Create draft or full save without id
    if (req.body?.startStepSubmitted || req.body?.vehicleId || req.body?.helpers) {
        validateStepSubmit("start", req.body);
        const trip = await tripsService.save(null, req.body);
        res.status(201).json(trip);
    }
    else {
        const trip = await tripsService.createDraft(req.body);
        res.status(201).json(trip);
    }
}));
tripsRouter.put("/:id", asyncHandler(async (req, res) => {
    const id = positiveId(req.params.id);
    const trip = await tripsService.save(id, req.body);
    res.json(trip);
}));
tripsRouter.post("/:id/steps/:step", asyncHandler(async (req, res) => {
    const step = req.params.step;
    if (!["start", "farm", "pickup", "deliveries", "expenses"].includes(step)) {
        throw new AppError(400, "Invalid step. Use start|farm|pickup|deliveries|expenses");
    }
    const id = positiveId(req.params.id);
    const trip = await tripsService.submitStep(id, step, req.body);
    res.json(trip);
}));
/**
 * Step 4 per-shop persistence — idempotent Save Progress / single-shop save.
 * Upserts the submitted shop deliveries by client_key (falling back to server
 * id), never wipes shops not in the payload, never submits Step 4 and never
 * captures the official Step 4 timestamp. Final submit stays on the steps
 * endpoint above.
 */
tripsRouter.put("/:id/deliveries", asyncHandler(async (req, res) => {
    const id = positiveId(req.params.id);
    const trip = await tripsService.saveDeliveries(id, req.body);
    res.json(trip);
}));
tripsRouter.delete("/:id", asyncHandler(async (req, res) => {
    const id = positiveId(req.params.id);
    const reason = typeof req.body?.reason === "string"
        ? req.body.reason
        : typeof req.query.reason === "string"
            ? req.query.reason
            : undefined;
    const result = await tripsService.softDelete(id, reason);
    res.json(result);
}));
tripsRouter.patch("/:id/status", asyncHandler(async (req, res) => {
    const id = positiveId(req.params.id);
    const trip = await tripsService.updateStatus(id, req.body);
    res.json(trip);
}));
//# sourceMappingURL=trips.js.map