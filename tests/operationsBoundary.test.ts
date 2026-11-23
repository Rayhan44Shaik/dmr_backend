/**
 * Server-side authorization boundaries for business routers (no DB needed).
 *
 * Proves the role-deny paths with mocked identities. Financial approvals,
 * status changes, imports and destructive operations are OWNER-only; reads
 * and field-entry mutations stay open to the roles whose module boundary
 * already allows them.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { accountsBoundary, fleetBoundary, operationsSensitiveBoundary, operationsTripsBoundary } =
  await import("../src/middleware/businessBoundary.js");

type Role = "OWNER" | "FULL_ACCESS" | "OFFICE" | "COLLECTION" | "SUPERVISOR" | "AUDIT" | "INVALID";
const DENIED_ROLES: Role[] = ["FULL_ACCESS", "OFFICE", "COLLECTION", "SUPERVISOR", "AUDIT", "INVALID"];

function mockRes(role: Role | null) {
  const res: Record<string, unknown> = {
    locals:
      role === null
        ? {}
        : {
            authUser: {
              id: 7,
              username: "case-user",
              displayName: "Case User",
              role,
              employeeId: 11,
            },
          },
  };
  return res as never;
}

function mockReq(method: string, path: string) {
  return { method, path, query: {}, body: {} } as never;
}

async function run(
  middleware: (req: never, res: never, next: (err?: unknown) => void) => unknown,
  role: Role | null,
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

const OWNER_ONLY_FLEET_ROUTES: Array<[string, string]> = [
  ["POST", "/maintenance/12/approve"],
  ["POST", "/maintenance/12/reject"],
  ["DELETE", "/maintenance/12"],
  ["DELETE", "/maintenance/12/documents/3"],
  ["PUT", "/permits/4/Insurance"],
  ["PUT", "/permits/4/Insurance/"],
  ["PUT", "/PERMITS/4/INSURANCE"],
  ["DELETE", "/permits/4/Insurance"],
  ["POST", "/emis"],
  ["PUT", "/emis/9"],
  ["DELETE", "/emis/9"],
  ["POST", "/emis/9/pay"],
];

const OWNER_ONLY_OPERATION_ROUTES: Array<[string, string]> = [
  ["POST", "/rate-entry/9/lock"],
  ["POST", "/expenses/manual/5/approve"],
  ["DELETE", "/expenses/manual/5"],
  ["PATCH", "/collections/5/status"],
  ["DELETE", "/collections/5"],
  ["POST", "/collection-entry/9/approve"],
  ["POST", "/collection-entry/9/reject"],
  ["PATCH", "/collection-entry/9/status"],
  ["DELETE", "/collection-entry/9"],
  ["DELETE", "/collection-entry/pending/9"],
  ["POST", "/collection-entry/import"],
  ["POST", "/collection-entry/bulk-approve"],
  ["POST", "/collection-entry/bulk-approve/"],
  ["POST", "/COLLECTION-ENTRY/BULK-APPROVE"],
  ["POST", "/rate-entry/9/lock/"],
  ["POST", "/Rate-Entry/9/Lock"],
  ["POST", "/shop-rates"],
  ["PUT", "/shop-rates/5"],
  ["PATCH", "/shop-rates/5/status"],
  ["DELETE", "/shop-rates/5"],
  ["POST", "/shop-sales/5/approve"],
  ["POST", "/shop-sales/5/reject"],
  ["PUT", "/shop-sales/5"],
  ["PUT", "/shop-sales/trip/5/deliveries"],
  ["PUT", "/shop-sales/trip/5/load/2"],
  ["PATCH", "/shop-sales/5/status"],
  ["DELETE", "/shop-sales/5"],
  ["POST", "/fuel-expenses/5/approve"],
  ["POST", "/fuel-expenses/5/reject"],
  ["DELETE", "/fuel-expenses/5"],
];

describe("OWNER-only business routes", () => {
  for (const [method, path] of OWNER_ONLY_FLEET_ROUTES) {
    it(`fleet ${method} ${path}: OWNER passes, every other role is denied`, async () => {
      assert.equal((await run(fleetBoundary, "OWNER", method, path)).passed, true);
      for (const role of DENIED_ROLES) {
        const result = await run(fleetBoundary, role, method, path);
        assert.equal(result.passed, false, `${role} ${method} ${path} must be denied`);
        assert.equal(result.status, 403, `${role} ${method} ${path}`);
      }
    });
  }

  for (const [method, path] of OWNER_ONLY_OPERATION_ROUTES) {
    it(`operations ${method} ${path}: OWNER passes, every other role is denied`, async () => {
      assert.equal((await run(operationsSensitiveBoundary, "OWNER", method, path)).passed, true);
      for (const role of DENIED_ROLES) {
        const result = await run(operationsSensitiveBoundary, role, method, path);
        assert.equal(result.passed, false, `${role} ${method} ${path} must be denied`);
        assert.equal(result.status, 403, `${role} ${method} ${path}`);
      }
    });
  }

  it("rejects unauthenticated requests with 401", async () => {
    assert.equal((await run(operationsSensitiveBoundary, null, "DELETE", "/collections/5")).status, 401);
    assert.equal((await run(fleetBoundary, null, "PUT", "/permits/4/Insurance")).status, 401);
  });
});

describe("field entry remains available to its intended roles", () => {
  it("collection entry may create and edit drafts but not approve/import/delete", async () => {
    assert.equal((await run(operationsSensitiveBoundary, "COLLECTION", "POST", "/collection-entry")).passed, true);
    assert.equal((await run(operationsSensitiveBoundary, "COLLECTION", "PUT", "/collection-entry/9")).passed, true);
    assert.equal((await run(operationsSensitiveBoundary, "COLLECTION", "PUT", "/collections/9")).passed, true);
    assert.equal((await run(operationsSensitiveBoundary, "COLLECTION", "POST", "/collection-entry/import")).status, 403);
    assert.equal((await run(operationsSensitiveBoundary, "COLLECTION", "POST", "/collection-entry/bulk-approve")).status, 403);
  });

  it("office may enter manual and fuel expenses but not approve or delete them", async () => {
    assert.equal((await run(operationsSensitiveBoundary, "OFFICE", "POST", "/expenses/manual")).passed, true);
    assert.equal((await run(operationsSensitiveBoundary, "OFFICE", "PUT", "/expenses/manual/5")).passed, true);
    assert.equal((await run(operationsSensitiveBoundary, "OFFICE", "POST", "/fuel-expenses")).passed, true);
    assert.equal((await run(operationsSensitiveBoundary, "OFFICE", "PUT", "/fuel-expenses/5")).passed, true);
    assert.equal((await run(operationsSensitiveBoundary, "OFFICE", "DELETE", "/fuel-expenses/5")).status, 403);
    assert.equal((await run(operationsSensitiveBoundary, "OFFICE", "POST", "/expenses/manual/5/approve")).status, 403);
  });

  it("supervisor maintenance entry stays open; permits/EMI writes do not", async () => {
    assert.equal((await run(fleetBoundary, "SUPERVISOR", "POST", "/maintenance")).passed, true);
    assert.equal((await run(fleetBoundary, "SUPERVISOR", "PUT", "/maintenance/12")).passed, true);
    assert.equal((await run(fleetBoundary, "SUPERVISOR", "PUT", "/permits/4/Insurance")).status, 403);
    assert.equal((await run(fleetBoundary, "SUPERVISOR", "POST", "/emis")).status, 403);
    assert.equal((await run(fleetBoundary, "SUPERVISOR", "PUT", "/emis/9")).status, 403);
  });

  it("reads stay open to all linked roles", async () => {
    for (const role of ["FULL_ACCESS", "OFFICE", "COLLECTION", "SUPERVISOR", "AUDIT"] as Role[]) {
      assert.equal((await run(fleetBoundary, role, "GET", "/maintenance")).passed, true, role);
      assert.equal((await run(fleetBoundary, role, "GET", "/emis/9/schedule")).passed, true, role);
      assert.equal((await run(operationsSensitiveBoundary, role, "GET", "/collections")).passed, true, role);
      assert.equal((await run(operationsSensitiveBoundary, role, "GET", "/shop-sales")).passed, true, role);
    }
  });
});

describe("accountsBoundary: payments and farm payments", () => {
  for (const [method, path] of [
    ["POST", "/payments"],
    ["PUT", "/payments/5"],
    ["DELETE", "/payments/5"],
    ["PUT", "/farm-payments"],
  ] as Array<[string, string]>) {
    it(`${method} ${path}: OWNER passes, every other role is denied`, async () => {
      assert.equal((await run(accountsBoundary, "OWNER", method, path)).passed, true);
      for (const role of DENIED_ROLES) {
        assert.equal((await run(accountsBoundary, role, method, path)).status, 403, role);
      }
    });
  }

  it("reads stay open", async () => {
    assert.equal((await run(accountsBoundary, "SUPERVISOR", "GET", "/payments")).passed, true);
    assert.equal((await run(accountsBoundary, "AUDIT", "GET", "/payments")).passed, true);
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
