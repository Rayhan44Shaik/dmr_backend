import http from "node:http";
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
        tripList: "GET /api/operations/trip-list",
        rateEntry:
          "GET /api/operations/rate-entry  A GET/PUT /api/operations/rate-entry/:tripId  A POST /api/operations/rate-entry/:tripId/lock",
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
        farmPayments: "GET|PUT /api/accounts/farm-payments",
      },
    },
  });
});

app.use("/api", apiRouter);
app.use(notFound);
app.use(errorHandler);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Bind with short retries — tsx watch on Windows can restart before the
 * previous listener has fully released PORT. */
async function listen(server: http.Server, port: number, attempts = 20): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (err: Error) => {
          server.off("listening", onListening);
          reject(err);
        };
        const onListening = () => {
          server.off("error", onError);
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        // Bind IPv4 explicitly so Vite's 127.0.0.1:4000 proxy always reaches
        // this process (avoids dual-stack races on Windows).
        server.listen(port, "0.0.0.0");
      });
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      // Reset the handle so the next listen() is clean after EADDRINUSE.
      await new Promise<void>((resolve) => {
        try {
          server.close(() => resolve());
        } catch {
          resolve();
        }
        // close() may not call back if never listening — unblock either way.
        setTimeout(resolve, 50).unref();
      });
      if (code !== "EADDRINUSE" || attempt === attempts) {
        throw err;
      }
      if (attempt === 1 || attempt % 4 === 0) {
        console.warn(
          `Port ${port} still busy (attempt ${attempt}/${attempts}) — waiting for previous backend to exit…`
        );
      }
      await sleep(Math.min(100 * attempt, 500));
    }
  }
}

async function start() {
  await pool.query("SELECT 1");

  const server = http.createServer(app);
  // Short keep-alive so watch restarts are not held open by Vite proxy sockets.
  server.keepAliveTimeout = 5_000;
  server.headersTimeout = 6_000;
  server.requestTimeout = 60_000;

  let exiting = false;
  const exitNow = (code = 0) => {
    if (exiting) return;
    exiting = true;
    try {
      server.closeAllConnections();
    } catch {
      /* Node < 18.2 or already closed */
    }
    try {
      server.close();
    } catch {
      /* ignore */
    }
    void pool.end().finally(() => {
      process.exit(code);
    });
    // Hard ceiling — never block tsx watch from respawning.
    setTimeout(() => process.exit(code), 250).unref();
  };

  const shutdown = (signal: string) => {
    console.log(`\n${signal} received — closing API…`);
    exitNow(0);
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  // tsx watch on Windows often sends this before respawning.
  process.once("SIGHUP", () => shutdown("SIGHUP"));
  if (process.platform === "win32") {
    process.once("SIGBREAK", () => shutdown("SIGBREAK"));
  }

  try {
    await listen(server, env.port);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
      console.error(
        `Port ${env.port} is already in use after retries.\n` +
          `  Another backend is still running (often a second terminal or frontend "npm run dev").\n` +
          `  Stop it, or from backend run: npm run free-port   then: npm run dev`
      );
      process.exit(1);
    }
    throw err;
  }

  console.log(`DMR backend listening on http://0.0.0.0:${env.port}`);
  console.log(`PostgreSQL: ${env.databaseUrl.replace(/:[^:@]+@/, ":***@")}`);
}

start().catch((err) => {
  console.error("Failed to start backend:", err);
  process.exit(1);
});
