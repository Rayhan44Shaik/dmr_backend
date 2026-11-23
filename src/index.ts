import http from "node:http";
import cors from "cors";
import express from "express";
import { env, isSmtpDeliveryEnabled } from "./config/env.js";
import { pool } from "./config/db.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { requestId } from "./middleware/requestId.js";
import { securityHeaders } from "./middleware/securityHeaders.js";
import { protectCookieWrites } from "./middleware/browserRequest.js";

const app = express();
app.disable("x-powered-by");

app.use(requestId);
app.use(securityHeaders);

app.use((req, res, next) => {
  const origin = req.get("Origin");
  if (origin && !env.corsOrigin.includes(origin)) {
    res.status(403).json({ error: "CORS origin not allowed" });
    return;
  }
  next();
});

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (env.corsOrigin.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  })
);

// Default JSON bodies are intentionally small. Only known high-volume
// spreadsheet/import endpoints receive the larger cap, so a pre-auth request
// cannot make the process buffer an arbitrary 25 MB body. `inflate: false`
// rejects compressed request bodies; this API does not accept them.
const JSON_DEFAULT_LIMIT = "1mb";
const JSON_BULK_LIMIT = "12mb";
const BULK_JSON_PATH =
  /^\/api\/(?:masters\/[^/]+\/(?:bulk|opening-balances\/bulk)|operations\/collection-entry\/(?:import|import-validate)|accounts\/farm-payments)(?:\/|$)/i;
const parseDefaultJson = express.json({ limit: JSON_DEFAULT_LIMIT, inflate: false });
const parseBulkJson = express.json({ limit: JSON_BULK_LIMIT, inflate: false });
app.use((req, res, next) =>
  (BULK_JSON_PATH.test(req.path) ? parseBulkJson : parseDefaultJson)(req, res, next)
);
app.use(protectCookieWrites);

app.get("/", (_req, res) => {
  res.json({ name: "DMR Poultries API", ok: true });
});

app.use("/api", apiRouter);
app.use(notFound);
app.use(errorHandler);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Bind with short retries — tsx watch on Windows can restart before the
 * previous listener has fully released PORT. */
async function listen(server: http.Server, port: number, host: string, attempts = 20): Promise<void> {
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
        // this process (avoids dual-stack races on Windows). Production binds
        // loopback only: the Cloudflare Tunnel is the sole public path.
        server.listen(port, host);
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

  const configuredGrace = Number(process.env.SHUTDOWN_GRACE_MS ?? 15_000);
  const shutdownGraceMs = Number.isFinite(configuredGrace)
    ? Math.max(1_000, Math.min(30_000, configuredGrace))
    : 15_000;
  let exiting = false;
  let finished = false;
  let shutdownTimer: NodeJS.Timeout | null = null;
  let hardExitTimer: NodeJS.Timeout | null = null;
  const finish = (code: number) => {
    if (finished) return;
    finished = true;
    if (shutdownTimer) clearTimeout(shutdownTimer);
    if (hardExitTimer) clearTimeout(hardExitTimer);
    void pool.end().finally(() => process.exit(code));
  };
  const exitNow = (code = 0) => {
    if (exiting) return;
    exiting = true;
    // Stop accepting new work, let idle keep-alive sockets go immediately,
    // then allow active requests up to the configured drain window.
    try {
      server.closeIdleConnections();
    } catch {
      /* Node < 18.2 or already closed */
    }
    server.close(() => finish(code));
    shutdownTimer = setTimeout(() => {
      try {
        server.closeAllConnections();
      } catch {
        /* already closed */
      }
      finish(code);
    }, shutdownGraceMs);
    shutdownTimer.unref();
    hardExitTimer = setTimeout(() => process.exit(code), shutdownGraceMs + 5_000);
    hardExitTimer.unref();
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

  // The API is always loopback-only. The Cloudflare Tunnel is the sole
  // public path; development uses the same boundary.
  const listenHost = "127.0.0.1";
  try {
    await listen(server, env.port, listenHost);
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

  console.log(`DMR backend listening on http://${listenHost}:${env.port}`);
  // Never print the connection string: a password containing `:` or `@` can
  // survive naive masking. The host/credentials belong in secret management.
  console.log("PostgreSQL: connected");
  // Static reasons only: never an SMTP value, host, or credential.
  if (!env.smtp.configured) {
    console.warn(`Password-reset email delivery is disabled: ${env.smtp.problem ?? "SMTP is not configured"}.`);
  } else if (!isSmtpDeliveryEnabled()) {
    console.warn("Password-reset email delivery is disabled outside production (set SMTP_DELIVERY_ENABLED=true to opt in).");
  }
}

start().catch((err) => {
  console.error("Failed to start backend:", err);
  process.exit(1);
});
