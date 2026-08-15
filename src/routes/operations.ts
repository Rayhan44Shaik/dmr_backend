import { Router } from "express";
import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import { collectionsService } from "../services/collectionsService.js";
import { dashboardService } from "../services/dashboardService.js";
import { fuelExpensesService } from "../services/fuelExpensesService.js";
import { rateEntryService } from "../services/rateEntryService.js";
import { shopRatesService } from "../services/shopRatesService.js";
import { shopSalesService } from "../services/shopSalesService.js";
import { tripsService } from "../services/tripsService.js";
import { parsePagination } from "../utils/pagination.js";

export const operationsRouter = Router();

function tripListFilters(req: { query: Record<string, unknown> }) {
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

function opsListPagination(req: { query: Record<string, unknown> }) {
  const { params, enabled } = parsePagination(req.query);
  return enabled ? params : null;
}

// ── Dashboard ────────────────────────────────────────────────────
operationsRouter.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const asOf = typeof req.query.asOf === "string" ? req.query.asOf : undefined;
    res.json(await dashboardService.getSummary(asOf));
  })
);

// ── Vehicle Trips / Trip List ────────────────────────────────────
operationsRouter.get(
  "/trips",
  asyncHandler(async (req, res) => {
    res.json(await tripsService.list(tripListFilters(req)));
  })
);

operationsRouter.get(
  "/trips/:id",
  asyncHandler(async (req, res) => {
    res.json(await tripsService.getById(Number(req.params.id)));
  })
);

operationsRouter.post(
  "/trips",
  asyncHandler(async (req, res) => {
    if (req.body?.startStepSubmitted || req.body?.vehicleId || req.body?.helpers) {
      res.status(201).json(await tripsService.save(null, req.body));
    } else {
      res.status(201).json(await tripsService.createDraft(req.body));
    }
  })
);

operationsRouter.put(
  "/trips/:id",
  asyncHandler(async (req, res) => {
    res.json(await tripsService.save(Number(req.params.id), req.body));
  })
);

operationsRouter.post(
  "/trips/:id/steps/:step",
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

operationsRouter.patch(
  "/trips/:id/status",
  asyncHandler(async (req, res) => {
    res.json(await tripsService.updateStatus(Number(req.params.id), req.body));
  })
);

operationsRouter.delete(
  "/trips/:id",
  asyncHandler(async (req, res) => {
    res.json(
      await tripsService.softDelete(
        Number(req.params.id),
        typeof req.body?.reason === "string" ? req.body.reason : undefined
      )
    );
  })
);

// ── Rate Entry ───────────────────────────────────────────────────
// Finalized (status = Completed, not deleted) trips only, each with its
// rate record if one has been entered.
operationsRouter.get(
  "/rate-entry",
  asyncHandler(async (req, res) => {
    res.json(
      await rateEntryService.list({
        search: typeof req.query.search === "string" ? req.query.search : undefined,
        rateStatus:
          req.query.rateStatus === "Entered" || req.query.rateStatus === "Pending"
            ? req.query.rateStatus
            : undefined,
        fromDate: typeof req.query.fromDate === "string" ? req.query.fromDate : undefined,
        toDate: typeof req.query.toDate === "string" ? req.query.toDate : undefined,
        vehicleNo: typeof req.query.vehicleNo === "string" ? req.query.vehicleNo : undefined,
        supervisorName:
          typeof req.query.supervisorName === "string" ? req.query.supervisorName : undefined,
        pagination: opsListPagination(req),
      })
    );
  })
);

// ── Trip List (read-only, completed/approved-only historical view) ──
// The eligibility rule (status='Completed' AND deleted=FALSE) is enforced in
// the service query, never in the client. No write/status/delete routes exist
// here on purpose: Trip List is a read-only historical record.
operationsRouter.get(
  "/trip-list",
  asyncHandler(async (req, res) => {
    const { params: pagination } = parsePagination(req.query);
    res.json(
      await tripsService.listCompleted({
        fromDate:
          typeof req.query.fromDate === "string" ? req.query.fromDate : undefined,
        toDate: typeof req.query.toDate === "string" ? req.query.toDate : undefined,
        vehicleId: req.query.vehicleId ? Number(req.query.vehicleId) : undefined,
        supervisorId: req.query.supervisorId
          ? Number(req.query.supervisorId)
          : undefined,
        driverId: req.query.driverId ? Number(req.query.driverId) : undefined,
        farmId: req.query.farmId ? Number(req.query.farmId) : undefined,
        search: typeof req.query.search === "string" ? req.query.search : undefined,
        pagination: pagination ?? { page: 1, limit: 50, offset: 0 },
      })
    );
  })
);

operationsRouter.get(
  "/trip-list/:id",
  asyncHandler(async (req, res) => {
    res.json(await tripsService.getCompletedById(Number(req.params.id)));
  })
);

operationsRouter.get(
  "/rate-entry/trip/:tripId",
  asyncHandler(async (req, res) => {
    const rate = await rateEntryService.getByTripId(Number(req.params.tripId));
    if (!rate) throw new AppError(404, "No rate entered for this trip yet");
    res.json(rate);
  })
);

operationsRouter.get(
  "/rate-entry/:id",
  asyncHandler(async (req, res) => {
    res.json(await rateEntryService.getById(Number(req.params.id)));
  })
);

operationsRouter.post(
  "/rate-entry",
  asyncHandler(async (req, res) => {
    res.status(201).json(await rateEntryService.create(req.body));
  })
);

operationsRouter.put(
  "/rate-entry/:id",
  asyncHandler(async (req, res) => {
    res.json(await rateEntryService.update(Number(req.params.id), req.body));
  })
);

// Explicit lock — the only way a trip's rate becomes immutable and eligible
// for Shop Sales. Separate from save/update so "rates saved" and "rates
// locked" are distinguishable states, per the Rate Entry -> Shop Sales
// business workflow.
operationsRouter.post(
  "/rate-entry/trip/:tripId/lock",
  asyncHandler(async (req, res) => {
    res.json(await rateEntryService.lock(Number(req.params.tripId), req.body));
  })
);

// ── Shop Rates ───────────────────────────────────────────────────
operationsRouter.get(
  "/shop-rates",
  asyncHandler(async (req, res) => {
    res.json(
      await shopRatesService.list({
        shopId: req.query.shopId ? Number(req.query.shopId) : undefined,
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        includeDeleted: req.query.includeDeleted === "true",
        pagination: opsListPagination(req),
      })
    );
  })
);

operationsRouter.get(
  "/shop-rates/:id",
  asyncHandler(async (req, res) => {
    res.json(await shopRatesService.getById(Number(req.params.id)));
  })
);

operationsRouter.post(
  "/shop-rates",
  asyncHandler(async (req, res) => {
    res.status(201).json(await shopRatesService.create(req.body));
  })
);

operationsRouter.put(
  "/shop-rates/:id",
  asyncHandler(async (req, res) => {
    res.json(await shopRatesService.update(Number(req.params.id), req.body));
  })
);

operationsRouter.patch(
  "/shop-rates/:id/status",
  asyncHandler(async (req, res) => {
    res.json(await shopRatesService.updateStatus(Number(req.params.id), req.body));
  })
);

operationsRouter.delete(
  "/shop-rates/:id",
  asyncHandler(async (req, res) => {
    res.json(
      await shopRatesService.softDelete(
        Number(req.params.id),
        typeof req.body?.reason === "string" ? req.body.reason : undefined
      )
    );
  })
);

// ── Shop Sales ───────────────────────────────────────────────────
operationsRouter.get(
  "/shop-sales",
  asyncHandler(async (req, res) => {
    res.json(
      await shopSalesService.list({
        shopId: req.query.shopId ? Number(req.query.shopId) : undefined,
        fromDate: typeof req.query.fromDate === "string" ? req.query.fromDate : undefined,
        toDate: typeof req.query.toDate === "string" ? req.query.toDate : undefined,
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        includeDeleted: req.query.includeDeleted === "true",
        pagination: opsListPagination(req),
      })
    );
  })
);

operationsRouter.get(
  "/shop-sales/:id",
  asyncHandler(async (req, res) => {
    res.json(await shopSalesService.getById(Number(req.params.id)));
  })
);

operationsRouter.post(
  "/shop-sales",
  asyncHandler(async (req, res) => {
    res.status(201).json(await shopSalesService.create(req.body));
  })
);

operationsRouter.put(
  "/shop-sales/:id",
  asyncHandler(async (req, res) => {
    res.json(await shopSalesService.update(Number(req.params.id), req.body));
  })
);

operationsRouter.patch(
  "/shop-sales/:id/status",
  asyncHandler(async (req, res) => {
    res.json(await shopSalesService.updateStatus(Number(req.params.id), req.body));
  })
);

operationsRouter.delete(
  "/shop-sales/:id",
  asyncHandler(async (req, res) => {
    res.json(
      await shopSalesService.softDelete(
        Number(req.params.id),
        typeof req.body?.reason === "string" ? req.body.reason : undefined
      )
    );
  })
);

// ── Collections ──────────────────────────────────────────────────
operationsRouter.get(
  "/collections/pending",
  asyncHandler(async (req, res) => {
    res.json(
      await collectionsService.pending(
        req.query.shopId ? Number(req.query.shopId) : undefined
      )
    );
  })
);

operationsRouter.get(
  "/collections/register",
  asyncHandler(async (req, res) => {
    res.json(
      await collectionsService.register({
        fromDate: typeof req.query.fromDate === "string" ? req.query.fromDate : undefined,
        toDate: typeof req.query.toDate === "string" ? req.query.toDate : undefined,
        shopId: req.query.shopId ? Number(req.query.shopId) : undefined,
      })
    );
  })
);

operationsRouter.get(
  "/collections/running-balance",
  asyncHandler(async (req, res) => {
    res.json(
      await collectionsService.runningBalance(
        req.query.shopId ? Number(req.query.shopId) : undefined
      )
    );
  })
);

operationsRouter.get(
  "/collections",
  asyncHandler(async (req, res) => {
    res.json(
      await collectionsService.list({
        shopId: req.query.shopId ? Number(req.query.shopId) : undefined,
        fromDate: typeof req.query.fromDate === "string" ? req.query.fromDate : undefined,
        toDate: typeof req.query.toDate === "string" ? req.query.toDate : undefined,
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        includeDeleted: req.query.includeDeleted === "true",
        pagination: opsListPagination(req),
      })
    );
  })
);

operationsRouter.get(
  "/collections/:id",
  asyncHandler(async (req, res) => {
    res.json(await collectionsService.getById(Number(req.params.id)));
  })
);

operationsRouter.post(
  "/collections",
  asyncHandler(async (req, res) => {
    res.status(201).json(await collectionsService.create(req.body));
  })
);

operationsRouter.put(
  "/collections/:id",
  asyncHandler(async (req, res) => {
    res.json(await collectionsService.update(Number(req.params.id), req.body));
  })
);

operationsRouter.patch(
  "/collections/:id/status",
  asyncHandler(async (req, res) => {
    res.json(await collectionsService.updateStatus(Number(req.params.id), req.body));
  })
);

operationsRouter.delete(
  "/collections/:id",
  asyncHandler(async (req, res) => {
    res.json(
      await collectionsService.softDelete(
        Number(req.params.id),
        typeof req.body?.reason === "string" ? req.body.reason : undefined
      )
    );
  })
);

// ── Fuel Expenses ────────────────────────────────────────────────
operationsRouter.get(
  "/fuel-expenses",
  asyncHandler(async (req, res) => {
    res.json(
      await fuelExpensesService.list({
        vehicleId: req.query.vehicleId ? Number(req.query.vehicleId) : undefined,
        driverId: req.query.driverId ? Number(req.query.driverId) : undefined,
        fromDate: typeof req.query.fromDate === "string" ? req.query.fromDate : undefined,
        toDate: typeof req.query.toDate === "string" ? req.query.toDate : undefined,
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        sourceType: typeof req.query.sourceType === "string" ? req.query.sourceType : undefined,
        search: typeof req.query.search === "string" ? req.query.search : undefined,
        includeDeleted: req.query.includeDeleted === "true",
        pagination: opsListPagination(req),
      })
    );
  })
);

operationsRouter.get(
  "/fuel-expenses/:id",
  asyncHandler(async (req, res) => {
    res.json(await fuelExpensesService.getById(req.params.id));
  })
);

operationsRouter.post(
  "/fuel-expenses",
  asyncHandler(async (req, res) => {
    res.status(201).json(await fuelExpensesService.create(req.body));
  })
);

operationsRouter.put(
  "/fuel-expenses/:id",
  asyncHandler(async (req, res) => {
    res.json(await fuelExpensesService.update(req.params.id, req.body));
  })
);

operationsRouter.post(
  "/fuel-expenses/:id/approve",
  asyncHandler(async (req, res) => {
    res.json(await fuelExpensesService.approve(req.params.id, req.body));
  })
);

operationsRouter.post(
  "/fuel-expenses/:id/reject",
  asyncHandler(async (req, res) => {
    res.json(await fuelExpensesService.reject(req.params.id, req.body));
  })
);

operationsRouter.delete(
  "/fuel-expenses/:id",
  asyncHandler(async (req, res) => {
    res.json(
      await fuelExpensesService.softDelete(
        req.params.id,
        typeof req.body?.reason === "string" ? req.body.reason : undefined
      )
    );
  })
);
