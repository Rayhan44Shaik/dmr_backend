/**
 * Server-side authorization boundaries for business routers (no DB needed).
 *
 * Proves the role-deny paths with mocked identities:
 *  - fleet approvals/deletes, permit writes, EMI finance writes: OWNER or
 *    SENIOR_ACCOUNT only (SUPERVISOR gets 403)
 *  - accounts payments writes + farm-payment updates: OWNER/SENIOR only
 *  - rate-entry lock: OWNER/SENIOR only (draft saves stay open)
 *  - reads and field-entry mutations stay open to linked roles
 *
 * Trip-ownership paths (requireTripAccess) need the database and are covered
 * by backend/tests/routeProtection.test.ts on a supported Node version.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { accountsBoundary, fleetBoundary, operationsSensitiveBoundary, operationsTripsBoundary } =
  await import("../src/middleware/businessBoundary.js");

type Role = "OWNER" | "SENIOR_ACCOUNT" | "SUPERVISOR";

function mockRes(role: Role) {
  const res: Record<string, unknown> = {
    locals: {
      authUser: { id: 7, username: "case-user", displayName: "Case User", role, employeeId: 11 },
    },
  };
  return res as never;
}

function mockReq(method: string, path: string) {
  return { method, path, query: {}, body: {} } as never;
}

async function run(
  middleware: (req: never, res: never, next: (err?: unknown) => void) => unknown,
  role: Role,
  method: string,
  path: string,
): Promise<{ passed: boolean; status?: number }> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (err?: unknown) => {
      if (settled) return;
      settled = true;
      const status = (err as { status?: number } | undefined)?.status;
      resolve(status ? { passed: false, status } : { passed: true });
    };
    try {
      const out = middleware(mockReq(method, path), mockRes(role), done) as unknown;
      if (out instanceof Promise) {
        out.then(
          () => done(),
          (err: unknown) => done(err),
        );
      }
    } catch (err) {
      done(err);
    }
  });
}

describe("fleetBoundary: approvals, deletes, permits, EMI finance", () => {
  for (const [method, path] of [
    ["POST", "/maintenance/12/approve"],
    ["POST", "/maintenance/12/reject"],
    ["DELETE", "/maintenance/12"],
    ["DELETE", "/maintenance/12/documents/3"],
    ["PUT", "/permits/4/Insurance"],
    ["DELETE", "/permits/4/Insurance"],
    ["POST", "/emis"],
    ["PUT", "/emis/9"],
    ["DELETE", "/emis/9"],
    ["POST", "/emis/9/pay"],
  ] as Array<[string, string]>) {
    it(`SUPERVISOR ${method} ${path} → 403`, async () => {
      const result = await run(fleetBoundary, "SUPERVISOR", method, path);
      assert.equal(result.passed, false);
      assert.equal(result.status, 403);
    });
    it(`OWNER ${method} ${path} passes`, async () => {
      assert.equal((await run(fleetBoundary, "OWNER", method, path)).passed, true);
    });
    it(`SENIOR_ACCOUNT ${method} ${path} passes`, async () => {
      assert.equal((await run(fleetBoundary, "SENIOR_ACCOUNT", method, path)).passed, true);
    });
  }

  it("SUPERVISOR maintenance entry (POST/PUT) stays open for field reporting", async () => {
    assert.equal((await run(fleetBoundary, "SUPERVISOR", "POST", "/maintenance")).passed, true);
    assert.equal((await run(fleetBoundary, "SUPERVISOR", "PUT", "/maintenance/12")).passed, true);
  });

  it("reads stay open to all linked roles", async () => {
    assert.equal((await run(fleetBoundary, "SUPERVISOR", "GET", "/maintenance")).passed, true);
    assert.equal((await run(fleetBoundary, "SUPERVISOR", "GET", "/emis/9/schedule")).passed, true);
  });
});

describe("accountsBoundary: payments and farm payments", () => {
  for (const [method, path] of [
    ["POST", "/payments"],
    ["PUT", "/payments/5"],
    ["DELETE", "/payments/5"],
    ["PUT", "/farm-payments"],
  ] as Array<[string, string]>) {
    it(`SUPERVISOR ${method} ${path} → 403`, async () => {
      const result = await run(accountsBoundary, "SUPERVISOR", method, path);
      assert.equal(result.passed, false);
      assert.equal(result.status, 403);
    });
  }

  it("reads stay open; OWNER writes pass", async () => {
    assert.equal((await run(accountsBoundary, "SUPERVISOR", "GET", "/payments")).passed, true);
    assert.equal((await run(accountsBoundary, "OWNER", "POST", "/payments")).passed, true);
    assert.equal((await run(accountsBoundary, "SENIOR_ACCOUNT", "PUT", "/farm-payments")).passed, true);
  });
});

describe("operationsSensitiveBoundary: rate-entry lock", () => {
  it("SUPERVISOR lock → 403; OWNER/SENIOR pass; draft save stays open", async () => {
    const denied = await run(operationsSensitiveBoundary, "SUPERVISOR", "POST", "/rate-entry/9/lock");
    assert.equal(denied.passed, false);
    assert.equal(denied.status, 403);
    assert.equal(
      (await run(operationsSensitiveBoundary, "OWNER", "POST", "/rate-entry/9/lock")).passed,
      true,
    );
    assert.equal(
      (await run(operationsSensitiveBoundary, "SUPERVISOR", "PUT", "/rate-entry/9")).passed,
      true,
    );
  });
});

describe("operationsTripsBoundary: non-trip paths pass through untouched", () => {
  it("leaves /dashboard, /collections and /rate-entry reads alone", async () => {
    for (const path of ["/dashboard", "/collections", "/rate-entry", "/fuel-expenses"]) {
      assert.equal(
        (await run(operationsTripsBoundary, "SUPERVISOR", "GET", path)).passed,
        true,
        path,
      );
    }
  });
});
