/**
 * Settings page backend, HTTP level against the real server + schema.
 *
 * Proves:
 *  - preferences default to en/light with `updatedAt: null` before any save
 *    (so a client can tell "never chosen" from "chose the defaults");
 *  - PATCH persists, is partial (one field does not clobber the other) and
 *    survives a later GET;
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
});
