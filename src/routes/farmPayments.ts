/**
 * Accounts → Farm Payments routes (/api/accounts/farm-payments).
 * Thin routes — business logic lives in farmPaymentsService.
 */
import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { parsePagination } from "../utils/pagination.js";
import {
  farmPaymentsService,
  parseFarmPaymentUpsertBody,
} from "../services/farmPaymentsService.js";

export const farmPaymentsRouter = Router();

farmPaymentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { params: pagination, enabled } = parsePagination({
      page: req.query.page,
      limit: req.query.limit,
    });
    res.json(
      await farmPaymentsService.list({ pagination: enabled ? pagination : null })
    );
  })
);

farmPaymentsRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const payments = parseFarmPaymentUpsertBody(req.body);
    res.json(await farmPaymentsService.upsertMany(payments));
  })
);
