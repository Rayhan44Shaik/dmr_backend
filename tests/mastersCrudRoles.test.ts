/**
 * Batch C4 — DEF-C3-001 regression: singular master create/update/delete.
 *
 * Proves, over real HTTP against the production server:
 *   • OWNER can create, edit and soft-delete a shop, and the canonical
 *     SHOP-###### number is derived on update (the path that used to 500).
 *   • FULL_ACCESS can create, edit and soft-delete a vehicle.
 *   • AUDIT / OFFICE / COLLECTION / SUPERVISOR get 403 on master writes and the
 *     row is unchanged afterwards (denied write = no mutation).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";
import { startApp, type TestApp } from "./helpers/app.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });

const { pool } = await import("../src/config/db.js");
const { hashPassword } = await import("../src/utils/passwordHash.js");

type Role = "OWNER" | "FULL_ACCESS" | "AUDIT" | "OFFICE" | "COLLECTION" | "SUPERVISOR";
const ROLES: Role[] = ["OWNER", "FULL_ACCESS", "AUDIT", "OFFICE", "COLLECTION", "SUPERVISOR"];
const DENIED: Role[] = ["AUDIT", "OFFICE", "COLLECTION", "SUPERVISOR"];
const PASSWORD = "Masters-crud-test-123!";
const cookies = new Map<Role, string>();
const results: Array<Record<string, unknown>> = [];

async function api(method: string, route: string, role: Role, body?: unknown) {
  const headers: Record<string, string> = { cookie: cookies.get(role) ?? "" };
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${app.baseUrl}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  results.push({ method, route, role, status: response.status });
  return { status: response.status, body: json, text };
}

async function login(username: string) {
  const response = await fetch(`${app.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  assert.equal(response.status, 200, `login ${username}: ${await response.text()}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie, `cookie for ${username}`);
  return cookie;
}

function shopPayload(name: string) {
  return {
    shopName: name,
    ownerName: "Owner",
    phoneNumber: `9766${String(Date.now()).slice(-6)}`,
    city: "Hyderabad",
    address: "Address",
    paperRate: 1,
    associationType: "Vencob Vij",
    openingBalance: 0,
    status: "Active",
  };
}

function vehiclePayload(number: string) {
  return {
    vehicleNumber: number,
    vehicleType: "Lorry",
    noOfBoxes: 85,
    birdCapacity: 5000,
    capacityKg: 6000,
    engineNumber: `E-${number}`,
    chassisNumber: `C-${number}`,
    status: "Active",
  };
}

before(async () => {
  const employee = await pool.query(
    `INSERT INTO employees (employee_no,employee_name,department,role,status)
     VALUES ('89001','CRUD Supervisor','Operations','Supervisor','Active') RETURNING id`
  );
  const hash = await hashPassword(PASSWORD);
  for (const role of ROLES) {
    await pool.query(
      `INSERT INTO application_users (username,display_name,password_hash,role,employee_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [`crud-${role.toLowerCase()}`, `CRUD ${role}`, hash, role, role === "SUPERVISOR" ? employee.rows[0].id : null]
    );
    cookies.set(role, await login(`crud-${role.toLowerCase()}`));
  }
});

after(async () => {
  const outDir = process.env.C4_EVIDENCE_DIR;
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, "masters-crud-roles.json"),
      JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)
    );
  }
  await app.close();
  await testDb.close();
  await pool.end();
});

describe("DEF-C3-001 — singular master CRUD", () => {
  it("OWNER creates, edits and soft-deletes a shop with a canonical shop number", async () => {
    const created = await api("POST", "/api/masters/shops", "OWNER", shopPayload("C4 CRUD Shop"));
    assert.equal(created.status, 201, created.text);
    const id = Number(created.body?.id);
    const shopNo = Number(created.body?.shopNo);
    assert.ok(id > 0 && shopNo > 0);
    assert.equal(created.body?.shopNumber, `SHOP-${String(shopNo).padStart(6, "0")}`);

    const updated = await api("PUT", `/api/masters/shops/${id}`, "OWNER", {
      ...shopPayload("C4 CRUD Shop Renamed"),
      shopNo,
      shopNumber: created.body?.shopNumber,
    });
    assert.equal(updated.status, 200, updated.text);
    assert.equal(updated.body?.id, id);
    assert.equal(updated.body?.shopName, "C4 CRUD Shop Renamed");
    assert.equal(
      updated.body?.shopNumber,
      `SHOP-${String(shopNo).padStart(6, "0")}`,
      "update must derive the canonical shop number, not 500"
    );

    const deleted = await api("DELETE", `/api/masters/shops/${id}`, "OWNER");
    assert.equal(deleted.status, 200, deleted.text);
    const row = await pool.query(`SELECT status, shop_number FROM shops WHERE id = $1`, [id]);
    assert.equal(row.rows[0].status, "Inactive", "soft delete preserves the row");
    assert.equal(row.rows[0].shop_number, `SHOP-${String(shopNo).padStart(6, "0")}`);
  });

  it("FULL_ACCESS creates, edits and soft-deletes a vehicle", async () => {
    const number = `AP39CR${String(Date.now()).slice(-4)}`;
    const created = await api("POST", "/api/masters/vehicles", "FULL_ACCESS", vehiclePayload(number));
    assert.equal(created.status, 201, created.text);
    const id = Number(created.body?.id);
    assert.ok(id > 0);

    const updated = await api("PUT", `/api/masters/vehicles/${id}`, "FULL_ACCESS", {
      ...vehiclePayload(number),
      vehicleType: "Truck",
      vehicleNo: created.body?.vehicleNo,
    });
    assert.equal(updated.status, 200, updated.text);
    assert.equal(updated.body?.vehicleType, "Truck");

    const deleted = await api("DELETE", `/api/masters/vehicles/${id}`, "FULL_ACCESS");
    assert.equal(deleted.status, 200, deleted.text);
    const row = await pool.query(`SELECT status FROM vehicles WHERE id = $1`, [id]);
    assert.equal(row.rows[0].status, "Inactive");
  });

  it("denied roles get 403 on master writes and mutate nothing", async () => {
    const created = await api("POST", "/api/masters/shops", "OWNER", shopPayload("C4 Guard Shop"));
    assert.equal(created.status, 201, created.text);
    const id = Number(created.body?.id);
    const original = await pool.query(`SELECT shop_name, shop_no, shop_number, status, updated_at FROM shops WHERE id = $1`, [id]);

    for (const role of DENIED) {
      const put = await api("PUT", `/api/masters/shops/${id}`, role, {
        ...shopPayload(`Hijacked by ${role}`),
        shopNo: 999999,
      });
      assert.equal(put.status, 403, `${role} PUT must be 403, got ${put.status}: ${put.text}`);

      const del = await api("DELETE", `/api/masters/shops/${id}`, role);
      assert.equal(del.status, 403, `${role} DELETE must be 403, got ${del.status}: ${del.text}`);

      const post = await api("POST", "/api/masters/shops", role, shopPayload(`Created by ${role}`));
      assert.equal(post.status, 403, `${role} POST must be 403, got ${post.status}: ${post.text}`);
    }

    const afterAttempts = await pool.query(`SELECT shop_name, shop_no, shop_number, status, updated_at FROM shops WHERE id = $1`, [id]);
    assert.deepEqual(afterAttempts.rows[0], original.rows[0], "denied writes must not change the row");
    const createdByDenied = await pool.query(`SELECT COUNT(*)::int AS c FROM shops WHERE shop_name LIKE 'Created by %' OR shop_name LIKE 'Hijacked by %'`);
    assert.equal(createdByDenied.rows[0].c, 0, "denied requests created or renamed nothing");
  });
});
