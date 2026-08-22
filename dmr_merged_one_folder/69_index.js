import http from "node:http";
import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { pool } from "./config/db.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
const app = express();
app.use(cors({
    origin: env.corsOrigin.length ? env.corsOrigin : true,
    credentials: true,
}));
app.use(express.json({ limit: "25mb" }));
app.get("/", (_req, res) => {
    res.json({
        name: "DMR Poultries API",
        phase: "2 â€” Masters + Trips + Staff + Operations",
        docs: {
            swagger: "GET /api/docs",
            openapi: "GET /api/docs/openapi.json",
            health: "GET /api/health",
            masters: "GET /api/masters/{employees|vehicles|farms|shops|banks|bird-types}",
            trips: "GET|POST /api/trips  PUT /api/trips/:id  POST /api/trips/:id/steps/:step  PATCH /api/trips/:id/status",
            staff: "GET|POST /api/staff/{duties|leaves|salaries|advances|attendance}",
            operations: {
                dashboard: "GET /api/operations/dashboard",
                trips: "GET|POST /api/operations/trips",
                tripList: "GET /api/operations/trip-list",
                rateEntry: "GET /api/operations/rate-entry  A GET/PUT /api/operations/rate-entry/:tripId  A POST /api/operations/rate-entry/:tripId/lock",
                shopRates: "GET|POST /api/operations/shop-rates",
                shopSales: "GET|POST /api/operations/shop-sales",
                collections: "GET|POST /api/operations/collections",
                fuelExpenses: "GET|POST /api/operations/fuel-expenses",
            },
            fleet: {
                maintenance: "GET|POST /api/fleet/maintenance  PUT /api/fleet/maintenance/:id",
                approve: "POST /api/fleet/maintenance/:id/approve",
                reject: "POST /api/fleet/maintenance/:id/reject",
                delete: "DELETE /api/fleet/maintenance/:id",
                documents: "GET /api/fleet/maintenance/:id/documents",
                document: "GET|DELETE /api/fleet/maintenance/:id/documents/:documentId",
                permits: "GET /api/fleet/permits  GET /api/fleet/permits/summary",
                permitUpsert: "PUT /api/fleet/permits/:vehicleId/:docType",
                permitDelete: "DELETE /api/fleet/permits/:vehicleId/:docType",
                permitDocument: "GET /api/fleet/permits/:vehicleId/:docType/document",
                emis: "GET|POST /api/fleet/emis  PUT|DELETE /api/fleet/emis/:id",
                emiSchedule: "GET /api/fleet/emis/:id/schedule",
                emiPay: "POST /api/fleet/emis/:id/pay",
            },
            accounts: {
                payments: "GET|POST /api/accounts/payments  PUT|DELETE /api/accounts/payments/:id",
            },
        },
    });
});
app.use("/api", apiRouter);
app.use(notFound);
app.use(errorHandler);
async function start() {
    await pool.query("SELECT 1");
    const server = http.createServer(app);
    server.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
            console.error(`Port ${env.port} is already in use. Another process may already be running the backend.`);
            process.exit(1);
        }
        throw err;
    });
    server.listen(env.port, () => {
        console.log(`DMR backend listening on http://localhost:${env.port}`);
        console.log(`PostgreSQL: ${env.databaseUrl.replace(/:[^:@]+@/, ":***@")}`);
    });
}
start().catch((err) => {
    console.error("Failed to start backend:", err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map