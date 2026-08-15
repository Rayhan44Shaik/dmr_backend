/**
 * Backend tests for the five master Bulk Import endpoints:
 *   POST /api/masters/{shops|vehicles|employees|farms|bird-types}/bulk
 *
 * Runs the real Express app against a real PostgreSQL engine (PGlite WASM
 * behind the pg-gateway wire-protocol server) — no mocks.
 */
import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { getJson, postJson, startApp, type TestApp } from "./helpers/app.js";
import {
  applySchema,
  countRows,
  resetMasters,
  startTestDb,
  type TestDb,
} from "./helpers/testDb.js";

// ---------------------------------------------------------------------------
// Boot the test database + real app once for the whole file.
// ---------------------------------------------------------------------------

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });
const baseUrl = app.baseUrl;

const { pool } = await import("../src/config/db.js");

after(async () => {
  await app.close();
  await testDb.close();
  await pool.end();
});

beforeEach(async () => {
  await resetMasters();
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface SuccessBody {
  total: number;
  successful: number;
  failed: number;
  errors: unknown[];
  created: Array<Record<string, unknown>>;
}

interface ErrorDetails {
  total: number;
  successful: number;
  failed: number;
  errors: Array<{ row: number; field: string; message: string }>;
}

async function bulkOk(rows: unknown[], endpoint: string): Promise<SuccessBody> {
  const { status, body } = await postJson(baseUrl, endpoint, rows);
  assert.equal(status, 201, `expected 201, got ${status}: ${JSON.stringify(body)}`);
  return body as SuccessBody;
}

async function expectBulkError(
  rows: unknown,
  endpoint: string,
  expectedStatus: number
): Promise<{ body: { error: string; details: ErrorDetails } }> {
  const { status, body } = await postJson(baseUrl, endpoint, rows);
  assert.equal(
    status,
    expectedStatus,
    `expected ${expectedStatus}, got ${status}: ${JSON.stringify(body)}`
  );
  assert.equal(typeof body.error, "string");
  assert.ok(body.details && Array.isArray(body.details.errors), "details.errors missing");
  return { body };
}

interface SuiteOptions {
  name: string;
  endpoint: string;
  singularPath: string;
  listPath: string;
  table: string;
  noField: string;
  requiredField: string;
  makeValid: (n: number) => Record<string, unknown>;
  invalidTypeRow: Record<string, unknown>;
  invalidStatusRow: Record<string, unknown>;
  invalidPhoneRow: Record<string, unknown> | null;
  invalidDateRow: Record<string, unknown> | null;
  /** Passes application validation but violates a database constraint. */
  dbViolationRow: Record<string, unknown>;
  /** Historical/obsolete frontend fields — must be ignored, never persisted. */
  legacyRow: Record<string, unknown>;
  /** Row with CSV-style numeric strings that must be accepted. */
  numericStringRow: Record<string, unknown> | null;
  numericStringExpect: (created: Record<string, unknown>) => void;
}

const suites: SuiteOptions[] = [
  {
    name: "shops",
    endpoint: "/api/masters/shops/bulk",
    singularPath: "/api/masters/shops",
    listPath: "/api/masters/shops",
    table: "shops",
    noField: "shopNo",
    requiredField: "shopName",
    makeValid: (n) => ({
      shopName: `Shop ${n}`,
      ownerName: `Owner ${n}`,
      phoneNumber: `9000000${String(n).padStart(3, "0")}`,
      village: "Village",
      address: "Address",
      status: "Active",
    }),
    invalidTypeRow: { shopName: "Type Test", village: { not: "a string" } },
    invalidStatusRow: { shopName: "Status Test", status: "Bogus" },
    invalidPhoneRow: { shopName: "Phone Test", phoneNumber: "not-a-phone" },
    invalidDateRow: null,
    dbViolationRow: { shopName: "X".repeat(300) }, // VARCHAR(200) → 22001
    // openingBalance is a real, persisted shop column (masterValidation.ts) —
    // use a field that is genuinely never persisted to test the "ignores
    // unknown fields" contract.
    legacyRow: { shopName: "Legacy Shop", closingBalance: 8888, oldSpreadsheetRef: "XYZ-1" },
    numericStringRow: null,
    numericStringExpect: () => {},
  },
  {
    name: "vehicles",
    endpoint: "/api/masters/vehicles/bulk",
    singularPath: "/api/masters/vehicles",
    listPath: "/api/masters/vehicles",
    table: "vehicles",
    noField: "vehicleNo",
    requiredField: "vehicleNumber",
    makeValid: (n) => ({
      vehicleNumber: `AP39AB${String(n).padStart(4, "0")}`,
      vehicleType: "Lorry",
      noOfBoxes: 85,
      birdCapacity: 5000,
      capacityKg: 6000,
      trackingId: `T${n}`,
      fastagBank: "HDFC",
      engineNumber: `E${n}`,
      chassisNumber: `C${n}`,
      insuranceExpiry: "2026-12-31",
      permitExpiry: "2026-11-30",
      fitnessExpiry: "2026-10-15",
      purchaseDate: "2024-01-15",
      purchaseAmount: 1500000,
      emiStartDate: "2024-02-01",
      rcDate: "2024-01-20",
      status: "Active",
    }),
    invalidTypeRow: { vehicleNumber: "AP39TYPE", noOfBoxes: "eighty-five" },
    invalidStatusRow: { vehicleNumber: "AP39STATUS", status: "Sold" },
    invalidPhoneRow: null,
    invalidDateRow: { vehicleNumber: "AP39DATE", insuranceExpiry: "not-a-date" },
    dbViolationRow: { vehicleNumber: "AP39OVER", purchaseAmount: 1e14 }, // NUMERIC(14,2) → 22003
    // emiDay/totalEMIs are real, persisted vehicle columns now — use fields
    // that are genuinely never persisted to test the "ignores unknown
    // fields" contract.
    legacyRow: { vehicleNumber: "AP39LEGACY", oldFleetCode: "FC-1", odometerLegacy: 12345 },
    numericStringRow: { vehicleNumber: "AP39STR", noOfBoxes: "90", capacityKg: "7000.5" },
    numericStringExpect: (c) => {
      assert.equal(c.noOfBoxes, 90);
      assert.equal(c.capacityKg, 7000.5);
    },
  },
  {
    name: "employees",
    endpoint: "/api/masters/employees/bulk",
    singularPath: "/api/masters/employees",
    listPath: "/api/masters/employees",
    table: "employees",
    noField: "employeeNo",
    requiredField: "employeeName",
    makeValid: (n) => ({
      employeeName: `Employee ${n}`,
      department: "Driver",
      role: "Driver",
      // Fixed-width template (7 + 3 digits = 10 total) — padStart(2, ...)
      // silently produced an 11-digit number for any n >= 100 (test 12 uses
      // n=100), failing the exactly-10-digits validation.
      phoneNumber: `9888800${String(n).padStart(3, "0")}`,
      email: `emp${n}@example.com`,
      address: "Address",
      joiningDate: "2025-01-10",
      aadharNumber: `123456789${String(n).padStart(3, "0")}`,
      licenseNumber: `L${n}`,
      salary: 25000,
      status: "Active",
    }),
    invalidTypeRow: { employeeName: "Type Test", salary: "not-a-number" },
    invalidStatusRow: { employeeName: "Status Test", status: "Fired" },
    invalidPhoneRow: { employeeName: "Phone Test", phoneNumber: "abc123" },
    invalidDateRow: { employeeName: "Date Test", joiningDate: "2024-99-99" },
    dbViolationRow: { employeeName: "Overflow", salary: 1e13 }, // NUMERIC(12,2) → 22003
    legacyRow: { employeeName: "Legacy Employee", basicSalary: 1, pfNumber: "PF1" },
    numericStringRow: { employeeName: "String Num", salary: "30000" },
    numericStringExpect: (c) => {
      assert.equal(c.salary, 30000);
    },
  },
  {
    name: "farms",
    endpoint: "/api/masters/farms/bulk",
    singularPath: "/api/masters/farms",
    listPath: "/api/masters/farms",
    table: "farms",
    noField: "farmNo",
    requiredField: "farmName",
    makeValid: (n) => ({
      farmName: `Farm ${n}`,
      ownerName: `Owner ${n}`,
      supervisorName: `Supervisor ${n}`,
      // Fixed-width template (7 + 3 digits = 10 total) — padStart(2, ...)
      // silently produced an 11-digit number for any n >= 100 (test 12 uses
      // n=100), failing the exactly-10-digits validation.
      phoneNumber: `9777700${String(n).padStart(3, "0")}`,
      village: "Village",
      address: "Address",
      capacity: 20000,
      status: "Active",
    }),
    invalidTypeRow: { farmName: "Type Test", capacity: "twenty-thousand" },
    invalidStatusRow: { farmName: "Status Test", status: "Closed" },
    invalidPhoneRow: { farmName: "Phone Test", phoneNumber: "xyz" },
    invalidDateRow: null,
    dbViolationRow: { farmName: "Overflow", capacity: 1e13 }, // INTEGER → 22003
    legacyRow: { farmName: "Legacy Farm", openingBalance: 42 },
    numericStringRow: { farmName: "String Num", capacity: "1200" },
    numericStringExpect: (c) => {
      assert.equal(c.capacity, 1200);
    },
  },
  {
    name: "bird-types",
    endpoint: "/api/masters/bird-types/bulk",
    singularPath: "/api/masters/bird-types",
    listPath: "/api/masters/bird-types",
    table: "bird_types",
    noField: "birdTypeNo",
    requiredField: "birdType",
    makeValid: (n) => ({
      birdType: `Bird Type ${n}`,
      averageWeight: 2.5,
      description: "Description",
      status: "Active",
    }),
    invalidTypeRow: { birdType: "Type Test", averageWeight: "two-point-five" },
    invalidStatusRow: { birdType: "Status Test", status: "Unknown" },
    invalidPhoneRow: null,
    invalidDateRow: null,
    dbViolationRow: { birdType: "Overflow", averageWeight: 1e10 }, // NUMERIC(10,3) → 22003
    legacyRow: { birdType: "Legacy Type", birdTypeCode: "BT-1" },
    numericStringRow: { birdType: "String Num", averageWeight: "2.75" },
    numericStringExpect: (c) => {
      assert.equal(c.averageWeight, 2.75);
    },
  },
];

// ---------------------------------------------------------------------------
// The suites
// ---------------------------------------------------------------------------

for (const s of suites) {
  describe(`POST ${s.endpoint}`, () => {
    it("1. accepts a valid single-row batch and returns the batch result", async () => {
      const body = await bulkOk([s.makeValid(1)], s.endpoint);

      // Response structure
      assert.deepEqual(
        Object.keys(body).sort(),
        ["created", "errors", "failed", "successful", "total"]
      );
      assert.equal(body.total, 1);
      assert.equal(body.successful, 1);
      assert.equal(body.failed, 0);
      assert.deepEqual(body.errors, []);
      assert.equal(body.created.length, 1);

      const row = body.created[0];
      assert.equal(typeof row.id, "number");
      assert.equal(typeof row[s.noField], "number");
      assert.ok((row[s.requiredField] as string).length > 0);

      // Reachable through the existing list endpoint
      const list = await getJson(baseUrl, s.listPath);
      assert.equal(list.status, 200);
      assert.equal(list.body.length, 1);
    });

    it("2. accepts a valid multi-row batch and inserts every row", async () => {
      const body = await bulkOk([s.makeValid(1), s.makeValid(2), s.makeValid(3)], s.endpoint);
      assert.equal(body.total, 3);
      assert.equal(body.successful, 3);
      assert.equal(body.failed, 0);
      assert.equal(body.created.length, 3);
      assert.equal(await countRows(s.table), 3);
    });

    it("3. rejects an empty array with 400", async () => {
      const { body } = await expectBulkError([], s.endpoint, 400);
      assert.match(body.error, /at least one row/i);
      assert.equal(await countRows(s.table), 0);
    });

    it("4. rejects a non-array request body with 400", async () => {
      const { body } = await expectBulkError({ rows: [s.makeValid(1)] }, s.endpoint, 400);
      assert.match(body.error, /array/i);
      assert.equal(await countRows(s.table), 0);
    });

    it("5. rejects a row missing the required field with 400 and useful details", async () => {
      const bad = s.makeValid(1);
      delete bad[s.requiredField];
      const { body } = await expectBulkError([s.makeValid(1), bad], s.endpoint, 400);
      const err = body.details.errors.find((e) => e.field === s.requiredField);
      assert.ok(err, `expected an error for ${s.requiredField}: ${JSON.stringify(body)}`);
      assert.equal(err.row, 2);
      assert.match(err.message, /required/i);
      assert.equal(body.details.failed, 1);
      assert.equal(body.details.total, 2);
      assert.equal(await countRows(s.table), 0);
    });

    it("6. rejects an invalid data type with 400", async () => {
      const { body } = await expectBulkError([s.invalidTypeRow], s.endpoint, 400);
      assert.equal(body.details.errors[0].row, 1);
      assert.ok(body.details.errors[0].field.length > 0);
      assert.equal(await countRows(s.table), 0);
    });

    it("7. rejects an invalid status value with 400", async () => {
      const { body } = await expectBulkError([s.invalidStatusRow], s.endpoint, 400);
      assert.equal(body.details.errors[0].field, "status");
      assert.match(body.details.errors[0].message, /Active|Inactive/);
      assert.equal(await countRows(s.table), 0);
    });

    if (s.invalidPhoneRow) {
      it("8. rejects an invalid phone number with 400", async () => {
        const { body } = await expectBulkError([s.invalidPhoneRow], s.endpoint, 400);
        assert.equal(body.details.errors[0].field, "phoneNumber");
        assert.match(body.details.errors[0].message, /phone/i);
        assert.equal(await countRows(s.table), 0);
      });
    }

    if (s.invalidDateRow) {
      it("9. rejects an invalid date with 400", async () => {
        const { body } = await expectBulkError([s.invalidDateRow], s.endpoint, 400);
        assert.match(body.details.errors[0].message, /date/i);
        assert.equal(await countRows(s.table), 0);
      });
    }

    it("10. rejects duplicate rows inside the uploaded batch with 409", async () => {
      const { body } = await expectBulkError([s.makeValid(1), s.makeValid(1)], s.endpoint, 409);
      assert.equal(body.details.errors[0].row, 2);
      assert.match(body.details.errors[0].message, /duplicates row 1/i);
      assert.equal(await countRows(s.table), 0);
    });

    it("11. rejects duplicated master numbers inside the batch with 409", async () => {
      const a = { ...s.makeValid(1), [s.noField]: 7 };
      const b = { ...s.makeValid(2), [s.noField]: 7 };
      const { body } = await expectBulkError([a, b], s.endpoint, 409);
      assert.equal(body.details.errors[0].field, s.noField);
      assert.equal(body.details.errors[0].row, 2);
      assert.equal(await countRows(s.table), 0);
    });

    it("12. rejects conflicts with existing database records with 409", async () => {
      // Seed an existing record through the untouched singular endpoint.
      const seeded = await postJson(baseUrl, s.singularPath, s.makeValid(100));
      assert.equal(seeded.status, 201);
      const existingNo = seeded.body[s.noField] as number;
      assert.equal(await countRows(s.table), 1);

      const { body } = await expectBulkError(
        [s.makeValid(1), { ...s.makeValid(2), [s.noField]: existingNo }],
        s.endpoint,
        409
      );
      assert.equal(body.details.errors[0].field, s.noField);
      assert.equal(body.details.errors[0].row, 2);
      assert.match(body.details.errors[0].message, /already exists/i);
      assert.equal(body.details.failed, 1);
      assert.equal(await countRows(s.table), 1);
    });

    it("13. rolls back the whole batch when any row is invalid, then imports all valid rows", async () => {
      // STEP 13 contract: Row 3 invalid → HTTP error and NO rows inserted.
      const invalid = s.makeValid(3);
      delete invalid[s.requiredField];
      const { body } = await expectBulkError(
        [s.makeValid(1), s.makeValid(2), invalid, s.makeValid(4)],
        s.endpoint,
        400
      );
      assert.equal(body.details.errors[0].row, 3);
      assert.equal(await countRows(s.table), 0, "no rows may be inserted on failure");

      // Then all valid → success and ALL rows inserted.
      const ok = await bulkOk([s.makeValid(1), s.makeValid(2), s.makeValid(3), s.makeValid(4)], s.endpoint);
      assert.equal(ok.total, 4);
      assert.equal(ok.successful, 4);
      assert.equal(ok.failed, 0);
      assert.equal(await countRows(s.table), 4);
    });

    it("14. rolls back the transaction when a database constraint fails mid-batch", async () => {
      const { body } = await expectBulkError(
        [s.makeValid(1), s.dbViolationRow],
        s.endpoint,
        422
      );
      assert.equal(body.details.successful, 0);
      assert.equal(await countRows(s.table), 0, "first row must be rolled back too");
    });

    it("15. auto-assigns master numbers when omitted and never collides with provided ones", async () => {
      const body = await bulkOk(
        [s.makeValid(1), { ...s.makeValid(2), [s.noField]: 10 }, s.makeValid(3)],
        s.endpoint
      );
      const nos = body.created.map((r) => r[s.noField] as number);
      assert.equal(nos[1], 10);
      assert.equal(nos.filter((n) => n === 10).length, 1, "provided number used exactly once");
      assert.equal(new Set(nos).size, 3, "auto-assigned numbers must be unique");
      assert.equal(await countRows(s.table), 3);
    });

    if (s.numericStringRow) {
      it("16. accepts CSV-style numeric strings", async () => {
        const body = await bulkOk([s.numericStringRow], s.endpoint);
        s.numericStringExpect(body.created[0]);
        assert.equal(await countRows(s.table), 1);
      });
    }

    it("17. ignores unknown/obsolete fields instead of persisting them", async () => {
      const body = await bulkOk([s.legacyRow], s.endpoint);
      const row = body.created[0];
      const legacyKeys = Object.keys(s.legacyRow).filter(
        (k) => k !== s.requiredField
      );
      for (const key of legacyKeys) {
        assert.ok(!(key in row), `obsolete field ${key} must not be persisted`);
      }
      const list = await getJson(baseUrl, s.listPath);
      const stored = list.body[0];
      for (const key of legacyKeys) {
        assert.ok(!(key in stored), `obsolete field ${key} must not be in the DB`);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Existing singular CRUD must keep working unchanged (regression check)
// ---------------------------------------------------------------------------

describe("existing singular master CRUD regression", () => {
  it("POST/PUT/DELETE still work for all five masters", async () => {
    for (const s of suites) {
      // create
      const created = await postJson(baseUrl, s.singularPath, s.makeValid(1));
      assert.equal(created.status, 201);
      const id = created.body.id as number;
      assert.equal(typeof id, "number");

      // update (a real edit always carries the full record incl. master no)
      const updatedRow = { ...s.makeValid(2), [s.noField]: created.body[s.noField] };
      const updatedRes = await fetch(`${baseUrl}${s.singularPath}/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updatedRow),
      });
      assert.equal(updatedRes.status, 200);
      const updatedBody: Record<string, unknown> = await updatedRes.json();
      assert.equal(updatedBody.id, id);
      assert.equal(updatedBody[s.requiredField], updatedRow[s.requiredField]);

      // delete — every master's singular DELETE is a soft delete
      // (status -> 'Inactive'; see mastersService.ts deleteShop/deleteVehicle/
      // deleteEmployee/deleteFarm/deleteBirdType), preserving the row for
      // historical/referential integrity rather than removing it. The row
      // count therefore stays 1, not 0; the delete is verified by re-reading
      // the row's status.
      const deleted = await fetch(`${baseUrl}${s.singularPath}/${id}`, { method: "DELETE" });
      assert.equal(deleted.status, 200);
      assert.equal(await countRows(s.table), 1, "soft-delete preserves the row");
      const statusCheck = await pool.query(
        `SELECT status FROM ${s.table} WHERE id = $1`,
        [id]
      );
      assert.equal(statusCheck.rows[0]?.status, "Inactive", "soft-deleted row must be Inactive");
    }
  });

  it("singular endpoints remain reachable and unaffected by the new /bulk routes", async () => {
    for (const s of suites) {
      const res = await postJson(baseUrl, s.singularPath, {});
      // The existing upsert endpoints accept partial bodies; just verify no
      // 404/route shadowing was introduced by the new /bulk routes.
      assert.notEqual(res.status, 404);
    }
  });
});
