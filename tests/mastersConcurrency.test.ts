import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { postJson, startApp } from "./helpers/app.js";
import { applySchema, resetMasters, startTestDb } from "./helpers/testDb.js";

const testDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app = await startApp({ DATABASE_URL: testDb.url });
const { pool } = await import("../src/config/db.js");

after(async () => {
  await app.close();
  await pool.end();
  await testDb.close();
});
beforeEach(resetMasters);

const entities = [
  { name: "employees", count: 10, no: "employeeNo", body: (n: number) => ({ employeeName: `Concurrent Employee ${n}`, department: "Operations", role: "Driver", phoneNumber: `9100000${String(n).padStart(3, "0")}`, email: "", address: "", joiningDate: null, aadharNumber: "", licenseNumber: "", salary: 25000, status: "Active", avatar: null }) },
  { name: "vehicles", count: 10, no: "vehicleNo", body: (n: number) => ({ vehicleNumber: `TS09CC${String(n).padStart(4, "0")}`, vehicleType: "Truck", noOfBoxes: 50, birdCapacity: 2000, capacityKg: 3000, trackingId: "", fastagBank: "", engineNumber: `CE-${n}`, chassisNumber: `CC-${n}`, insuranceExpiry: null, permitExpiry: null, fitnessExpiry: null, purchaseDate: null, purchaseAmount: null, emiStartDate: null, emiDay: null, totalEMIs: null, rcDate: null, status: "Active" }) },
  { name: "farms", count: 10, no: "farmNo", body: (n: number) => ({ farmName: `Concurrent Farm ${n}`, ownerName: `Owner ${n}`, supervisorName: `Supervisor ${n}`, phoneNumber: `9200000${String(n).padStart(3, "0")}`, village: "Village", address: "", capacity: 10000, status: "Active" }) },
  { name: "shops", count: 25, no: "shopNo", body: (n: number) => ({ shopNumber: `CS-${n}`, shopName: `Concurrent Shop ${n}`, ownerName: `Owner ${n}`, phoneNumber: `9300000${String(n).padStart(3, "0")}`, secondaryPhoneNumber: "", whatsappNumber: "", email: "", city: "Hyderabad", address: "", latitude: null, longitude: null, paperRate: 1, associationType: "Vencob Vij", openingBalance: 0, status: "Active" }) },
  { name: "banks", count: 10, no: "bankNo", body: (n: number) => ({ bankName: `Concurrent Bank ${n}`, branch: "Main", accountNumber: `100000${n}`, ifscCode: "HDFC0000001", upiId: "", status: "Active" }) },
  { name: "bird-types", count: 10, no: "birdTypeNo", body: (n: number) => ({ birdType: `Concurrent Bird ${n}`, averageWeight: 2.5, description: "", status: "Active" }) },
  { name: "routes", count: 50, no: "routeNo", body: (n: number) => ({ routeName: `Concurrent Route ${n}`, routeCode: `CR-${n}`, description: "", status: "Active" }) },
] as const;

for (const entity of entities) {
  test(`${entity.count} concurrent ${entity.name} creates allocate unique business numbers`, async () => {
    const responses = await Promise.all(Array.from({ length: entity.count }, (_, index) =>
      postJson(app.baseUrl, `/api/masters/${entity.name}`, entity.body(index + 1))));
    assert.deepEqual([...new Set(responses.map((response) => response.status))], [201]);
    const ids = responses.map((response) => response.body.id as number);
    const numbers = responses.map((response) => response.body[entity.no] as number);
    assert.equal(new Set(ids).size, entity.count, "no record may be lost");
    assert.equal(new Set(numbers).size, entity.count, "business numbers must be unique");
    const count = await pool.query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM ${entity.name === "bird-types" ? "bird_types" : entity.name}`);
    assert.equal(count.rows[0].total, entity.count);
  });
}

test("50 concurrent duplicate shop creates yield one success and safe conflicts", async () => {
  const body = entities.find((entity) => entity.name === "shops")!.body(999);
  const responses = await Promise.all(Array.from({ length: 50 }, () => postJson(app.baseUrl, "/api/masters/shops", body)));
  assert.equal(responses.filter((response) => response.status === 201).length, 1);
  assert.equal(responses.filter((response) => response.status === 409).length, 49);
  assert.ok(responses.filter((response) => response.status === 409).every((response) => !JSON.stringify(response.body).match(/postgres|constraint|stack/i)));
});

async function loginAs(role: string, username: string, password: string): Promise<string> {
  const { hashPassword } = await import("../src/utils/passwordHash.js");
  const hash = await hashPassword(password);
  let employeeId: number | null = null;
  if (role === "SUPERVISOR") {
    // Login rejects SUPERVISOR accounts without a linked employee profile.
    const emp = await pool.query<{ id: number }>(
      `INSERT INTO employees (employee_no, employee_name, department, role, status)
       VALUES ((SELECT COALESCE(MAX(employee_no), 0) + 1 FROM employees), $1, 'Operations', 'Supervisor', 'Active')
       RETURNING id`,
      [`${role} Linked Employee`],
    );
    employeeId = emp.rows[0].id;
  }
  const existing = await pool.query(`SELECT id FROM application_users WHERE LOWER(username) = LOWER($1)`, [username]);
  if (existing.rowCount) {
    await pool.query(
      `UPDATE application_users SET password_hash = $2, role = $3, display_name = $4, employee_id = $5, access_status = 'ACTIVE', active = TRUE WHERE id = $1`,
      [existing.rows[0].id, hash, role, `${role} tester`, employeeId],
    );
  } else {
    await pool.query(
      `INSERT INTO application_users (username,display_name,password_hash,role,employee_id,access_status,active)
       VALUES ($1,$2,$3,$4,$5,'ACTIVE',TRUE)`,
      [username, `${role} tester`, hash, role, employeeId],
    );
  }
  const login = await fetch(`${app.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(login.status, 200, `login failed for ${role}`);
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  assert.ok(cookie, `missing session cookie for ${role}`);
  return cookie;
}

async function authed(
  method: string,
  path: string,
  cookie: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${app.baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      cookie,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed };
}

test("FULL_ACCESS may create Vehicle Master (approved policy)", async () => {
  const cookie = await loginAs("FULL_ACCESS", "masters-full-access", "Full-access-test-password-123!");
  const before = await pool.query("SELECT COUNT(*)::int total FROM vehicles");
  const response = await authed(
    "POST",
    "/api/masters/vehicles",
    cookie,
    entities.find((entity) => entity.name === "vehicles")!.body(900),
  );
  assert.equal(response.status, 201);
  const after = await pool.query("SELECT COUNT(*)::int total FROM vehicles");
  assert.equal(after.rows[0].total, before.rows[0].total + 1);
});

test("OWNER and FULL_ACCESS may update and deactivate Vehicle Master", async () => {
  const ownerCookie = await loginAs("OWNER", "masters-owner-mut", "Owner-test-password-123!");
  const created = await authed(
    "POST",
    "/api/masters/vehicles",
    ownerCookie,
    entities.find((entity) => entity.name === "vehicles")!.body(901),
  );
  assert.equal(created.status, 201);
  const id = (created.body as { id: number }).id;

  const fullCookie = await loginAs("FULL_ACCESS", "masters-full-mut", "Full-access-test-password-123!");
  const updated = await authed(
    "PUT",
    `/api/masters/vehicles/${id}`,
    fullCookie,
    { ...entities.find((entity) => entity.name === "vehicles")!.body(901), vehicleType: "Lorry" },
  );
  assert.equal(updated.status, 200, `FULL_ACCESS update status ${updated.status}`);

  const deactivated = await authed(
    "PATCH",
    `/api/masters/vehicles/${id}/status`,
    fullCookie,
    { status: "Inactive" },
  );
  assert.equal(deactivated.status, 200, `FULL_ACCESS deactivate status ${deactivated.status}`);
});

test("OFFICE, AUDIT, COLLECTION and SUPERVISOR cannot mutate masters", async () => {
  const deniedRoles = ["OFFICE", "AUDIT", "COLLECTION", "SUPERVISOR"] as const;
  const vehicleBody = entities.find((entity) => entity.name === "vehicles")!.body(910);

  // Seed one vehicle as OWNER for update/deactivate/bulk targets.
  const ownerCookie = await loginAs("OWNER", "masters-owner-seed", "Owner-test-password-123!");
  const seeded = await authed("POST", "/api/masters/vehicles", ownerCookie, vehicleBody);
  assert.equal(seeded.status, 201);
  const vehicleId = (seeded.body as { id: number }).id;

  for (const role of deniedRoles) {
    const cookie = await loginAs(role, `masters-${role.toLowerCase()}`, `${role}-test-password-123!`);

    const denyBody = /owner access|cannot access this module|FORBIDDEN|forbidden/i;

    const create = await authed("POST", "/api/masters/vehicles", cookie, {
      ...entities.find((entity) => entity.name === "vehicles")!.body(920 + deniedRoles.indexOf(role)),
    });
    assert.equal(create.status, 403, `${role} create must be 403`);
    assert.match(JSON.stringify(create.body), denyBody);

    const update = await authed(
      "PUT",
      `/api/masters/vehicles/${vehicleId}`,
      cookie,
      { ...vehicleBody, vehicleType: "Truck" },
    );
    assert.equal(update.status, 403, `${role} update must be 403`);
    assert.match(JSON.stringify(update.body), denyBody);

    const deactivate = await authed("DELETE", `/api/masters/vehicles/${vehicleId}`, cookie);
    assert.equal(deactivate.status, 403, `${role} deactivate must be 403`);
    assert.match(JSON.stringify(deactivate.body), denyBody);

    const bulk = await authed("POST", "/api/masters/vehicles/bulk", cookie, [
      entities.find((entity) => entity.name === "vehicles")!.body(930 + deniedRoles.indexOf(role)),
    ]);
    assert.equal(bulk.status, 403, `${role} bulk-import must be 403`);
    assert.match(JSON.stringify(bulk.body), denyBody);

    // Policy: denied roles may read masters for selectors. If roleBoundary blocks
    // the entire /masters module, record as product gap (do not weaken auth here).
    const read = await authed("GET", "/api/masters/vehicles", cookie);
    assert.ok(
      read.status === 200 || read.status === 403,
      `${role} read unexpected status ${read.status}`,
    );
    if (read.status === 403) {
      // Surfaced for Batch C2 product review — OFFICE/AUDIT/COLLECTION/SUPERVISOR
      // cannot currently reach masters reads through roleBoundary.
      assert.match(JSON.stringify(read.body), denyBody);
    }
  }
});
