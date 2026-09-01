import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { mastersBulkService } from "../services/mastersBulkService.js";
import { mastersService } from "../services/mastersService.js";
import { marketRatesService } from "../services/marketRatesService.js";
import { routesService } from "../services/routesService.js";
export const mastersRouter = Router();
mastersRouter.get("/employees", asyncHandler(async (req, res) => {
    const department = typeof req.query.department === "string" ? req.query.department : undefined;
    res.json(await mastersService.listEmployees(department));
}));
mastersRouter.post("/employees/bulk", asyncHandler(async (req, res) => {
    res.status(201).json(await mastersBulkService.importEmployees(req.body));
}));
mastersRouter.post("/employees", asyncHandler(async (req, res) => {
    res.status(201).json(await mastersService.upsertEmployee(req.body));
}));
mastersRouter.put("/employees/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.upsertEmployee({
        ...req.body,
        id: Number(req.params.id),
    }));
}));
mastersRouter.delete("/employees/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.deleteEmployee(Number(req.params.id)));
}));
mastersRouter.patch("/employees/:id/status", asyncHandler(async (req, res) => {
    res.json(await mastersService.updateEmployeeStatus(Number(req.params.id), req.body.status));
}));
mastersRouter.get("/vehicles", asyncHandler(async (_req, res) => {
    res.json(await mastersService.listVehicles());
}));
mastersRouter.post("/vehicles/bulk", asyncHandler(async (req, res) => {
    res.status(201).json(await mastersBulkService.importVehicles(req.body));
}));
mastersRouter.post("/vehicles", asyncHandler(async (req, res) => {
    res.status(201).json(await mastersService.upsertVehicle(req.body));
}));
mastersRouter.put("/vehicles/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.upsertVehicle({
        ...req.body,
        id: Number(req.params.id),
    }));
}));
mastersRouter.delete("/vehicles/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.deleteVehicle(Number(req.params.id)));
}));
mastersRouter.patch("/vehicles/:id/status", asyncHandler(async (req, res) => {
    res.json(await mastersService.updateVehicleStatus(Number(req.params.id), req.body.status));
}));
mastersRouter.get("/farms", asyncHandler(async (_req, res) => {
    res.json(await mastersService.listFarms());
}));
mastersRouter.post("/farms/bulk", asyncHandler(async (req, res) => {
    res.status(201).json(await mastersBulkService.importFarms(req.body));
}));
mastersRouter.post("/farms", asyncHandler(async (req, res) => {
    res.status(201).json(await mastersService.upsertFarm(req.body));
}));
mastersRouter.put("/farms/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.upsertFarm({
        ...req.body,
        id: Number(req.params.id),
    }));
}));
mastersRouter.delete("/farms/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.deleteFarm(Number(req.params.id)));
}));
mastersRouter.patch("/farms/:id/status", asyncHandler(async (req, res) => {
    res.json(await mastersService.updateFarmStatus(Number(req.params.id), req.body.status));
}));
mastersRouter.get("/shops", asyncHandler(async (_req, res) => {
    res.json(await mastersService.listShops());
}));
mastersRouter.post("/shops/bulk", asyncHandler(async (req, res) => {
    res.status(201).json(await mastersBulkService.importShops(req.body));
}));
mastersRouter.post("/shops", asyncHandler(async (req, res) => {
    res.status(201).json(await mastersService.upsertShop(req.body));
}));
mastersRouter.put("/shops/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.upsertShop({
        ...req.body,
        id: Number(req.params.id),
    }));
}));
mastersRouter.delete("/shops/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.deleteShop(Number(req.params.id)));
}));
mastersRouter.patch("/shops/:id/status", asyncHandler(async (req, res) => {
    res.json(await mastersService.updateShopStatus(Number(req.params.id), req.body.status));
}));
mastersRouter.post("/shops/bulk", asyncHandler(async (req, res) => {
    const created = await mastersService.bulkCreateShops(req.body);
    res.status(201).json(created);
}));
mastersRouter.get("/banks", asyncHandler(async (_req, res) => {
    res.json(await mastersService.listBanks());
}));
mastersRouter.post("/banks", asyncHandler(async (req, res) => {
    res.status(201).json(await mastersService.upsertBank(req.body));
}));
mastersRouter.put("/banks/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.upsertBank({
        ...req.body,
        id: Number(req.params.id),
    }));
}));
mastersRouter.delete("/banks/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.deleteBank(Number(req.params.id)));
}));
mastersRouter.patch("/banks/:id/status", asyncHandler(async (req, res) => {
    res.json(await mastersService.updateBankStatus(Number(req.params.id), req.body.status));
}));
mastersRouter.get("/bird-types", asyncHandler(async (_req, res) => {
    res.json(await mastersService.listBirdTypes());
}));
mastersRouter.post("/bird-types/bulk", asyncHandler(async (req, res) => {
    res.status(201).json(await mastersBulkService.importBirdTypes(req.body));
}));
mastersRouter.post("/bird-types", asyncHandler(async (req, res) => {
    res.status(201).json(await mastersService.upsertBirdType(req.body));
}));
mastersRouter.put("/bird-types/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.upsertBirdType({
        ...req.body,
        id: Number(req.params.id),
    }));
}));
mastersRouter.delete("/bird-types/:id", asyncHandler(async (req, res) => {
    res.json(await mastersService.deleteBirdType(Number(req.params.id)));
}));
mastersRouter.patch("/bird-types/:id/status", asyncHandler(async (req, res) => {
    res.json(await mastersService.updateBirdTypeStatus(Number(req.params.id), req.body.status));
}));
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
    res.json(await routesService.upsertRoute({
        ...req.body,
        id: Number(req.params.id),
    }));
}));
mastersRouter.patch("/routes/:id/status", asyncHandler(async (req, res) => {
    res.json(await routesService.updateRouteStatus(Number(req.params.id), req.body.status));
}));
mastersRouter.delete("/routes/:id", asyncHandler(async (req, res) => {
    res.json(await routesService.deleteRoute(Number(req.params.id)));
}));
// ---------------------------------------------------------------------------
// Market Rate master
// ---------------------------------------------------------------------------
mastersRouter.get("/market-rates", asyncHandler(async (req, res) => {
    const fromDate = typeof req.query.fromDate === "string" ? req.query.fromDate : undefined;
    const toDate = typeof req.query.toDate === "string" ? req.query.toDate : undefined;
    res.json(await marketRatesService.listMarketRates(fromDate, toDate));
}));
mastersRouter.put("/market-rates/batch", asyncHandler(async (req, res) => {
    res.json(await marketRatesService.upsertMarketRates(req.body));
}));
// ---------------------------------------------------------------------------
// Location resolver — resolve Google Maps URLs, share links, and addresses
// to latitude / longitude / address.
// ---------------------------------------------------------------------------
function extractCoordsFromUrl(url) {
    const patterns = [
        /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
        /\?q=(-?\d+\.?\d*)%2C(-?\d+\.?\d*)/,
        /\?q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
        /\/place\/[^/]+\/(-?\d+\.?\d*),(-?\d+\.?\d*)/,
        /\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
        /!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/,
        /ll=(-?\d+\.?\d*)[,](-?\d+\.?\d*)/,
        /center=(-?\d+\.?\d*)[,](-?\d+\.?\d*)/,
    ];
    for (const p of patterns) {
        const m = url.match(p);
        if (m) {
            const lat = parseFloat(m[1]);
            const lng = parseFloat(m[2]);
            if (Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180) {
                return { lat, lng };
            }
        }
    }
    return null;
}
async function resolveShareGoogleUrl(url) {
    try {
        const resp = await fetch(url, {
            redirect: "follow",
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(10000),
        });
        return resp.url;
    }
    catch {
        return null;
    }
}
async function reverseGeocode(lat, lng) {
    try {
        const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, { headers: { "User-Agent": "DMR-Poultries-ERP/1.0" }, signal: AbortSignal.timeout(8000) });
        const data = await resp.json();
        return data?.display_name || null;
    }
    catch {
        return null;
    }
}
async function forwardGeocode(address) {
    try {
        const encoded = encodeURIComponent(address);
        const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1&addressdetails=1`, { headers: { "User-Agent": "DMR-Poultries-ERP/1.0" }, signal: AbortSignal.timeout(8000) });
        const data = await resp.json();
        if (Array.isArray(data) && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon),
                displayName: data[0].display_name || address,
            };
        }
    }
    catch { /* ignore */ }
    return null;
}
mastersRouter.post("/resolve-location", asyncHandler(async (req, res) => {
    const input = String(req.body?.input || "").trim();
    if (!input) {
        res.status(400).json({ error: "Input is required." });
        return;
    }
    // 1) Try as coordinate pair
    const coordMatch = input.match(/^(-?\d+\.?\d*)\s*[,;]\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
        const lat = parseFloat(coordMatch[1]);
        const lng = parseFloat(coordMatch[2]);
        if (Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180) {
            const address = await reverseGeocode(lat, lng);
            res.json({ latitude: lat, longitude: lng, address: address || null });
            return;
        }
    }
    // 2) Try as URL — extract coordinates directly
    if (input.startsWith("http://") || input.startsWith("https://")) {
        const directCoords = extractCoordsFromUrl(input);
        if (directCoords) {
            const address = await reverseGeocode(directCoords.lat, directCoords.lng);
            res.json({ latitude: directCoords.lat, longitude: directCoords.lng, address: address || null });
            return;
        }
        // 3) share.google short URL — follow redirects then try again
        if (input.includes("share.google") || input.includes("maps.app.goo.gl") || input.includes("goo.gl/maps")) {
            const resolved = await resolveShareGoogleUrl(input);
            if (resolved && resolved !== input) {
                const resolvedCoords = extractCoordsFromUrl(resolved);
                if (resolvedCoords) {
                    const address = await reverseGeocode(resolvedCoords.lat, resolvedCoords.lng);
                    res.json({ latitude: resolvedCoords.lat, longitude: resolvedCoords.lng, address: address || null });
                    return;
                }
            }
            res.status(422).json({
                error: "Location link could not be resolved. Please try again or select the location on the map.",
            });
            return;
        }
        res.status(422).json({
            error: "Could not extract coordinates from this URL. Please paste coordinates directly or select on the map.",
        });
        return;
    }
    // 4) Try as address — forward geocode via Nominatim
    const geo = await forwardGeocode(input);
    if (geo) {
        res.json({ latitude: geo.lat, longitude: geo.lng, address: geo.displayName });
        return;
    }
    res.status(422).json({
        error: "Unable to determine this location. Please select it on the map or paste a Google Maps location.",
    });
}));
//# sourceMappingURL=masters.js.map