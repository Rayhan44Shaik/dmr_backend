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

test("authenticated non-owner cannot mutate Vehicle Master", async () => {
  const { hashPassword } = await import("../src/utils/passwordHash.js");
  const username = "vehicle-supervisor";
  await pool.query(
    `INSERT INTO application_users (username,display_name,password_hash,role)
     VALUES ($1,'Vehicle Accountant',$2,'FULL_ACCESS')`,
    [username, await hashPassword("Supervisor-test-password-123!")],
  );
  const login = await fetch(`${app.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "Supervisor-test-password-123!" }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  const response = await fetch(`${app.baseUrl}/api/masters/vehicles`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(entities.find((entity) => entity.name === "vehicles")!.body(900)),
  });
  assert.equal(response.status, 403);
  assert.match(JSON.stringify(await response.json()), /owner access/i);
  assert.equal((await pool.query("SELECT COUNT(*)::int total FROM vehicles")).rows[0].total, 0);
});
