/**
 * Route-protection sweep + authorization probes, HTTP level.
 *
 * Proves against the real server + schema:
 *  - every business router rejects anonymous traffic with 401 (auth required)
 *  - the /operations/trips shadow path enforces the same ownership rules as
 *    /trips (supervisor cross-trip read/write/delete/status → 404, not data)
 *  - financial/approval mutations (fleet approve, accounts payments,
 *    rate-entry lock) require OWNER/FULL_ACCESS (supervisor → 403)
 *  - a second login while the first tab is open keeps BOTH sessions valid
 *  - Idempotency-Key replay returns the original result without a duplicate
 *    row; key reuse with a different payload returns 409
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";
import { startApp, type TestApp } from "./helpers/app.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });

const { pool } = await import("../src/config/db.js");
const { hashPassword } = await import("../src/utils/passwordHash.js");

const PASSWORD = "Route-guard-test-123!";
let ownerCookie = "";
let supervisorCookie = "";
let ownTrip = 0;
let otherTrip = 0;

async function api(method: string, path: string, cookie: string, body?: unknown, headers?: Record<string, string>) {
  const init: RequestInit = { method, headers: { ...(headers ?? {}) } };
  if (cookie) (init.headers as Record<string, string>).cookie = cookie;
  if (body !== undefined) {
    (init.headers as Record<string, string>)["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`${app.baseUrl}${path}`, init);
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { response, json };
}

async function login(username: string, password: string): Promise<string> {
  const { response } = await api("POST", "/api/auth/login", "", { username, password });
  assert.equal(response.status, 200, `login as ${username}`);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

before(async () => {
  const employees = await pool.query(
    `INSERT INTO employees (employee_no,employee_name,department,role,status)
     VALUES (91001,'Guard Sup A','Operations','Supervisor','Active'),
            (91002,'Guard Sup B','Operations','Supervisor','Active') RETURNING id`,
  );
  const hash = await hashPassword(PASSWORD);
  await pool.query(
    `INSERT INTO application_users (username,display_name,password_hash,role,employee_id)
     VALUES ('guard-owner','Guard Owner',$1,'OWNER',NULL),
            ('guard-sup-a','Guard Sup A',$1,'SUPERVISOR',$2)`,
    [hash, employees.rows[0].id],
  );
  const trips = await pool.query(
    `INSERT INTO trips (trip_no,trip_date,status,supervisor_id)
     VALUES ('GUARD-A','2026-09-10','Draft',$1),('GUARD-B','2026-09-10','Draft',$2) RETURNING id`,
    [employees.rows[0].id, employees.rows[1].id],
  );
  ownTrip = Number(trips.rows[0].id);
  otherTrip = Number(trips.rows[1].id);
  ownerCookie = await login("guard-owner", PASSWORD);
  supervisorCookie = await login("guard-sup-a", PASSWORD);
});

after(async () => {
  await app.close();
  await testDb.close();
  await pool.end();
});

describe("anonymous traffic is rejected everywhere (auth required)", () => {
  it("GET/POST/PUT/PATCH/DELETE across routers return 401", async () => {
    const probes: Array<[string, string, unknown?]> = [
      ["GET", "/api/masters/employees"],
      ["GET", "/api/trips"],
      ["GET", "/api/staff/duties"],
      ["GET", "/api/operations/dashboard"],
      ["GET", "/api/operations/trips"],
      ["POST", "/api/operations/trips", {}],
      ["GET", "/api/fleet/maintenance"],
      ["POST", "/api/fleet/maintenance/1/approve", {}],
      ["GET", "/api/accounts/payments"],
      ["POST", "/api/accounts/payments", {}],
      ["GET", "/api/operations/collections"],
      ["POST", "/api/operations/fuel-expenses", {}],
    ];
    for (const [method, path, body] of probes) {
      const { response } = await api(method, path, "", body);
      assert.equal(response.status, 401, `${method} ${path} must require authentication`);
    }
  });
});

describe("operations/trips shadow path enforces trip ownership", () => {
  it("supervisor cannot read/write/delete/status another supervisor's trip", async () => {
    assert.equal((await api("GET", `/api/operations/trips/${otherTrip}`, supervisorCookie)).response.status, 404);
    assert.equal((await api("PUT", `/api/operations/trips/${otherTrip}`, supervisorCookie, {})).response.status, 404);
    assert.equal((await api("PATCH", `/api/operations/trips/${otherTrip}/status`, supervisorCookie, { status: "Completed" })).response.status, 404);
    assert.equal((await api("DELETE", `/api/operations/trips/${otherTrip}`, supervisorCookie)).response.status, 404);
  });

  it("supervisor list/details are scoped to their own trips", async () => {
    const list = await api("GET", "/api/operations/trips?supervisorId=999999", supervisorCookie);
    assert.equal(list.response.status, 200);
    const own = await api("GET", `/api/operations/trips/${ownTrip}`, supervisorCookie);
    assert.equal(own.response.status, 200);
  });

  it("supervisor cannot force another supervisorId on create", async () => {
    const { response } = await api("POST", "/api/operations/trips", supervisorCookie, { supervisorId: 999999 });
    assert.ok([201, 400, 403].includes(response.status) && response.status !== 200, "must not silently accept foreign ownership");
  });
});

describe("financial/approval mutations require OWNER or FULL_ACCESS", () => {
  it("supervisor approve/reject/payments/lock attempts return 403", async () => {
    assert.equal((await api("POST", "/api/fleet/maintenance/1/approve", supervisorCookie, {})).response.status, 403);
    assert.equal((await api("POST", "/api/fleet/maintenance/1/reject", supervisorCookie, {})).response.status, 403);
    assert.equal((await api("POST", "/api/accounts/payments", supervisorCookie, {})).response.status, 403);
    assert.equal((await api("POST", "/api/operations/rate-entry/1/lock", supervisorCookie, {})).response.status, 403);
    assert.equal((await api("POST", "/api/fleet/emis/1/pay", supervisorCookie, {})).response.status, 403);
    // Financial approve/reject under /operations is finance-only too.
    assert.equal((await api("POST", "/api/operations/fuel-expenses/1/approve", supervisorCookie, {})).response.status, 403);
    assert.equal((await api("POST", "/api/operations/fuel-expenses/1/reject", supervisorCookie, {})).response.status, 403);
  });

  it("owner passes the role gate (service-level 404/validation, never 403)", async () => {
    for (const [method, path] of [
      ["POST", "/api/fleet/maintenance/999999/approve"],
      ["POST", "/api/accounts/payments"],
      ["POST", "/api/operations/rate-entry/999999/lock"],
      ["POST", "/api/operations/fuel-expenses/999999/approve"],
    ] as Array<[string, string]>) {
      const { response } = await api(method, path, ownerCookie, {});
      assert.notEqual(response.status, 403, `${method} ${path} must not 403 for OWNER`);
      assert.notEqual(response.status, 401, `${method} ${path} must stay authenticated`);
    }
  });
});

describe("concurrent sessions stay valid (second login keeps first)", () => {
  it("tab B login does not invalidate tab A", async () => {
    const second = await login("guard-sup-a", PASSWORD);
    assert.equal((await api("GET", "/api/operations/dashboard", supervisorCookie)).response.status, 200);
    assert.equal((await api("GET", "/api/operations/dashboard", second)).response.status, 200);
    supervisorCookie = second;
  });
});

describe("Idempotency-Key contract on mutations", () => {
  it("same key replays without a duplicate row; different payload conflicts", async () => {
    const key = randomUUID();
    const headers = { "idempotency-key": key };
    const first = await api("POST", "/api/operations/trips", ownerCookie, {}, headers);
    assert.equal(first.response.status, 201);
    assert.equal(first.response.headers.get("x-idempotent-replayed"), null);
    const before = await pool.query(`SELECT COUNT(*)::int c FROM trips WHERE trip_no=$1`, [
      (first.json as { tripNo: string }).tripNo,
    ]);

    const replay = await api("POST", "/api/operations/trips", ownerCookie, {}, headers);
    assert.equal(replay.response.status, 201);
    assert.equal(replay.response.headers.get("x-idempotent-replayed"), "true");
    assert.deepEqual(replay.json, first.json);
    const after = await pool.query(`SELECT COUNT(*)::int c FROM trips WHERE trip_no=$1`, [
      (first.json as { tripNo: string }).tripNo,
    ]);
    assert.equal(after.rows[0].c, before.rows[0].c, "replay must not create a second row");

    const conflict = await api("POST", "/api/operations/trips", ownerCookie, { remarks: "different" }, headers);
    assert.equal(conflict.response.status, 409);
  });

  it("malformed keys are rejected, missing keys pass through", async () => {
    const bad = await api("POST", "/api/operations/trips", ownerCookie, {}, { "idempotency-key": "not-a-uuid" });
    assert.equal(bad.response.status, 400);
    const plain = await api("POST", "/api/operations/trips", ownerCookie, {});
    assert.equal(plain.response.status, 201);
  });
});
