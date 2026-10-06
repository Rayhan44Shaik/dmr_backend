/**
 * Server-side session idle enforcement (10-minute genuine-inactivity timeout).
 *
 * Proves, against the real schema + real services on an isolated PGlite DB
 * and through the real HTTP server:
 *  - isSessionIdleExpired boundary behavior (9m30s alive, >10m expired,
 *    future timestamps never expire early, client clocks can't extend)
 *  - ordinary reads (/auth/me) NEVER advance last_activity_at
 *  - only POST /auth/activity advances the idle deadline (server time)
 *  - idle sessions are revoked server-side and replay with 401 + AUTH_* code
 *  - error bodies carry the strict machine code without leaking secrets
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";
import { startApp, type TestApp } from "./helpers/app.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });

const { pool } = await import("../src/config/db.js");
const { hashPassword } = await import("../src/utils/passwordHash.js");
const { authService, isSessionIdleExpired, SESSION_IDLE_MS } = await import(
  "../src/services/authService.js"
);

const USERNAME = "idle-owner";
const PASSWORD = "Idle-test-password-123!";

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

async function httpLogin(): Promise<{ token: string; cookie: string }> {
  const response = await fetch(`${app.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { token: string };
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  assert.ok(body.token, "login returns a Bearer [REDACTED]");
  return { token: body.token, cookie };
}

async function backdateActivity(token: string, minutesAgo: number): Promise<void> {
  await pool.query(
    `UPDATE application_sessions
     SET last_activity_at = NOW() - ($1 || ' minutes')::interval,
         last_seen_at = NOW() - ($1 || ' minutes')::interval
     WHERE token_hash = $2`,
    [String(minutesAgo), tokenHash(token)],
  );
}

async function lastActivity(token: string): Promise<number> {
  const found = await pool.query(
    `SELECT EXTRACT(EPOCH FROM COALESCE(last_activity_at, last_seen_at, created_at)) AS epoch
     FROM application_sessions WHERE token_hash = $1`,
    [tokenHash(token)],
  );
  return Number(found.rows[0].epoch) * 1000;
}

before(async () => {
  await pool.query(
    `INSERT INTO application_users (username,display_name,password_hash,role)
     VALUES ($1,'Idle Owner',$2,'OWNER')`,
    [USERNAME, await hashPassword(PASSWORD)],
  );
});

after(async () => {
  await app.close();
  await testDb.close();
  await pool.end();
});

describe("idle-expiry pure check (server time, client clocks can't extend)", () => {
  it("idle timeout is exactly 10 minutes", () => {
    assert.equal(SESSION_IDLE_MS, 10 * 60 * 1000);
  });

  it("9m30s idle is still authenticated", () => {
    const now = Date.now();
    assert.equal(isSessionIdleExpired(new Date(now - 9 * 60 * 1000 - 30 * 1000), now), false);
  });

  it("10m01s idle is expired", () => {
    const now = Date.now();
    assert.equal(isSessionIdleExpired(new Date(now - 10 * 60 * 1000 - 1000), now), true);
  });

  it("a future client timestamp never expires the session early", () => {
    const now = Date.now();
    assert.equal(isSessionIdleExpired(new Date(now + 60 * 60 * 1000), now), false);
  });

  it("missing/unparseable activity never expires the session by itself", () => {
    assert.equal(isSessionIdleExpired(null), false);
    assert.equal(isSessionIdleExpired(undefined), false);
    assert.equal(isSessionIdleExpired("not-a-date"), false);
  });
});

describe("server-side idle enforcement (service level)", () => {
  it("a fresh login authenticates and records activity", async () => {
    const { token } = await httpLogin();
    const session = await authService.authenticate(token);
    assert.ok(session, "fresh session authenticates");
    assert.equal(session?.user.username, USERNAME);
  });

  it("ordinary authenticate() calls NEVER advance last_activity_at", async () => {
    const { token } = await httpLogin();
    await backdateActivity(token, 9);
    const before = await lastActivity(token);
    const session = await authService.authenticate(token);
    assert.ok(session, "9-minute-idle session is still valid");
    const afterAt = await lastActivity(token);
    assert.ok(Math.abs(afterAt - before) < 2000, "polling-style reads must not extend the deadline");
  });

  it("an 11-minute-idle session is revoked and rejected", async () => {
    const { token } = await httpLogin();
    await backdateActivity(token, 11);
    assert.equal(await authService.authenticate(token), null);
    const row = await pool.query(`SELECT revoked_at FROM application_sessions WHERE token_hash=$1`, [
      tokenHash(token),
    ]);
    assert.ok(row.rows[0].revoked_at, "idle session is revoked server-side");
    assert.equal(await authService.authenticate(token), null, "revoked token replay stays rejected");
  });

  it("touchActivity extends a live session but not an idle one", async () => {
    const live = await httpLogin();
    await backdateActivity(live.token, 9);
    const touched = await authService.touchActivity(live.token);
    assert.ok(touched?.expiresAt, "genuine activity ping extends the deadline");
    assert.ok((await lastActivity(live.token)) > Date.now() - 30_000);

    const idle = await httpLogin();
    await backdateActivity(idle.token, 11);
    assert.equal(await authService.touchActivity(idle.token), null);
  });
});

describe("idle enforcement over HTTP (S02/S06/S16 shape)", () => {
  it("GET /auth/me on an idle session returns 401 with a strict AUTH_* code", async () => {
    const { cookie, token } = await httpLogin();
    await backdateActivity(token, 11);
    const response = await fetch(`${app.baseUrl}/api/auth/me`, { headers: { cookie } });
    assert.equal(response.status, 401);
    const body = (await response.json()) as { code?: string; error?: string };
    assert.ok(body.code?.startsWith("AUTH_"), `expected AUTH_* code, got ${body.code}`);
    assert.ok(!JSON.stringify(body).toLowerCase().includes("scrypt"), "no credential material leaks");
  });

  it("POST /auth/activity is the only read that extends the deadline", async () => {
    const { cookie, token } = await httpLogin();
    await backdateActivity(token, 9);
    const before = await lastActivity(token);
    const me = await fetch(`${app.baseUrl}/api/auth/me`, { headers: { cookie } });
    assert.equal(me.status, 200);
    assert.ok(Math.abs((await lastActivity(token)) - before) < 2000, "GET /auth/me must not extend");
    const ping = await fetch(`${app.baseUrl}/api/auth/activity`, { method: "POST", headers: { cookie } });
    assert.equal(ping.status, 200);
    assert.ok((await lastActivity(token)) > before + 60_000, "activity ping advances the deadline");
  });

  it("concurrent activity pings are safe and agree (no races)", async () => {
    const { token } = await httpLogin();
    await backdateActivity(token, 9);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => authService.touchActivity(token)),
    );
    assert.ok(results.every(Boolean), "every concurrent ping resolves");
    const expires = new Set(results.map((r) => r?.expiresAt));
    assert.equal(expires.size, 1, "all pings agree on the absolute expiry");
    const session = await authService.authenticate(token);
    assert.ok(session, "session still valid after the ping storm");
  });

  it("a tampered client clock cannot extend the server session", async () => {
    // There is no client-timestamp input anywhere in the session protocol:
    // authenticate/touchActivity use NOW() exclusively. The only Date the
    // client can influence is its own request timing, which this test shows
    // cannot revive an idle session.
    const { token } = await httpLogin();
    await backdateActivity(token, 30);
    assert.equal(await authService.touchActivity(token), null);
    assert.equal(await authService.authenticate(token), null);
  });
});
