import { Router } from "express";
import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import { deliveryEmailService } from "../services/deliveryEmailService.js";
import { deliveryWhatsAppService } from "../services/deliveryWhatsAppService.js";
import { tripsService } from "../services/tripsService.js";
import { parsePagination } from "../utils/pagination.js";
import { validateStepSubmit } from "../validation/trips.js";
export const tripsRouter = Router();
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
    res.json(await tripsService.list(tripListFilters(req)));
}));
tripsRouter.get("/vehicle/:vehicleId/last-meter", asyncHandler(async (req, res) => {
    res.json(await tripsService.lastClosingMeter(Number(req.params.vehicleId)));
}));
/**
 * Final Step 1 submission.
 * This is intentionally the only API call made while submitting Step 1.
 * It creates the trip once in PostgreSQL; it is NOT a draft/autosave endpoint.
 * Keep this route before GET /:id so "steps" is not interpreted as an id.
 */
tripsRouter.post("/steps/start", asyncHandler(async (req, res) => {
    const parsed = validateStepSubmit("start", req.body);
    const payload = {
        ...req.body,
        ...parsed,
        status: "Draft",
        startStepSubmitted: true,
    };
    // Official Start Time is captured with PostgreSQL NOW() inside the save
    // transaction. Never accept or synthesize a client/browser clock.
    delete payload.startTime;
    res.status(201).json(await tripsService.save(null, payload));
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
tripsRouter.get("/:id/delivery-emails", asyncHandler(async (req, res) => {
    res.json(await deliveryEmailService.listForTrip(Number(req.params.id)));
}));
tripsRouter.get("/:id", asyncHandler(async (req, res) => {
    res.json(await tripsService.getById(Number(req.params.id)));
}));
tripsRouter.post("/", asyncHandler(async (req, res) => {
    // Create draft or full save without id
    if (req.body?.startStepSubmitted || req.body?.vehicleId || req.body?.helpers) {
        res.status(201).json(await tripsService.save(null, req.body));
    }
    else {
        res.status(201).json(await tripsService.createDraft(req.body));
    }
}));
tripsRouter.put("/:id", asyncHandler(async (req, res) => {
    res.json(await tripsService.save(Number(req.params.id), req.body));
}));
tripsRouter.post("/:id/steps/:step", asyncHandler(async (req, res) => {
    const step = req.params.step;
    if (!["start", "farm", "pickup", "deliveries", "expenses"].includes(step)) {
        throw new AppError(400, "Invalid step. Use start|farm|pickup|deliveries|expenses");
    }
    res.json(await tripsService.submitStep(Number(req.params.id), step, req.body));
}));
/**
 * Step 4 per-shop persistence — idempotent Save Progress / single-shop save.
 * Upserts the submitted shop deliveries by client_key (falling back to server
 * id), never wipes shops not in the payload, never submits Step 4 and never
 * captures the official Step 4 timestamp. Final submit stays on the steps
 * endpoint above.
 */
tripsRouter.put("/:id/deliveries", asyncHandler(async (req, res) => {
    res.json(await tripsService.saveDeliveries(Number(req.params.id), req.body));
}));
tripsRouter.post("/:id/deliveries/:deliveryId/email", asyncHandler(async (req, res) => {
    const result = await deliveryEmailService.sendDeliveryEmail(Number(req.params.id), Number(req.params.deliveryId), req.body ?? {});
    res.json(result);
}));
tripsRouter.get("/:id/delivery-whatsapp", asyncHandler(async (req, res) => {
    res.json(await deliveryWhatsAppService.listForTrip(Number(req.params.id)));
}));
tripsRouter.post("/:id/deliveries/:deliveryId/whatsapp", asyncHandler(async (req, res) => {
    const result = await deliveryWhatsAppService.sendDeliveryWhatsApp(Number(req.params.id), Number(req.params.deliveryId), req.body ?? {});
    res.json(result);
}));
tripsRouter.post("/:id/diesel", asyncHandler(async (req, res) => {
    res.status(201).json(await tripsService.submitDiesel(Number(req.params.id), req.body));
}));
tripsRouter.patch("/:id/diesel/:entryId", asyncHandler(async (req, res) => {
    res.json(await tripsService.updateDiesel(Number(req.params.id), Number(req.params.entryId), req.body));
}));
tripsRouter.delete("/:id/diesel/:entryId", asyncHandler(async (req, res) => {
    res.json(await tripsService.deleteDiesel(Number(req.params.id), Number(req.params.entryId)));
}));
tripsRouter.delete("/:id", asyncHandler(async (req, res) => {
    const reason = typeof req.body?.reason === "string"
        ? req.body.reason
        : typeof req.query.reason === "string"
            ? req.query.reason
            : undefined;
    res.json(await tripsService.softDelete(Number(req.params.id), reason));
}));
tripsRouter.patch("/:id/status", asyncHandler(async (req, res) => {
    res.json(await tripsService.updateStatus(Number(req.params.id), req.body));
}));
//# sourceMappingURL=trips.js.map