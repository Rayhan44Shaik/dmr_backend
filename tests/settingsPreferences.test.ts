/**
 * Settings page backend, HTTP level against the real server + schema.
 *
 * Proves:
 *  - preferences default to en/light with `updatedAt: null` before any save
 *    (so a client can tell "never chosen" from "chose the defaults");
 *  - PATCH persists, is partial (one field does not clobber the other) and
 *    survives a later GET — including the numeric font scale (70–150, 10%
 *    steps);
 *  - rejects unknown fields and out-of-vocabulary values;
 *  - preferences are strictly self-scoped: another user sees their own row;
 *  - every role may reach /settings, but the employee directory stays gated;
 *  - the access directory returns whole-filtered-set summary counts alongside
 *    the page, consistent with the page total and carrying the password /
 *    MFA columns the Settings table renders.
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

const SECOND_USERNAME = "settings-supervisor";
const SECOND_PASSWORD = "Settings-supervisor-123!";
const FULL_USERNAME = "settings-full-access";
const FULL_PASSWORD = "Settings-full-access-123!";

const owner = app.authHeaders.cookie;

async function call(
  path: string,
  init: { method: string; cookie?: string; body?: unknown },
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {};
  if (init.cookie) headers.cookie = init.cookie;
  let body: string | undefined;
  if (init.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  const response = await fetch(`${app.baseUrl}${path}`, { method: init.method, headers, body });
  const text = await response.text();
  let parsed: any = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { _raw: text };
  }
  return { status: response.status, body: parsed };
}

async function login(username: string, password: string): Promise<string> {
  const response = await fetch(`${app.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(response.status, 200, "login should succeed");
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

before(async () => {
  const employee = await pool.query(
    `INSERT INTO employees (employee_no, employee_name, department, status, phone_number)
     VALUES (9001, 'Settings Supervisor', 'Operations', 'Active', '9000000001') RETURNING id`,
  );
  await pool.query(
    `INSERT INTO application_users (username, display_name, password_hash, role, employee_id, access_status, active)
     VALUES ($1, 'Settings Supervisor', $2, 'SUPERVISOR', $3, 'ACTIVE', TRUE)`,
    [SECOND_USERNAME, await hashPassword(SECOND_PASSWORD), employee.rows[0].id],
  );
  const fullEmployee = await pool.query(
    `INSERT INTO employees (employee_no, employee_name, department, status, phone_number)
     VALUES (9002, 'Settings Full Access', 'Office', 'Active', '9000000002') RETURNING id`,
  );
  await pool.query(
    `INSERT INTO application_users (username, display_name, password_hash, role, employee_id, access_status, active)
     VALUES ($1, 'Settings Full Access', $2, 'FULL_ACCESS', $3, 'ACTIVE', TRUE)`,
    [FULL_USERNAME, await hashPassword(FULL_PASSWORD), fullEmployee.rows[0].id],
  );
});

after(async () => {
  await app.close();
  await testDb.close();
  await pool.end();
});

describe("preferences defaults and persistence", () => {
  it("returns defaults with updatedAt null before anything is saved", async () => {
    const { status, body } = await call("/api/settings/preferences", { method: "GET", cookie: owner });
    assert.equal(status, 200);
    assert.equal(body.language, "en");
    assert.equal(body.theme, "light");
    assert.equal(body.fontScale, 100);
    assert.equal(body.updatedAt, null);
  });

  it("persists a partial update without clobbering the other field", async () => {
    const first = await call("/api/settings/preferences", {
      method: "PATCH",
      cookie: owner,
      body: { theme: "dark" },
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.theme, "dark");
    assert.equal(first.body.language, "en");
    assert.ok(first.body.updatedAt, "a saved preference reports when it changed");

    const second = await call("/api/settings/preferences", {
      method: "PATCH",
      cookie: owner,
      body: { language: "te" },
    });
    assert.equal(second.status, 200);
    assert.equal(second.body.language, "te");
    assert.equal(second.body.theme, "dark", "theme survives a language-only update");

    const read = await call("/api/settings/preferences", { method: "GET", cookie: owner });
    assert.equal(read.body.language, "te");
    assert.equal(read.body.theme, "dark");

    const third = await call("/api/settings/preferences", {
      method: "PATCH",
      cookie: owner,
      body: { fontScale: 110 },
    });
    assert.equal(third.status, 200);
    assert.equal(third.body.fontScale, 110);
    assert.equal(third.body.language, "te", "language survives a font-scale-only update");
    assert.equal(third.body.theme, "dark", "theme survives a font-scale-only update");

    const reread = await call("/api/settings/preferences", { method: "GET", cookie: owner });
    assert.equal(reread.body.fontScale, 110, "the font scale survives a later GET");
  });

  it("rejects unknown fields and values outside the vocabulary", async () => {
    const unknown = await call("/api/settings/preferences", {
      method: "PATCH",
      cookie: owner,
      body: { theme: "dark", userId: 1 },
    });
    assert.equal(unknown.status, 400);

    const badValue = await call("/api/settings/preferences", {
      method: "PATCH",
      cookie: owner,
      body: { language: "fr" },
    });
    assert.equal(badValue.status, 400);

    const empty = await call("/api/settings/preferences", { method: "PATCH", cookie: owner, body: {} });
    assert.equal(empty.status, 400);

    // Font scale must sit on the 70–150 / 10% vocabulary — no 105, no 200.
    const offStep = await call("/api/settings/preferences", {
      method: "PATCH",
      cookie: owner,
      body: { fontScale: 105 },
    });
    assert.equal(offStep.status, 400);

    const outOfRange = await call("/api/settings/preferences", {
      method: "PATCH",
      cookie: owner,
      body: { fontScale: 200 },
    });
    assert.equal(outOfRange.status, 400);

    const wrongType = await call("/api/settings/preferences", {
      method: "PATCH",
      cookie: owner,
      body: { fontScale: "large" },
    });
    assert.equal(wrongType.status, 400);
  });

  it("keeps preferences self-scoped across users", async () => {
    const secondCookie = await login(SECOND_USERNAME, SECOND_PASSWORD);
    const mine = await call("/api/settings/preferences", { method: "GET", cookie: secondCookie });
    assert.equal(mine.status, 200);
    assert.equal(mine.body.updatedAt, null, "the other user has no saved preferences");
    assert.equal(mine.body.language, "en");

    await call("/api/settings/preferences", {
      method: "PATCH",
      cookie: secondCookie,
      body: { language: "te", theme: "dark" },
    });
    const ownerAgain = await call("/api/settings/preferences", { method: "GET", cookie: owner });
    assert.equal(ownerAgain.body.language, "te");
    const stored = await pool.query(`SELECT COUNT(*)::int AS n FROM user_preferences`);
    assert.equal(stored.rows[0].n, 2, "each user keeps their own row");
  });

  it("requires authentication", async () => {
    const anonymous = await call("/api/settings/preferences", { method: "GET" });
    assert.equal(anonymous.status, 401);
  });
});

describe("role boundary around settings", () => {
  it("lets every authenticated role reach their own preferences", async () => {
    const supervisorCookie = await login(SECOND_USERNAME, SECOND_PASSWORD);
    const ok = await call("/api/settings/preferences", { method: "GET", cookie: supervisorCookie });
    assert.equal(ok.status, 200);
  });

  it("keeps the employee access directory owner/full-access only", async () => {
    const supervisorCookie = await login(SECOND_USERNAME, SECOND_PASSWORD);
    const denied = await call("/api/access-management/employees", {
      method: "GET",
      cookie: supervisorCookie,
    });
    assert.equal(denied.status, 403);
  });
});

describe("access directory summary", () => {
  it("returns whole-set counts with the password and MFA columns", async () => {
    const { status, body } = await call("/api/access-management/employees?page=1&pageSize=10", {
      method: "GET",
      cookie: owner,
    });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.rows));
    assert.ok(body.rows.every((row: any) => row.employee_id != null), "every access row has a stable employee identity");
    assert.ok(body.rows.every((row: any) => row.role !== "OWNER"), "protected OWNER accounts are not employee-access rows");
    assert.equal(
      new Set(body.rows.map((row: any) => String(row.employee_id))).size,
      body.rows.length,
      "employee row keys are unique",
    );
    assert.ok(body.summary, "summary counts are returned with the page");
    assert.equal(Number(body.summary.total), Number(body.total));
    assert.equal(
      Number(body.summary.active) + Number(body.summary.paused) + Number(body.summary.revoked) + Number(body.summary.notGranted),
      Number(body.summary.total),
      "status buckets add up to the filtered total",
    );

    const row = body.rows.find((r: any) => r.username === SECOND_USERNAME);
    assert.ok(row, "the granted employee appears in the directory");
    assert.equal(row.access_status, "ACTIVE");
    assert.equal(row.must_change_password, false);
    assert.equal(row.mfa_enabled, false);
    assert.ok("last_password_reset_at" in row, "password last-changed is available");
    // last_access_change_at is opt-in since the UI dropped the column:
    // absent by default, present when the client asks for it.
    assert.ok(!("last_access_change_at" in row), "access last-changed is omitted by default");
    const withAccessChange = await call("/api/access-management/employees?page=1&pageSize=10&lastAccessChange=true", {
      method: "GET",
      cookie: owner,
    });
    const rowWithAccessChange = withAccessChange.body.rows.find((r: any) => r.username === SECOND_USERNAME);
    assert.ok(rowWithAccessChange, "the granted employee appears with the opt-in flag");
    assert.ok("last_access_change_at" in rowWithAccessChange, "access last-changed is available on opt-in");
    assert.ok(body.summary.total >= 1);
  });

  it("summary follows the active filters", async () => {
    const filtered = await call("/api/access-management/employees?page=1&pageSize=10&search=nothing-matches-zzz", {
      method: "GET",
      cookie: owner,
    });
    assert.equal(filtered.status, 200);
    assert.equal(Number(filtered.body.summary.total), 0);
    assert.equal(filtered.body.rows.length, 0);
  });

  it("owner can pause and resume an employee-linked account", async () => {
    const directory = await call(`/api/access-management/employees?page=1&pageSize=10&search=${SECOND_USERNAME}`, {
      method: "GET",
      cookie: owner,
    });
    const row = directory.body.rows.find((item: any) => item.username === SECOND_USERNAME);
    assert.ok(row?.user_id, "test employee login is available");

    const employeeCookie = await login(SECOND_USERNAME, SECOND_PASSWORD);
    const paused = await call(`/api/access-management/${row.user_id}/access`, {
      method: "POST",
      cookie: owner,
      body: { action: "PAUSE" },
    });
    assert.equal(paused.status, 200);
    assert.equal(paused.body.access_status, "PAUSED");
    const existingSession = await call("/api/settings/preferences", { method: "GET", cookie: employeeCookie });
    assert.equal(existingSession.status, 401, "pausing immediately invalidates an existing session");
    const pausedLogin = await call("/api/auth/login", {
      method: "POST",
      body: { username: SECOND_USERNAME, password: SECOND_PASSWORD },
    });
    assert.equal(pausedLogin.status, 403);
    assert.equal(pausedLogin.body.code, "ACCESS_PAUSED");

    const resumed = await call(`/api/access-management/${row.user_id}/access`, {
      method: "POST",
      cookie: owner,
      body: { action: "RESUME" },
    });
    assert.equal(resumed.status, 200);
    assert.equal(resumed.body.access_status, "ACTIVE");
  });

  it("wrong password reveal is validation failure and never expires the owner session", async () => {
    const directory = await call(`/api/access-management/employees?page=1&pageSize=10&search=${SECOND_USERNAME}`, {
      method: "GET",
      cookie: owner,
    });
    const row = directory.body.rows.find((item: any) => item.username === SECOND_USERNAME);
    const denied = await call(`/api/access-management/${row.user_id}/reveal-password`, {
      method: "POST",
      cookie: owner,
      body: { actorPassword: "definitely-wrong" },
    });
    assert.equal(denied.status, 422);
    assert.equal(denied.body.code, "REAUTH_FAILED");
    const stillSignedIn = await call("/api/auth/me", { method: "GET", cookie: owner });
    assert.equal(stillSignedIn.status, 200);
  });

  it("view password never rotates an employee-chosen password", async () => {
    const lowercasePassword = "lowercase@dmr123";
    const originalCookie = await login(SECOND_USERNAME, SECOND_PASSWORD);
    const changed = await call("/api/auth/change-password", {
      method: "POST",
      cookie: originalCookie,
      body: { currentPassword: SECOND_PASSWORD, newPassword: lowercasePassword },
    });
    assert.equal(changed.status, 204, "a lowercase password must be stored exactly as entered");

    const directory = await call(`/api/access-management/employees?page=1&pageSize=10&search=${SECOND_USERNAME}`, {
      method: "GET",
      cookie: owner,
    });
    const row = directory.body.rows.find((item: any) => item.username === SECOND_USERNAME);
    assert.ok(row?.user_id);

    const denied = await call(`/api/access-management/${row.user_id}/reveal-password`, {
      method: "POST",
      cookie: owner,
      body: { actorPassword: "Test-only-password-123!" },
    });
    assert.equal(denied.status, 409);
    assert.equal(denied.body.code, "PASSWORD_NOT_REVEALABLE");

    // Most importantly, the read attempt did not change the credential.
    const employeeCookie = await login(SECOND_USERNAME, lowercasePassword);
    assert.ok(employeeCookie);
  });

  it("FULL_ACCESS manages lower roles but cannot manage or create FULL_ACCESS peers", async () => {
    const fullCookie = await login(FULL_USERNAME, FULL_PASSWORD);
    const directory = await call(`/api/access-management/employees?page=1&pageSize=10`, {
      method: "GET",
      cookie: fullCookie,
    });
    const supervisor = directory.body.rows.find((item: any) => item.username === SECOND_USERNAME);
    const peer = directory.body.rows.find((item: any) => item.username === FULL_USERNAME);
    assert.ok(supervisor?.user_id && peer?.user_id);

    const pauseLower = await call(`/api/access-management/${supervisor.user_id}/access`, {
      method: "POST",
      cookie: fullCookie,
      body: { action: "PAUSE" },
    });
    assert.equal(pauseLower.status, 200);
    await call(`/api/access-management/${supervisor.user_id}/access`, {
      method: "POST",
      cookie: fullCookie,
      body: { action: "RESUME" },
    });

    const pausePeer = await call(`/api/access-management/${peer.user_id}/access`, {
      method: "POST",
      cookie: fullCookie,
      body: { action: "PAUSE" },
    });
    assert.equal(pausePeer.status, 403);
    const promote = await call(`/api/access-management/${supervisor.user_id}/role`, {
      method: "PATCH",
      cookie: fullCookie,
      body: { role: "FULL_ACCESS" },
    });
    assert.equal(promote.status, 403);
  });
});
