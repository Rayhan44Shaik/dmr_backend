import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { mastersService } from "../services/mastersService.js";

export const mastersRouter = Router();

mastersRouter.get(
  "/employees",
  asyncHandler(async (req, res) => {
    const department = typeof req.query.department === "string" ? req.query.department : undefined;
    res.json(await mastersService.listEmployees(department));
  })
);

mastersRouter.post(
  "/employees",
  asyncHandler(async (req, res) => {
    res.status(201).json(await mastersService.upsertEmployee(req.body));
  })
);

mastersRouter.put(
  "/employees/:id",
  asyncHandler(async (req, res) => {
    res.json(
      await mastersService.upsertEmployee({
        ...req.body,
        id: Number(req.params.id),
      })
    );
  })
);

mastersRouter.get(
  "/vehicles",
  asyncHandler(async (_req, res) => {
    res.json(await mastersService.listVehicles());
  })
);

mastersRouter.post(
  "/vehicles",
  asyncHandler(async (req, res) => {
    res.status(201).json(await mastersService.upsertVehicle(req.body));
  })
);

mastersRouter.put(
  "/vehicles/:id",
  asyncHandler(async (req, res) => {
    res.json(
      await mastersService.upsertVehicle({
        ...req.body,
        id: Number(req.params.id),
      })
    );
  })
);

mastersRouter.get(
  "/farms",
  asyncHandler(async (_req, res) => {
    res.json(await mastersService.listFarms());
  })
);

mastersRouter.post(
  "/farms",
  asyncHandler(async (req, res) => {
    res.status(201).json(await mastersService.upsertFarm(req.body));
  })
);

mastersRouter.put(
  "/farms/:id",
  asyncHandler(async (req, res) => {
    res.json(
      await mastersService.upsertFarm({
        ...req.body,
        id: Number(req.params.id),
      })
    );
  })
);

mastersRouter.get(
  "/shops",
  asyncHandler(async (_req, res) => {
    res.json(await mastersService.listShops());
  })
);

mastersRouter.post(
  "/shops",
  asyncHandler(async (req, res) => {
    res.status(201).json(await mastersService.upsertShop(req.body));
  })
);

mastersRouter.put(
  "/shops/:id",
  asyncHandler(async (req, res) => {
    res.json(
      await mastersService.upsertShop({
        ...req.body,
        id: Number(req.params.id),
      })
    );
  })
);

mastersRouter.get(
  "/banks",
  asyncHandler(async (_req, res) => {
    res.json(await mastersService.listBanks());
  })
);

mastersRouter.post(
  "/banks",
  asyncHandler(async (req, res) => {
    res.status(201).json(await mastersService.upsertBank(req.body));
  })
);

mastersRouter.put(
  "/banks/:id",
  asyncHandler(async (req, res) => {
    res.json(
      await mastersService.upsertBank({
        ...req.body,
        id: Number(req.params.id),
      })
    );
  })
);

mastersRouter.get(
  "/bird-types",
  asyncHandler(async (_req, res) => {
    res.json(await mastersService.listBirdTypes());
  })
);

mastersRouter.post(
  "/bird-types",
  asyncHandler(async (req, res) => {
    res.status(201).json(await mastersService.upsertBirdType(req.body));
  })
);

mastersRouter.put(
  "/bird-types/:id",
  asyncHandler(async (req, res) => {
    res.json(
      await mastersService.upsertBirdType({
        ...req.body,
        id: Number(req.params.id),
      })
    );
  })
);
