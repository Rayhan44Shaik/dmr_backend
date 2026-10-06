import { Router } from "express";
import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import { collectionEntryService } from "../services/collectionEntryService.js";
import { collectionsService } from "../services/collectionsService.js";
import { dashboardService } from "../services/dashboardService.js";
import { fuelExpensesService } from "../services/fuelExpensesService.js";
import { mortalityAnalysisService } from "../services/mortalityAnalysisService.js";
import { rateEntryService } from "../services/rateEntryService.js";
import { shopRatesService } from "../services/shopRatesService.js";
import { shopSalesService } from "../services/shopSalesService.js";
import { shopLedgerService } from "../services/shopLedgerService.js";
import { tripsService } from "../services/tripsService.js";
import { parsePagination } from "../utils/pagination.js";
import { operationsSensitiveBoundary, operationsTripsBoundary } from "../middleware/businessBoundary.js";

export const operationsRouter = Router();
operationsRouter.use(operationsTripsBoundary, operationsSensitiveBoundary);

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
    const fromDate =
      typeof req.query.fromDate === "string" ? req.query.fromDate : undefined;
    const toDate =
      typeof req.query.toDate === "string" ? req.query.toDate : undefined;
    res.json(await dashboardService.getSummary({ asOf, fromDate, toDate }));
  })
);

/** Completed-trip mortality / weight trends for dashboard + analysis page. */
operationsRouter.get(
  "/mortality-analysis",
  asyncHandler(async (req, res) => {
    const { params: pagination, enabled } = parsePagination(req.query);
    const sortBy = typeof req.query.sortBy === "string" ? req.query.sortBy : "tripDate";
    const sortDir = req.query.sortDir === "desc" ? "desc" : "asc";
    res.json(
      await mortalityAnalysisService.list({
        fromDate: typeof req.query.fromDate === "string" ? req.query.fromDate : undefined,
        toDate: typeof req.query.toDate === "string" ? req.query.toDate : undefined,
        farm: typeof req.query.farm === "string" ? req.query.farm : undefined,
        supervisor: typeof req.query.supervisor === "string" ? req.query.supervisor : undefined,
        search: typeof req.query.search === "string" ? req.query.search : undefined,
        sortBy,
        sortDir,
        pagination: enabled ? pagination : null,
      })
    );
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
// Work queue for finalizing shop-wise rates on Completed trips.
//
//   GET    /rate-entry                 → eligible trips (Completed, not deleted, not locked)
//   GET    /rate-entry/:tripId         → trip + shop-wise deliveries + market-rate reference
//   PUT    /rate-entry/:tripId         → save (draft) rates; does not lock
//   POST   /rate-entry/:tripId/lock    → save & lock — rates become immutable
//
// Eligibility is enforced server-side. Locked trips still appear in Trip List
// (read-only historical view) and Shop Sales (which uses the finalized rates).
operationsRouter.get(
  "/rate-entry",
  asyncHandler(async (req, res) => {
    const { params: pagination, enabled } = parsePagination(req.query);
    res.json(
      await rateEntryService.list({
        fromDate: typeof req.query.fromDate === "string" ? req.query.fromDate : undefined,
        toDate: typeof req.query.toDate === "string" ? req.query.toDate : undefined,
        vehicleId: req.query.vehicleId ? Number(req.query.vehicleId) : undefined,
        supervisorId: req.query.supervisorId
          ? Number(req.query.supervisorId)
          : undefined,
        driverId: req.query.driverId ? Number(req.query.driverId) : undefined,
        farmId: req.query.farmId ? Number(req.query.farmId) : undefined,
        search: typeof req.query.search === "string" ? req.query.search : undefined,
        pagination: enabled ? pagination : null,
      })
    );
  })
);

operationsRouter.get(
  "/rate-entry/:tripId",
  asyncHandler(async (req, res) => {
    res.json(await rateEntryService.getById(Number(req.params.tripId)));
  })
);

operationsRouter.put(
  "/rate-entry/:tripId",
  asyncHandler(async (req, res) => {
    res.json(await rateEntryService.save(Number(req.params.tripId), req.body));
  })
);

operationsRouter.post(
  "/rate-entry/:tripId/lock",
  asyncHandler(async (req, res) => {
    res.json(await rateEntryService.lock(Number(req.params.tripId), req.body));
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
        search: typeof req.query.search === "string" ? req.query.search : undefined,
        sortBy: typeof req.query.sortBy === "string" ? req.query.sortBy : undefined,
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

// ── Shop Ledger (complete financial history) ────────────────────────────────
// Authoritative read of shop_ledger (single source of truth). Supports the
// shop + custom date range + optional pagination. There is NO 10-row display
// limit here — the complete matching history is returned. Opening balance is
// computed by the backend as of the range start; running balances are correct
// across pages. See services/shopLedgerService.ts for the contract.
operationsRouter.get(
  "/shop-ledger",
  asyncHandler(async (req, res) => {
    res.json(
      await shopLedgerService.list({
        shopId: req.query.shopId ? Number(req.query.shopId) : undefined,
        fromDate: typeof req.query.fromDate === "string" ? req.query.fromDate : undefined,
        toDate: typeof req.query.toDate === "string" ? req.query.toDate : undefined,
        pagination: opsListPagination(req),
      })
    );
  })
);

// ── Collection Entry (real financial collections) ──────────────────────────
// Distinct from the legacy derived /collections view. Persists real collection
// records, generates permanent Col-YYYYMMDD-NNN numbers, snapshots Shop
// opening/closing balances and writes the Shop Ledger CREDIT at approval.
// The existing /collections endpoints above are preserved unmodified.
function collectionEntryFilters(req: { query: Record<string, unknown> }) {
  return {
    shopId: req.query.shopId ? Number(req.query.shopId) : undefined,
    fromDate: typeof req.query.fromDate === "string" ? req.query.fromDate : undefined,
    toDate: typeof req.query.toDate === "string" ? req.query.toDate : undefined,
    status: typeof req.query.status === "string" ? req.query.status : undefined,
    includeDeleted: req.query.includeDeleted === "true",
    pagination: opsListPagination(req),
  };
}

operationsRouter.get(
  "/collection-entry",
  asyncHandler(async (req, res) => {
    res.json(await collectionEntryService.list(collectionEntryFilters(req)));
  })
);

operationsRouter.get(
  "/shop-ledger/cumulative-quantities",
  asyncHandler(async (req, res) => {
    res.json(await shopLedgerService.cumulativeQuantities({
      fromDate: typeof req.query.fromDate === "string" ? req.query.fromDate : undefined,
      toDate: typeof req.query.toDate === "string" ? req.query.toDate : undefined,
    }));
  })
);

// Keep named collection routes above /collection-entry/:id. Otherwise Express
// treats values such as "recent" as an id and the database receives NaN.
operationsRouter.get(
  "/collection-entry/recent",
  asyncHandler(async (req, res) => {
    res.json(await collectionEntryService.recent({
      shopId: Number(req.query.shopId),
      limit: req.query.limit == null ? undefined : Number(req.query.limit),
      includeDeleted: req.query.includeDeleted === "true",
    }));
  })
);

operationsRouter.get(
  "/collection-entry/weekly-summary",
  asyncHandler(async (req, res) => {
    res.json(await collectionEntryService.weeklySummary(
      Number(req.query.shopId),
      typeof req.query.date === "string" ? req.query.date : undefined
    ));
  })
);

operationsRouter.get(
  "/collection-entry/weekly-summaries",
  asyncHandler(async (req, res) => {
    res.json(await collectionEntryService.weeklySummaries(
      typeof req.query.date === "string" ? req.query.date : undefined
    ));
  })
);

operationsRouter.get(
  "/mortality-analysis/:tripId/deliveries",
  asyncHandler(async (req, res) => {
    res.json(await mortalityAnalysisService.deliveries(Number(req.params.tripId)));
  })
);

operationsRouter.get(
  "/collection-entry/week-bounds",
  asyncHandler(async (req, res) => {
    res.json(await collectionEntryService.weekBounds(typeof req.query.date === "string" ? req.query.date : undefined));
  })
);

operationsRouter.get(
  "/collection-entry/pending-summary",
  asyncHandler(async (req, res) => {
    res.json(await collectionEntryService.pendingSummary(typeof req.query.date === "string" ? req.query.date : undefined));
  })
);

operationsRouter.get(
  "/collection-entry/report",
  asyncHandler(async (req, res) => {
    res.json(await collectionEntryService.report({
      fromDate: typeof req.query.fromDate === "string" ? req.query.fromDate : undefined,
      toDate: typeof req.query.toDate === "string" ? req.query.toDate : undefined,
      shopId: req.query.shopId ? Number(req.query.shopId) : undefined,
      collector: typeof req.query.collector === "string" ? req.query.collector : undefined,
      paymentMode: typeof req.query.paymentMode === "string" ? req.query.paymentMode : undefined,
    }));
  })
);

operationsRouter.get(
  "/collection-entry/:id",
  asyncHandler(async (req, res) => {
    res.json(await collectionEntryService.getById(Number(req.params.id)));
  })
);

operationsRouter.post(
  "/collection-entry",
  asyncHandler(async (req, res) => {
    res.status(201).json(await collectionEntryService.create(req.body));
  })
);

operationsRouter.put(
  "/collection-entry/:id",
  asyncHandler(async (req, res) => {
    res.json(await collectionEntryService.update(Number(req.params.id), req.body));
  })
);

operationsRouter.patch(
  "/collection-entry/:id/status",
  asyncHandler(async (req, res) => {
    res.json(await collectionEntryService.updateStatus(Number(req.params.id), req.body));
  })
);

operationsRouter.delete(
  "/collection-entry/:id",
  asyncHandler(async (req, res) => {
    res.json(
      await collectionEntryService.softDelete(Number(req.params.id), {
        reason: typeof req.body?.reason === "string" ? req.body.reason : undefined,
        deletedBy: typeof req.body?.deletedBy === "string" ? req.body.deletedBy : undefined,
      })
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
