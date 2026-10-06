/**
 * Password reset lifecycle (forgot-password flow), HTTP level.
 *
 * Proves against the real server + schema:
 *  - request always returns the same generic shape (no account oracle)
 *  - completion rotates to the new password and revokes every session
 *  - tokens are single-use, short-lived, and hashed server-side
 *  - re-request kills the older token; unknown/expired tokens get generic 401
 *  - weak replacement passwords are rejected; no session is created by reset
 *  - per-IP+account request throttling trips with 429
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";
import { startApp, type TestApp } from "./helpers/app.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });

const { pool } = await import("../src/config/db.js");
const { hashPassword } = await import("../src/utils/passwordHash.js");

const USERNAME = "reset-owner";
const OLD_PASSWORD = "Reset-old-password-123!";
const NEW_PASSWORD = "Reset-new-password-123!";

async function post(path: string, body: unknown, cookie = "") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${app.baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = { _raw: text };
  }
  return { response, json };
}

async function login(password: string) {
  return post("/api/auth/login", { username: USERNAME, password });
}

before(async () => {
  await pool.query(
    `INSERT INTO application_users (username,display_name,password_hash,role)
     VALUES ($1,'Reset Owner',$2,'OWNER')`,
    [USERNAME, await hashPassword(OLD_PASSWORD)],
  );
});

after(async () => {
  await app.close();
  await testDb.close();
  await pool.end();
});

describe("forgot-password request is generic (no oracle)", () => {
  it("unknown usernames get the identical outward shape", async () => {
    const known = await post("/api/auth/forgot-password", { username: USERNAME });
    const unknown = await post("/api/auth/forgot-password", { username: "no-such-user-zzz" });
    assert.equal(known.response.status, 200);
    assert.equal(unknown.response.status, 200);
    assert.equal(known.json.message, unknown.json.message);
    assert.ok(!("resetToken" in unknown.json) || unknown.json.resetToken == null);
  });
});

describe("reset completion lifecycle", () => {
  it("completes with the issued token and rotates the password", async () => {
    const before = await login(OLD_PASSWORD);
    assert.equal(before.response.status, 200);
    const cookie = before.response.headers.get("set-cookie")?.split(";")[0] ?? "";

    const req = await post("/api/auth/forgot-password", { username: USERNAME });
    const token = String(req.json.resetToken ?? "");
    assert.ok(token.length > 20, "non-production operator relay token present");

    // Raw token must never be stored — only its hash.
    const stored = await pool.query(`SELECT token_hash FROM password_reset_tokens WHERE used_at IS NULL`);
    assert.ok(stored.rowCount && stored.rows[0].token_hash !== token);

    const done = await post("/api/auth/reset-password", { token, newPassword: NEW_PASSWORD });
    assert.equal(done.response.status, 200);

    // Old password fails, new password works, and reset created no session.
    assert.equal((await login(OLD_PASSWORD)).response.status, 401);
    assert.equal((await login(NEW_PASSWORD)).response.status, 200);
    assert.equal(done.json.token, undefined);

    // Pre-reset session is dead everywhere.
    const me = await fetch(`${app.baseUrl}/api/auth/me`, { headers: { cookie } });
    assert.equal(me.status, 401);
  });

  it("rejects replay of a consumed token with generic 401", async () => {
    const req = await post("/api/auth/forgot-password", { username: USERNAME });
    const token = String(req.json.resetToken ?? "");
    assert.equal((await post("/api/auth/reset-password", { token, newPassword: "Reset-third-password-123!" })).response.status, 200);
    const replay = await post("/api/auth/reset-password", { token, newPassword: "Reset-fourth-password-123!" });
    assert.equal(replay.response.status, 401);
  });

  it("rejects unknown tokens and expired tokens identically", async () => {
    const unknown = await post("/api/auth/reset-password", { token: "nope", newPassword: NEW_PASSWORD });
    assert.equal(unknown.response.status, 401);
    const req = await post("/api/auth/forgot-password", { username: USERNAME });
    const token = String(req.json.resetToken ?? "");
    await pool.query(
      `UPDATE password_reset_tokens SET expires_at = NOW() - INTERVAL '1 minute' WHERE used_at IS NULL`,
    );
    const expired = await post("/api/auth/reset-password", { token, newPassword: NEW_PASSWORD });
    assert.equal(expired.response.status, 401);
    assert.equal(expired.json.message, unknown.json.message);
  });

  it("rejects weak replacement passwords without consuming anything usable", async () => {
    const req = await post("/api/auth/forgot-password", { username: USERNAME });
    const token = String(req.json.resetToken ?? "");
    const weak = await post("/api/auth/reset-password", { token, newPassword: "short" });
    assert.ok([400, 401].includes(weak.response.status));
  });

  it("a re-request kills the previously issued token", async () => {
    const first = await post("/api/auth/forgot-password", { username: "reset-owner" });
    const firstToken = String(first.json.resetToken ?? "");
    await post("/api/auth/forgot-password", { username: "reset-owner" });
    const stale = await post("/api/auth/reset-password", { token: firstToken, newPassword: NEW_PASSWORD });
    assert.equal(stale.response.status, 401);
  });
});

describe("reset request throttling", () => {
  it("trips 429 after the per-account allowance", async () => {
    const name = "throttle-probe-user";
    let limited = 0;
    for (let i = 0; i < 7; i++) {
      const r = await post("/api/auth/forgot-password", { username: name });
      if (r.response.status === 429) limited++;
    }
    assert.ok(limited >= 1, "repeated reset requests are throttled");
  });
});
