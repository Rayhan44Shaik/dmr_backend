/**
 * MFA (TOTP) lifecycle over HTTP: enroll → confirm → challenged login →
 * verify → session; plus replay, recovery, throttle, disable, admin reset,
 * and password-change step-up. Live TOTP codes are computed with the same
 * RFC 6238 implementation the server uses (vectors proven in mfaTotp.test.ts).
 *
 * Requires MFA_SECRET_KEY in the server environment (set below before boot).
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";
import { startApp, type TestApp } from "./helpers/app.js";

process.env.MFA_SECRET_KEY = "aa".repeat(32);

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });

const { pool } = await import("../src/config/db.js");
const { hashPassword } = await import("../src/utils/passwordHash.js");
const { base32Decode, totpCode } = await import("../src/services/authService.js");

const PASSWORD = "Mfa-lifecycle-test-123!";
let ownerCookie = "";
let ownerId = 0;
let supervisorCookie = "";
let supervisorId = 0;

async function api(method: string, path: string, cookie: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`${app.baseUrl}${path}`, init);
  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = { _raw: text };
  }
  return { response, json };
}

async function login(username: string, password: string) {
  return api("POST", "/api/auth/login", "", { username, password });
}

before(async () => {
  const employees = await pool.query(
    `INSERT INTO employees (employee_no,employee_name,department,role,status)
     VALUES (92001,'Mfa Sup','Operations','Supervisor','Active') RETURNING id`,
  );
  const hash = await hashPassword(PASSWORD);
  const users = await pool.query(
    `INSERT INTO application_users (username,display_name,password_hash,role,employee_id)
     VALUES ('mfa-owner','Mfa Owner',$1,'OWNER',NULL),
            ('mfa-sup','Mfa Sup',$1,'SUPERVISOR',$2) RETURNING id, username`,
    [hash, employees.rows[0].id],
  );
  for (const row of users.rows as Array<{ id: number; username: string }>) {
    if (row.username === "mfa-owner") ownerId = row.id;
    else supervisorId = row.id;
  }
  ownerCookie = (
    await login("mfa-owner", PASSWORD)
  ).response.headers.get("set-cookie")?.split(";")[0] ?? "";
  supervisorCookie = (
    await login("mfa-sup", PASSWORD)
  ).response.headers.get("set-cookie")?.split(";")[0] ?? "";
  assert.ok(ownerCookie && supervisorCookie);
});

after(async () => {
  await app.close();
  await testDb.close();
  await pool.end();
});

describe("enrollment", () => {
  it("issues provisioning material once, then requires disable before re-enroll", async () => {
    const first = await api("POST", "/api/auth/mfa/enroll", ownerCookie);
    assert.equal(first.response.status, 200);
    assert.ok(typeof first.json.secret === "string" && (first.json.secret as string).length >= 16);
    assert.ok(String(first.json.otpauthUrl).startsWith("otpauth://totp/"));
    assert.ok(!JSON.stringify(first.json).toLowerCase().includes("password"));
    const pending = await api("POST", "/api/auth/mfa/enroll", ownerCookie);
    assert.equal(pending.response.status, 200, "pending secret may be replaced before activation");
  });

  it("rejects confirmation with a wrong code and accepts a live code", async () => {
    assert.equal((await api("POST", "/api/auth/mfa/confirm", ownerCookie, { code: "000000" })).response.status, 401);
    const enroll = await api("POST", "/api/auth/mfa/enroll", ownerCookie);
    const secret = base32Decode(String(enroll.json.secret));
    const done = await api("POST", "/api/auth/mfa/confirm", ownerCookie, { code: totpCode(secret) });
    assert.equal(done.response.status, 200);
    assert.ok(Array.isArray(done.json.recoveryCodes) && (done.json.recoveryCodes as unknown[]).length === 10);
    const status = await api("GET", "/api/auth/mfa/status", ownerCookie);
    assert.equal((status.json as { enabled: boolean }).enabled, true);
    const again = await api("POST", "/api/auth/mfa/enroll", ownerCookie);
    assert.equal(again.response.status, 409, "active factor cannot be silently replaced");
  });
});

describe("challenged login and ticket verification", () => {
  it("password success yields a ticket, not a session", async () => {
    const attempt = await login("mfa-owner", PASSWORD);
    assert.equal(attempt.response.status, 200);
    assert.equal(attempt.json.mfaRequired, true);
    assert.ok(typeof attempt.json.mfaTicket === "string");
    assert.equal(attempt.json.token, undefined, "no session before the second factor");
    // The ticket is not a session credential.
    const me = await fetch(`${app.baseUrl}/api/auth/me`, {
      headers: { cookie: `dmr_session=${String(attempt.json.mfaTicket)}` },
    });
    assert.equal(me.status, 401);
  });

  it("wrong codes fail; the live code creates the session; replay dies", async () => {
    const attempt = await login("mfa-owner", PASSWORD);
    const ticket = String(attempt.json.mfaTicket);
    assert.equal((await api("POST", "/api/auth/mfa/verify", "", { ticket, code: "000000" })).response.status, 401);
    const stored = await pool.query(`SELECT secret_enc FROM mfa_factors WHERE user_id=$1`, [ownerId]);
    const { decryptMfaSecret } = await import("../src/services/authService.js");
    const code = totpCode(decryptMfaSecret(String(stored.rows[0].secret_enc)));
    const good = await api("POST", "/api/auth/mfa/verify", "", { ticket, code });
    assert.equal(good.response.status, 200);
    const verifiedCookie=good.response.headers.get("set-cookie")?.split(";")[0]??"";
    assert.ok(verifiedCookie.startsWith("dmr_session="));
    assert.match(good.response.headers.get("set-cookie")??"",/HttpOnly/i);
    const me = await fetch(`${app.baseUrl}/api/auth/me`, {
      headers: { cookie: verifiedCookie },
    });
    assert.equal(me.status, 200);
    const replay = await api("POST", "/api/auth/mfa/verify", "", { ticket, code: totpCode(decryptMfaSecret(String(stored.rows[0].secret_enc))) });
    assert.equal(replay.response.status, 401, "consumed ticket cannot be replayed");
  });

  it("recovery codes work once and then die", async () => {
    // Fresh factor on the supervisor account keeps owner state untouched.
    const enroll = await api("POST", "/api/auth/mfa/enroll", supervisorCookie);
    const { decryptMfaSecret } = await import("../src/services/authService.js");
    void decryptMfaSecret;
    const secret = base32Decode(String(enroll.json.secret));
    const confirm = await api("POST", "/api/auth/mfa/confirm", supervisorCookie, { code: totpCode(secret) });
    const codes = confirm.json.recoveryCodes as string[];
    const attempt = await login("mfa-sup", PASSWORD);
    const ticket = String(attempt.json.mfaTicket);
    const used = await api("POST", "/api/auth/mfa/verify", "", { ticket, code: codes[0] });
    assert.equal(used.response.status, 200);
    const attempt2 = await login("mfa-sup", PASSWORD);
    const replay = await api("POST", "/api/auth/mfa/verify", "", {
      ticket: String(attempt2.json.mfaTicket),
      code: codes[0],
    });
    assert.equal(replay.response.status, 401, "recovery codes are single-use");
  });

  it("repeated bad verifies are throttled with 429", async () => {
    const attempt = await login("mfa-owner", PASSWORD);
    const ticket = String(attempt.json.mfaTicket);
    let limited = 0;
    for (let i = 0; i < 12; i++) {
      const r = await api("POST", "/api/auth/mfa/verify", "", { ticket, code: "000000" });
      if (r.response.status === 429) limited++;
      else assert.equal(r.response.status, 401);
    }
    assert.ok(limited >= 1, "verify attempts are rate limited");
  });
});

describe("password-change step-up and disable/admin reset", () => {
  // Order matters: the password-change test below revokes every owner session
  // (by design), so the admin-reset test — which still needs the original
  // ownerCookie — runs first.
  it("disable requires proof; admin reset is OWNER-only", async () => {
    assert.equal((await api("POST", "/api/auth/mfa/disable", supervisorCookie, { code: "000000" })).response.status, 401);
    assert.equal((await api("POST", `/api/auth/mfa/reset/${ownerId}`, supervisorCookie)).response.status, 403);
    assert.equal((await api("POST", `/api/auth/mfa/reset/${supervisorId}`, ownerCookie)).response.status, 204);
    const status = await api("GET", "/api/auth/mfa/status", supervisorCookie);
    assert.equal((status.json as { enabled: boolean }).enabled, false);
    const plain = await login("mfa-sup", PASSWORD);
    assert.equal(plain.json.mfaRequired, undefined, "login is unchallenged after reset");
    assert.ok((plain.response.headers.get("set-cookie")??"").includes("HttpOnly"));
  });

  it("password change without a live TOTP is rejected while MFA is active", async () => {
    const denied = await api("POST", "/api/auth/change-password", ownerCookie, {
      currentPassword: PASSWORD,
      newPassword: "Mfa-changed-password-123!",
    });
    assert.equal(denied.response.status, 401);
    const stored = await pool.query(`SELECT secret_enc FROM mfa_factors WHERE user_id=$1`, [ownerId]);
    const { decryptMfaSecret } = await import("../src/services/authService.js");
    const allowed = await api("POST", "/api/auth/change-password", ownerCookie, {
      currentPassword: PASSWORD,
      newPassword: "Mfa-changed-password-123!",
      totpCode: totpCode(decryptMfaSecret(String(stored.rows[0].secret_enc))),
    });
    assert.equal(allowed.response.status, 204);
    assert.equal((await login("mfa-owner", "Mfa-changed-password-123!")).json.mfaRequired, true);
  });
});
