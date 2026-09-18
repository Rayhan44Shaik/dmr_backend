/**
 * Accounts → Farm Payments routes (/api/accounts/farm-payments).
 * Thin routes — business logic lives in farmPaymentsService.
 */
import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  farmPaymentsService,
  parseFarmPaymentUpsertBody,
} from "../services/farmPaymentsService.js";

export const farmPaymentsRouter = Router();

farmPaymentsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await farmPaymentsService.list());
  })
);

farmPaymentsRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const payments = parseFarmPaymentUpsertBody(req.body);
    res.json(await farmPaymentsService.upsertMany(payments));
  })
);
