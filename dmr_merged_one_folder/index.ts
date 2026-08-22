import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { pool } from "./config/db.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

const app = express();

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
    phase: "1 — Local PostgreSQL (Masters + Trips Steps 1–5 + Staff)",
    docs: {
      health: "GET /api/health",
      masters: "GET /api/masters/{employees|vehicles|farms|shops|banks|bird-types}",
      trips: "GET|POST /api/trips  PUT /api/trips/:id  POST /api/trips/:id/steps/:step",
      staff: "GET|POST /api/staff/{duties|leaves|salaries|advances|attendance}",
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

start().catch((err) => {
  console.error("Failed to start backend:", err);
  process.exit(1);
});
