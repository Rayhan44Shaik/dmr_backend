import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { mastersService } from "../services/mastersService.js";
import { routesService } from "../services/routesService.js";

export const mastersRouter = Router();

mastersRouter.get(
  "/employees",
  asyncHandler(async (req, res) => {
    const department = typeof req.query.department === "string" ? req.query.department : undefined;
    res.json(await mastersService.listEmployees(department));
  })
);

mastersRouter.post(
  "/employees/bulk",
  asyncHandler(async (req, res) => {
    const created = await mastersService.bulkCreateEmployees(req.body);
    res.status(201).json(created);
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

mastersRouter.delete(
  "/employees/:id",
  asyncHandler(async (req, res) => {
    res.json(await mastersService.deleteEmployee(Number(req.params.id)));
  })
);

mastersRouter.patch(
  "/employees/:id/status",
  asyncHandler(async (req, res) => {
    res.json(
      await mastersService.updateEmployeeStatus(Number(req.params.id), req.body.status)
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
  "/vehicles/bulk",
  asyncHandler(async (req, res) => {
    const created = await mastersService.bulkCreateVehicles(req.body);
    res.status(201).json(created);
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

mastersRouter.delete(
  "/vehicles/:id",
  asyncHandler(async (req, res) => {
    res.json(await mastersService.deleteVehicle(Number(req.params.id)));
  })
);

mastersRouter.patch(
  "/vehicles/:id/status",
  asyncHandler(async (req, res) => {
    res.json(
      await mastersService.updateVehicleStatus(Number(req.params.id), req.body.status)
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
  "/farms/bulk",
  asyncHandler(async (req, res) => {
    const created = await mastersService.bulkCreateFarms(req.body);
    res.status(201).json(created);
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

mastersRouter.delete(
  "/farms/:id",
  asyncHandler(async (req, res) => {
    res.json(await mastersService.deleteFarm(Number(req.params.id)));
  })
);

mastersRouter.patch(
  "/farms/:id/status",
  asyncHandler(async (req, res) => {
    res.json(
      await mastersService.updateFarmStatus(Number(req.params.id), req.body.status)
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

mastersRouter.delete(
  "/shops/:id",
  asyncHandler(async (req, res) => {
    res.json(await mastersService.deleteShop(Number(req.params.id)));
  })
);

mastersRouter.patch(
  "/shops/:id/status",
  asyncHandler(async (req, res) => {
    res.json(
      await mastersService.updateShopStatus(Number(req.params.id), req.body.status)
    );
  })
);

mastersRouter.post(
  "/shops/bulk",
  asyncHandler(async (req, res) => {
    const created = await mastersService.bulkCreateShops(req.body);
    res.status(201).json(created);
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

mastersRouter.delete(
  "/banks/:id",
  asyncHandler(async (req, res) => {
    res.json(await mastersService.deleteBank(Number(req.params.id)));
  })
);

mastersRouter.patch(
  "/banks/:id/status",
  asyncHandler(async (req, res) => {
    res.json(
      await mastersService.updateBankStatus(Number(req.params.id), req.body.status)
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
  "/bird-types/bulk",
  asyncHandler(async (req, res) => {
    const created = await mastersService.bulkCreateBirdTypes(req.body);
    res.status(201).json(created);
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

mastersRouter.delete(
  "/bird-types/:id",
  asyncHandler(async (req, res) => {
    res.json(await mastersService.deleteBirdType(Number(req.params.id)));
  })
);

mastersRouter.patch(
  "/bird-types/:id/status",
  asyncHandler(async (req, res) => {
    res.json(
      await mastersService.updateBirdTypeStatus(Number(req.params.id), req.body.status)
    );
  })
);

// ---------------------------------------------------------------------------
// Routes master
// ---------------------------------------------------------------------------

mastersRouter.get("/routes", asyncHandler(async (_req, res) => {
  res.json(await routesService.listRoutes());
}));

mastersRouter.post("/routes", asyncHandler(async (req, res) => {
  res.status(201).json(await routesService.upsertRoute(req.body));
}));

mastersRouter.put("/routes/:id", asyncHandler(async (req, res) => {
  res.json(
    await routesService.upsertRoute({
      ...req.body,
      id: Number(req.params.id),
    })
  );
}));

mastersRouter.patch("/routes/:id/status", asyncHandler(async (req, res) => {
  res.json(
    await routesService.updateRouteStatus(Number(req.params.id), req.body.status)
  );
}));

mastersRouter.delete("/routes/:id", asyncHandler(async (req, res) => {
  res.json(await routesService.deleteRoute(Number(req.params.id)));
}));
