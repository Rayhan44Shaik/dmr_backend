import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { query } from "../config/db.js";
import { AppError, asyncHandler } from "./errorHandler.js";
import { authUser } from "./auth.js";

/**
 * Generic Idempotency-Key replay for mutations (PDF section 10).
 *
 * Contract:
 * - Same key + same request payload => the ORIGINAL stored response is
 *   replayed (no second business record), with `X-Idempotent-Replayed: true`.
 * - Same key + different payload   => 409 (client must mint a new key).
 * - Concurrent duplicates          => the loser waits briefly for the winner
 *   and then replays; it never executes the handler twice.
 * - Rows expire after 24h (bounded storage); expired keys behave as new.
 *
 * Excluded: safe methods (GET/HEAD/OPTIONS), /auth/activity (high-frequency
 * pings create no business records) and /auth/logout (already single-flight
 * client-side). Bodies over 256 KB bypass the store but still execute.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PENDING_STATUS = 102;
const MAX_STORE_BYTES = 256 * 1024;
const POLL_ROUNDS = 25;
const POLL_MS = 200;

const EXCLUDED_PATHS = new Set(["/auth/activity", "/auth/logout"]);

function stableBody(value: unknown): string {
  try {
    return JSON.stringify(value ?? null) ?? "null";
  } catch {
    return "null";
  }
}

const requestHash = (method: string, route: string, userId: number, body: string) =>
  createHash("sha256").update(`${method}\n${route}\n${userId}\n${body}`).digest("hex");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type StoredKey = {
  user_id: number;
  route: string;
  request_hash: string;
  status: number;
  body: unknown;
  headers: Record<string, string>;
};

async function readKey(key: string): Promise<StoredKey | null> {
  const found = await query(
    `SELECT user_id, route, request_hash, status, body, headers
     FROM idempotency_keys WHERE key = $1::uuid AND expires_at > NOW()`,
    [key],
  );
  if (!found.rowCount) return null;
  const row = found.rows[0] as Record<string, unknown>;
  return {
    user_id: Number(row.user_id),
    route: String(row.route),
    request_hash: String(row.request_hash),
    status: Number(row.status),
    body: row.body,
    headers: (row.headers ?? {}) as Record<string, string>,
  };
}

function replay(res: Response, stored: StoredKey): void {
  if (stored.headers["set-cookie"]) res.setHeader("Set-Cookie", stored.headers["set-cookie"]);
  if (stored.headers["x-dmr-session-token"]) {
    res.setHeader("X-DMR-Session-Token", stored.headers["x-dmr-session-token"]);
  }
  res.setHeader("X-Idempotent-Replayed", "true");
  res.status(stored.status).json(stored.body);
}

async function pruneExpired(): Promise<void> {
  try {
    await query(`DELETE FROM idempotency_keys WHERE expires_at <= NOW()`);
  } catch {
    // Pruning is best-effort; a full table never breaks mutations.
  }
}

export const idempotency: (req: Request, res: Response, next: NextFunction) => void =
  asyncHandler(async (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
    if (EXCLUDED_PATHS.has(req.path)) return next();

    const rawKey = req.headers["idempotency-key"];
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (!key) return next();
    if (typeof key !== "string" || !UUID_RE.test(key.trim())) {
      throw new AppError(400, "Idempotency-Key must be a UUID");
    }
    const idemKey = key.trim();

    const user = authUser(res);
    const route = `${req.method} ${req.path}`;
    const serialized = stableBody(req.body);
    if (serialized.length > MAX_STORE_BYTES) return next();
    const hash = requestHash(req.method, route, user.id, serialized);

    // Fast path: completed or in-flight row already exists.
    const existing = await readKey(idemKey);
    if (existing) {
      if (existing.user_id !== user.id || existing.route !== route) {
        throw new AppError(409, "Idempotency-Key was already used for a different request");
      }
      if (existing.request_hash !== hash) {
        throw new AppError(409, "Idempotency-Key was already used with a different payload");
      }
      if (existing.status !== PENDING_STATUS) {
        replay(res, existing);
        return;
      }
      const settled = await waitForCompletion(idemKey);
      if (settled && settled.status !== PENDING_STATUS) {
        replay(res, settled);
        return;
      }
      throw new AppError(409, "Duplicate request is still processing; retry shortly");
    }

    // Claim the key. A concurrent duplicate loses the race here and replays.
    const claimed = await query(
      `INSERT INTO idempotency_keys (key, user_id, route, request_hash, status, body)
       VALUES ($1::uuid, $2, $3, $4, $5, '{}'::jsonb)
       ON CONFLICT (key) DO NOTHING RETURNING key`,
      [idemKey, user.id, route, hash, PENDING_STATUS],
    );
    if (!claimed.rowCount) {
      const raced = await readKey(idemKey);
      if (raced && raced.request_hash === hash && raced.status !== PENDING_STATUS) {
        replay(res, raced);
        return;
      }
      if (raced && raced.request_hash !== hash) {
        throw new AppError(409, "Idempotency-Key was already used with a different payload");
      }
      const settled = await waitForCompletion(idemKey);
      if (settled && settled.status !== PENDING_STATUS && settled.request_hash === hash) {
        replay(res, settled);
        return;
      }
      throw new AppError(409, "Duplicate request is still processing; retry shortly");
    }
    void pruneExpired();

    // Capture the downstream JSON response (success AND handled errors both
    // flow through res.json, so error results replay identically).
    let stored = false;
    const storeResult = (status: number, body: unknown): void => {
      if (stored) return;
      stored = true;
      const keep: Record<string, string> = {};
      const cookie = res.getHeader("Set-Cookie");
      if (typeof cookie === "string") keep["set-cookie"] = cookie;
      else if (Array.isArray(cookie)) keep["set-cookie"] = cookie.join(", ");
      const sessionToken = res.getHeader("X-DMR-Session-Token");
      if (typeof sessionToken === "string") keep["x-dmr-session-token"] = sessionToken;
      const payload = stableBody(body);
      void query(
        `UPDATE idempotency_keys SET status=$2, body=$3::jsonb, headers=$4::jsonb WHERE key=$1::uuid`,
        [idemKey, status, payload.length > MAX_STORE_BYTES ? {} : JSON.parse(payload), keep],
      ).catch(() => undefined);
    };
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      storeResult(res.statusCode, body);
      return originalJson(body);
    }) as typeof res.json;
    res.on("finish", () => {
      if (!stored) storeResult(res.statusCode, {});
    });

    return next();
  });

async function waitForCompletion(key: string): Promise<StoredKey | null> {
  for (let round = 0; round < POLL_ROUNDS; round++) {
    await sleep(POLL_MS);
    const current = await readKey(key);
    if (!current) return null;
    if (current.status !== PENDING_STATUS) return current;
  }
  return readKey(key);
}
