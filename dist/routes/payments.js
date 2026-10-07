/**
 * Accounts → Payments routes (/api/accounts/payments).
 * Thin routes — all business logic lives in paymentsService.
 */
import { Router } from "express";
import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import { authUser } from "../middleware/auth.js";
import { paymentsService } from "../services/paymentsService.js";
import { parseBody, paymentListQuerySchema, } from "../validation/payments.js";
import { parsePagination } from "../utils/pagination.js";
export const paymentsRouter = Router();
/** Reject malformed / non-positive integer ids with a clean 4xx. */
function parseId(raw) {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
        throw new AppError(400, `Invalid payment id: "${raw}"`);
    }
    return id;
}
paymentsRouter.get("/", asyncHandler(async (req, res) => {
    const query = parseBody(paymentListQuerySchema, req.query);
    const { params: pagination, enabled } = parsePagination({
        page: query.page,
        limit: query.limit,
    });
    res.json(await paymentsService.list({
        fromDate: query.fromDate,
        toDate: query.toDate,
        paymentType: query.paymentType,
        mode: query.mode,
        status: query.status,
        search: query.search,
        includeDeleted: query.includeDeleted === "true",
        pagination: enabled ? pagination : null,
    }));
}));
paymentsRouter.get("/:id", asyncHandler(async (req, res) => {
    res.json(await paymentsService.getById(parseId(req.params.id)));
}));
paymentsRouter.post("/", asyncHandler(async (req, res) => {
    // The recorded-by identity is an audit fact: always the session user,
    // never a client-supplied name.
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? { ...req.body, createdBy: authUser(res).displayName }
        : req.body;
    res.status(201).json(await paymentsService.create(body));
}));
paymentsRouter.put("/:id", asyncHandler(async (req, res) => {
    res.json(await paymentsService.update(parseId(req.params.id), req.body));
}));
paymentsRouter.delete("/:id", asyncHandler(async (req, res) => {
    res.json(await paymentsService.softDelete(parseId(req.params.id)));
}));
//# sourceMappingURL=payments.js.map