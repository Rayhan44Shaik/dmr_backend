import { mastersBoundary, mastersErrors } from "../middleware/mastersBoundary.js";
import { listMaster, masterEntities } from "../services/masterListService.js";
import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { mastersBulkService } from "../services/mastersBulkService.js";
import { mastersService } from "../services/mastersService.js";
import { marketRatesService } from "../services/marketRatesService.js";
import { routesService } from "../services/routesService.js";
import { bankSchema, marketRateBatchSchema, locationSchema, resolveMasterLocation, birdTypeSchema, employeeSchema, employeeStatusSchema, farmSchema, marketRateQuerySchema, masterIdSchema, masterStatusSchema, parseMaster, routeSchema, shopSchema, vehicleSchema, } from "../validation/masters.js";
export const mastersRouter = Router();
mastersRouter.use(mastersBoundary);
// Register authoritative collection handlers before legacy route declarations.
for (const entity of masterEntities) {
    mastersRouter.get(`/${entity}`, asyncHandler(async (req, res) => {
        res.json(await listMaster(entity, req.query));
    }));
}
mastersRouter.post("/employees/bulk", asyncHandler(async (req, res) => {
    res.status(201).json(await mastersBulkService.importEmployees(req.body));
}));
mastersRouter.post("/employees", asyncHandler(async (req, res) => {
    res.status(201).json(await mastersService.upsertEmployee(parseMaster(employeeSchema, req.body)));
}));
mastersRouter.get("/employees/:id", asyncHandler(async (req, res) => {
    const { id } = parseMaster(masterIdSchema, req.params);
    res.json(await mastersService.getEmployee(id));
}));
mastersRouter.put("/employees/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.upsertEmployee({
        ...parseMaster(employeeSchema, req.body),
        id: parseMaster(masterIdSchema, req.params).id,
    }));
}));
mastersRouter.delete("/employees/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.deleteEmployee(parseMaster(masterIdSchema, req.params).id));
}));
mastersRouter.patch("/employees/:id/status", asyncHandler(async (req, res) => {
    res.json(await mastersService.updateEmployeeStatus(parseMaster(masterIdSchema, req.params).id, parseMaster(employeeStatusSchema, req.body).status));
}));
mastersRouter.post("/vehicles/bulk", asyncHandler(async (req, res) => {
    res.status(201).json(await mastersBulkService.importVehicles(req.body));
}));
mastersRouter.post("/vehicles", asyncHandler(async (req, res) => {
    res.status(201).json(await mastersService.upsertVehicle(parseMaster(vehicleSchema, req.body)));
}));
mastersRouter.get("/vehicles/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.getVehicle(parseMaster(masterIdSchema, req.params).id));
}));
mastersRouter.put("/vehicles/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.upsertVehicle({
        ...parseMaster(vehicleSchema, req.body),
        id: parseMaster(masterIdSchema, req.params).id,
    }));
}));
mastersRouter.delete("/vehicles/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.deleteVehicle(parseMaster(masterIdSchema, req.params).id));
}));
mastersRouter.patch("/vehicles/:id/status", asyncHandler(async (req, res) => {
    res.json(await mastersService.updateVehicleStatus(parseMaster(masterIdSchema, req.params).id, parseMaster(masterStatusSchema, req.body).status));
}));
mastersRouter.post("/farms/bulk", asyncHandler(async (req, res) => {
    res.status(201).json(await mastersBulkService.importFarms(req.body));
}));
mastersRouter.post("/farms", asyncHandler(async (req, res) => {
    res.status(201).json(await mastersService.upsertFarm(parseMaster(farmSchema, req.body)));
}));
mastersRouter.get("/farms/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.getFarm(parseMaster(masterIdSchema, req.params).id));
}));
mastersRouter.put("/farms/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.upsertFarm({
        ...parseMaster(farmSchema, req.body),
        id: parseMaster(masterIdSchema, req.params).id,
    }));
}));
mastersRouter.delete("/farms/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.deleteFarm(parseMaster(masterIdSchema, req.params).id));
}));
mastersRouter.patch("/farms/:id/status", asyncHandler(async (req, res) => {
    res.json(await mastersService.updateFarmStatus(parseMaster(masterIdSchema, req.params).id, parseMaster(masterStatusSchema, req.body).status));
}));
mastersRouter.post("/shops/bulk", asyncHandler(async (req, res) => {
    res.status(201).json(await mastersBulkService.importShops(req.body));
}));
mastersRouter.post("/shops", asyncHandler(async (req, res) => {
    res.status(201).json(await mastersService.upsertShop(parseMaster(shopSchema, req.body)));
}));
mastersRouter.get("/shops/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.getShop(parseMaster(masterIdSchema, req.params).id));
}));
mastersRouter.put("/shops/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.upsertShop({
        ...parseMaster(shopSchema, req.body),
        id: parseMaster(masterIdSchema, req.params).id,
    }));
}));
mastersRouter.delete("/shops/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.deleteShop(parseMaster(masterIdSchema, req.params).id));
}));
mastersRouter.patch("/shops/:id/status", asyncHandler(async (req, res) => {
    res.json(await mastersService.updateShopStatus(parseMaster(masterIdSchema, req.params).id, parseMaster(masterStatusSchema, req.body).status));
}));
mastersRouter.post("/banks", asyncHandler(async (req, res) => {
    res.status(201).json(await mastersService.upsertBank(parseMaster(bankSchema, req.body)));
}));
mastersRouter.get("/banks/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.getBank(parseMaster(masterIdSchema, req.params).id));
}));
mastersRouter.put("/banks/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.upsertBank({
        ...parseMaster(bankSchema, req.body),
        id: parseMaster(masterIdSchema, req.params).id,
    }));
}));
mastersRouter.delete("/banks/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.deleteBank(parseMaster(masterIdSchema, req.params).id));
}));
mastersRouter.patch("/banks/:id/status", asyncHandler(async (req, res) => {
    res.json(await mastersService.updateBankStatus(parseMaster(masterIdSchema, req.params).id, parseMaster(masterStatusSchema, req.body).status));
}));
mastersRouter.post("/bird-types/bulk", asyncHandler(async (req, res) => {
    res.status(201).json(await mastersBulkService.importBirdTypes(req.body));
}));
mastersRouter.post("/bird-types", asyncHandler(async (req, res) => {
    res.status(201).json(await mastersService.upsertBirdType(parseMaster(birdTypeSchema, req.body)));
}));
mastersRouter.get("/bird-types/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.getBirdType(parseMaster(masterIdSchema, req.params).id));
}));
mastersRouter.put("/bird-types/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.upsertBirdType({
        ...parseMaster(birdTypeSchema, req.body),
        id: parseMaster(masterIdSchema, req.params).id,
    }));
}));
mastersRouter.delete("/bird-types/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.deleteBirdType(parseMaster(masterIdSchema, req.params).id));
}));
mastersRouter.patch("/bird-types/:id/status", asyncHandler(async (req, res) => {
    res.json(await mastersService.updateBirdTypeStatus(parseMaster(masterIdSchema, req.params).id, parseMaster(masterStatusSchema, req.body).status));
}));
// ---------------------------------------------------------------------------
// Routes master
// ---------------------------------------------------------------------------
mastersRouter.get("/routes/:id", asyncHandler(async (req, res) => {
    res.json(await routesService.getRoute(parseMaster(masterIdSchema, req.params).id));
}));
mastersRouter.post("/routes", asyncHandler(async (req, res) => {
    res.status(201).json(await routesService.upsertRoute(parseMaster(routeSchema, req.body)));
}));
mastersRouter.put("/routes/:id", asyncHandler(async (req, res) => {
    res.json(await routesService.upsertRoute({
        ...parseMaster(routeSchema, req.body),
        id: parseMaster(masterIdSchema, req.params).id,
    }));
}));
mastersRouter.patch("/routes/:id/status", asyncHandler(async (req, res) => {
    res.json(await routesService.updateRouteStatus(parseMaster(masterIdSchema, req.params).id, parseMaster(masterStatusSchema, req.body).status));
}));
mastersRouter.delete("/routes/:id", asyncHandler(async (req, res) => {
    res.json(await routesService.deleteRoute(parseMaster(masterIdSchema, req.params).id));
}));
// ---------------------------------------------------------------------------
// Market Rate master
// ---------------------------------------------------------------------------
mastersRouter.get("/market-rates", asyncHandler(async (req, res) => {
    const { fromDate, toDate } = parseMaster(marketRateQuerySchema, req.query);
    res.json(await marketRatesService.listMarketRates(fromDate, toDate));
}));
mastersRouter.put("/market-rates/batch", asyncHandler(async (req, res) => {
    res.json(await marketRatesService.upsertMarketRates(parseMaster(marketRateBatchSchema, req.body)));
}));
mastersRouter.post("/resolve-location", asyncHandler(async (req, res) => {
    const { input } = parseMaster(locationSchema, req.body);
    res.json(resolveMasterLocation(input));
}));
mastersRouter.use(mastersErrors);
//# sourceMappingURL=masters.js.map