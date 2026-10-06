/**
 * Pure session/error logic that runs without a database (Node 26-safe).
 *
 * Proves without any I/O:
 *  - idle-expiry boundaries use server elapsed time; future/client timestamps
 *    can never extend or prematurely end a session
 *  - backend error bodies carry stable AUTH, FORBIDDEN and RATE_LIMITED
 *    machine codes plus the request correlation ID, and never leak internals
 *  - X-Request-Id echo only accepts valid UUIDs (header-injection safe)
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { isSessionIdleExpired, SESSION_IDLE_MS } = await import(
  "../src/services/authService.js"
);
const { AppError, errorHandler } = await import("../src/middleware/errorHandler.js");
const { requestId } = await import("../src/middleware/requestId.js");

function captureError(err: unknown): { status: number; body: Record<string, unknown>; headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  const res: Record<string, unknown> = {
    locals: { requestId: "9f2c4a1e-3b7d-4e5f-8a9b-0c1d2e3f4a5b" },
    statusCode: 200,
    body: undefined,
    setHeader: (k: string, v: string) => {
      headers[k.toLowerCase()] = v;
    },
    status: (c: number) => {
      res.statusCode = c;
      return res;
    },
    json: (b: unknown) => {
      res.body = b;
      return res;
    },
  };
  (errorHandler as (e: unknown, q: unknown, s: unknown, n: unknown) => void)(
    err,
    {},
    res,
    () => undefined,
  );
  return { status: res.statusCode as number, body: res.body as Record<string, unknown>, headers };
}

describe("SESSION_IDLE_MS is exactly 10 minutes", () => {
  it("constant matches the authoritative policy", () => {
    assert.equal(SESSION_IDLE_MS, 10 * 60 * 1000);
  });

  it("9m30s idle is alive; 10m01s idle is expired", () => {
    const now = Date.now();
    assert.equal(isSessionIdleExpired(new Date(now - (9 * 60 + 30) * 1000), now), false);
    assert.equal(isSessionIdleExpired(new Date(now - (10 * 60 + 1) * 1000), now), true);
  });

  it("exactly 10m00s is NOT yet expired (strictly-greater boundary)", () => {
    const now = Date.now();
    assert.equal(isSessionIdleExpired(new Date(now - 10 * 60 * 1000), now), false);
  });

  it("future client timestamps never expire early and never extend", () => {
    const now = Date.now();
    assert.equal(isSessionIdleExpired(new Date(now + 3600_000), now), false);
  });

  it("missing/garbage activity never expires by itself", () => {
    assert.equal(isSessionIdleExpired(null), false);
    assert.equal(isSessionIdleExpired(undefined), false);
    assert.equal(isSessionIdleExpired("not-a-date"), false);
  });
});

describe("backend error codes distinguish auth death from anything else", () => {
  it("401 carries AUTH_INVALID by default", () => {
    const out = captureError(new AppError(401, "Authentication required"));
    assert.equal(out.status, 401);
    assert.equal(out.body.code, "AUTH_INVALID");
    assert.equal(out.body.requestId, "9f2c4a1e-3b7d-4e5f-8a9b-0c1d2e3f4a5b");
  });

  it("401 mentioning expiry/revocation maps to AUTH_EXPIRED/AUTH_REVOKED", () => {
    assert.equal(captureError(new AppError(401, "Session expired")).body.code, "AUTH_EXPIRED");
    assert.equal(captureError(new AppError(401, "Session revoked")).body.code, "AUTH_REVOKED");
  });

  it("403 carries FORBIDDEN and 429 carries RATE_LIMITED", () => {
    assert.equal(captureError(new AppError(403, "Forbidden")).body.code, "FORBIDDEN");
    assert.equal(captureError(new AppError(429, "Too many login attempts; try again later")).body.code, "RATE_LIMITED");
  });

  it("malformed JSON bodies become safe 400s without echoing input", () => {
    const parseError = new SyntaxError("Expected property name in JSON at position 1") as SyntaxError & {
      status: number;
      body: string;
    };
    parseError.status = 400;
    parseError.body = "{username:attacker-controlled}";
    const out = captureError(parseError);
    assert.equal(out.status, 400);
    assert.equal(out.body.code, "VALIDATION_ERROR");
    assert.ok(!JSON.stringify(out.body).includes("attacker-controlled"));
  });

  it("unexpected errors become generic 500s without internals", () => {
    const out = captureError(new Error("sql: relation \"secret_table\" does not exist at /var/db"));
    assert.equal(out.status, 500);
    assert.equal(out.body.error, "Internal server error");
    const serialized = JSON.stringify(out.body);
    assert.ok(!serialized.includes("secret_table"));
    assert.ok(!serialized.includes("/var/db"));
  });
});

describe("requestId accepts only valid UUIDs (header-injection safe)", () => {
  function runWith(incoming: unknown): string | null {
    let seen: string | null = null;
    const req = { headers: { "x-request-id": incoming } };
    const res: Record<string, unknown> = {
      locals: {},
      setHeader: (k: string, v: string) => {
        if (k === "X-Request-Id") seen = v;
      },
    };
    (requestId as (q: unknown, s: unknown, n: () => void) => void)(req, res, () => undefined);
    return seen;
  }

  it("echoes a valid incoming UUID", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    assert.equal(runWith(id), id);
  });

  it("mints a fresh UUID for CRLF/garbage/oversized input", () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const bad of ["a\r\nX-Injected: 1", "not-a-uuid", "", 12345, "x".repeat(5000)]) {
      const minted = runWith(bad);
      assert.ok(minted && uuid.test(minted) && String(minted) !== String(bad), `safe for ${JSON.stringify(String(bad)).slice(0, 30)}`);
    }
  });
});
