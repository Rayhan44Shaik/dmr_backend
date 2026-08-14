import cors from "cors";
import express from "express";
import { pathToFileURL } from "node:url";
import { env } from "./config/env.js";
import { pool } from "./config/db.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

export const app = express();

app.use(
  cors({
    origin: env.corsOrigin.length ? env.corsOrigin : true,
    credentials: true,
  })
);
app.use(express.json({ limit: "25mb" }));

app.get("/", (_req, res) => {
  res.json({
    name: "DMR Poultries API",
    phase: "2 — Masters + Trips + Staff + Operations",
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
        shopRates: "GET|POST /api/operations/shop-rates",
        shopSales: "GET|POST /api/operations/shop-sales",
        collections: "GET|POST /api/operations/collections",
        fuelExpenses: "GET|POST /api/operations/fuel-expenses",
      },
    },
  });
});

app.use("/api", apiRouter);
app.use(notFound);
app.use(errorHandler);

async function start() {
  await pool.query("SELECT 1");
  app.listen(env.port, () => {
    console.log(`DMR backend listening on http://localhost:${env.port}`);
    console.log(`PostgreSQL: ${env.databaseUrl.replace(/:[^:@]+@/, ":***@")}`);
  });
}

// Auto-start only when this file is the process entry point (keeps the app
// importable by tests without binding a port or touching the pool).
const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  start().catch((err) => {
    console.error("Failed to start backend:", err);
    process.exit(1);
  });
}
