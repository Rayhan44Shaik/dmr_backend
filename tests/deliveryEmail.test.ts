/**
 * Shop Delivery Email — one delivery, one PDF, one email.
 * Trip completion is independent of SMTP success.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { startApp, postJson, getJson, type TestApp } from "./helpers/app.js";
import {
  applySchema,
  markTripCompletedForTests,
  shutdownTestEnv,
  startTestDb,
  type TestDb,
} from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({
  DATABASE_URL: testDb.url,
  SMTP_HOST: "json",
  SMTP_USER: "test@example.com",
  SMTP_PASS: "not-a-secret-for-tests",
  SMTP_FROM: "test@example.com",
});

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");
const { tripsService } = await import("../src/services/tripsService.js");
const { deliveryEmailService, sanitizeAttachmentShopName } = await import(
  "../src/services/deliveryEmailService.js"
);
const { env } = await import("../src/config/env.js");

after(async () => {
  await shutdownTestEnv({ app, testDb, pool });
});

const PDF_B64 = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF").toString("base64");

let seq = 0;
async function seed() {
  seq += 1;
  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: `EMV${String(seq).padStart(4, "0")}`,
    vehicleType: "Lorry",
    noOfBoxes: 85,
    birdCapacity: 5000,
    capacityKg: 6000,
    engineNumber: `EMENG${seq}`,
    chassisNumber: `EMCHS${seq}`,
    status: "Active",
  });
  const driver = await mastersService.upsertEmployee({
    employeeName: `EM Driver ${seq}`,
    department: "Driver",
    role: "Driver",
    phoneNumber: `93130000${String(seq).padStart(2, "0")}`,
    licenseNumber: `EMDL${seq}`,
    salary: 18000,
    status: "Active",
  });
  const supervisor = await mastersService.upsertEmployee({
    employeeName: `EM Supervisor ${seq}`,
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: `94130000${String(seq).padStart(2, "0")}`,
    salary: 24000,
    status: "Active",
  });
  const farm = await mastersService.upsertFarm({
    farmName: `EM Farm ${seq}`,
    ownerName: "Owner",
    supervisorName: "Farm Sup",
    phoneNumber: `96630000${String(seq).padStart(2, "0")}`,
    village: "Village",
    address: "Address",
    capacity: 30000,
    status: "Active",
  });
  const shopA = await mastersService.upsertShop({
    shopName: `Shop Alpha ${seq}`,
    ownerName: "Owner A",
    phoneNumber: `90010000${String(seq).padStart(2, "0")}`,
    village: "Village",
    status: "Active",
    email: `shop-a-${seq}@example.com`,
  });
  const shopB = await mastersService.upsertShop({
    shopName: `Shop Beta ${seq}`,
    ownerName: "Owner B",
    phoneNumber: `91010000${String(seq).padStart(2, "0")}`,
    village: "Village",
    status: "Active",
    email: `shop-b-${seq}@example.com`,
  });
  const shopC = await mastersService.upsertShop({
    shopName: `Shop Gamma ${seq}`,
    ownerName: "Owner C",
    phoneNumber: `92010000${String(seq).padStart(2, "0")}`,
    village: "Village",
    status: "Active",
    email: `shop-c-${seq}@example.com`,
  });
  return { vehicle, driver, supervisor, farm, shopA, shopB, shopC };
}

async function makeTripWithDeliveries(
  shops: { id: number; shopName: string }[],
  opts?: { complete?: boolean }
) {
  const m = await seed();
  const chosen = shops.length
    ? shops
    : [m.shopA, m.shopB, m.shopC];
  const trip = await tripsService.save(null, {
    tripDate: "2026-08-18",
    status: "Draft",
    vehicleId: m.vehicle.id,
    vehicleNo: m.vehicle.vehicleNumber,
    driverId: m.driver.id,
    driverName: m.driver.employeeName,
    supervisorId: m.supervisor.id,
    supervisorName: m.supervisor.employeeName,
    sourceFarmId: m.farm.id,
    sourceFarm: m.farm.farmName,
    openingMeter: 1000,
    startStepSubmitted: true,
    farmStepSubmitted: true,
    pickupStepSubmitted: true,
    boxDetails: [{ boxNo: 1, birds: 100, weight: 200 }],
  } as Record<string, unknown>);

  const saved = await tripsService.save(trip.id, {
    ...trip,
    pickupStepSubmitted: true,
    boxDetails: [{ boxNo: 1, birds: 1000, weight: 4000 }],
    totalBirds: 1000,
    dcWeight: 4000,
  } as Record<string, unknown>);

  const inserted = [];
  for (let i = 0; i < chosen.length; i += 1) {
    const shop = chosen[i];
    const row = await pool.query<{ id: number; shop_id: number; shop_name: string }>(
      `INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, birds, weight, mortality)
       VALUES ($1, $2, $3, $4, $5, $6, 0)
       RETURNING id, shop_id, shop_name`,
      [trip.id, `${saved.tripNo}-S${String(i + 1).padStart(2, "0")}`, shop.id, shop.shopName, 10 + i, 20 + i]
    );
    inserted.push(row.rows[0]);
  }

  if (opts?.complete !== false) {
    await markTripCompletedForTests(trip.id);
  }
  return { masters: m, trip: saved, deliveries: inserted };
}

function emailPath(tripId: number, deliveryId: number) {
  return `/api/trips/${tripId}/deliveries/${deliveryId}/email`;
}

describe("delivery email", () => {
  it("sanitizes attachment shop names", () => {
    assert.equal(sanitizeAttachmentShopName("Shop A/B\\C"), "Shop-ABC");
    assert.ok(!sanitizeAttachmentShopName("../etc/passwd").includes("/"));
  });

  it("rejects a missing trip", async () => {
    const res = await postJson(app.baseUrl, emailPath(999999, 1), { pdfBase64: PDF_B64 });
    assert.equal(res.status, 404);
  });

  it("rejects a missing delivery", async () => {
    const ctx = await makeTripWithDeliveries([]);
    const res = await postJson(app.baseUrl, emailPath(ctx.trip.id, 999999), { pdfBase64: PDF_B64 });
    assert.equal(res.status, 404);
  });

  it("rejects a delivery that belongs to another trip", async () => {
    const a = await makeTripWithDeliveries([]);
    const b = await makeTripWithDeliveries([]);
    const res = await postJson(app.baseUrl, emailPath(a.trip.id, b.deliveries[0].id), {
      pdfBase64: PDF_B64,
    });
    assert.equal(res.status, 422);
  });

  it("rejects a trip that is not Completed", async () => {
    const ctx = await makeTripWithDeliveries([], { complete: false });
    const res = await postJson(app.baseUrl, emailPath(ctx.trip.id, ctx.deliveries[0].id), {
      pdfBase64: PDF_B64,
    });
    assert.equal(res.status, 422);
    const trip = await pool.query(`SELECT status FROM trips WHERE id = $1`, [ctx.trip.id]);
    assert.notEqual(String(trip.rows[0].status), "Completed");
  });

  it("rejects missing shop email", async () => {
    const ctx = await makeTripWithDeliveries([]);
    await pool.query(`UPDATE shops SET email = NULL WHERE id = $1`, [ctx.masters.shopA.id]);
    const res = await postJson(app.baseUrl, emailPath(ctx.trip.id, ctx.deliveries[0].id), {
      pdfBase64: PDF_B64,
    });
    assert.equal(res.status, 422);
  });

  it("rejects invalid shop email", async () => {
    const ctx = await makeTripWithDeliveries([]);
    await pool.query(`UPDATE shops SET email = 'not-an-email' WHERE id = $1`, [
      ctx.masters.shopA.id,
    ]);
    const res = await postJson(app.baseUrl, emailPath(ctx.trip.id, ctx.deliveries[0].id), {
      pdfBase64: PDF_B64,
    });
    assert.equal(res.status, 422);
  });

  it("rejects a missing shop on the delivery", async () => {
    const ctx = await makeTripWithDeliveries([]);
    await pool.query(`UPDATE trip_deliveries SET shop_id = NULL WHERE id = $1`, [
      ctx.deliveries[0].id,
    ]);
    const res = await postJson(app.baseUrl, emailPath(ctx.trip.id, ctx.deliveries[0].id), {
      pdfBase64: PDF_B64,
    });
    assert.equal(res.status, 422);
  });

  it("rejects missing PDF bytes", async () => {
    const ctx = await makeTripWithDeliveries([]);
    const res = await postJson(app.baseUrl, emailPath(ctx.trip.id, ctx.deliveries[0].id), {});
    assert.equal(res.status, 422);
  });

  it("rejects empty PDF bytes", async () => {
    const ctx = await makeTripWithDeliveries([]);
    const res = await postJson(app.baseUrl, emailPath(ctx.trip.id, ctx.deliveries[0].id), {
      pdfBase64: "",
    });
    assert.equal(res.status, 422);
  });

  it("sends one email per delivery using shops.email, ignoring frontend to", async () => {
    const ctx = await makeTripWithDeliveries([]);
    const dA = ctx.deliveries[0];
    const res = await postJson(app.baseUrl, emailPath(ctx.trip.id, dA.id), {
      pdfBase64: PDF_B64,
      fileName: "ignored.pdf",
      to: "attacker@example.com",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.status, "sent");
    const stored = await pool.query(
      `SELECT recipient, status FROM trip_delivery_emails WHERE trip_id = $1 AND delivery_id = $2`,
      [ctx.trip.id, dA.id]
    );
    assert.equal(stored.rows[0].status, "sent");
    assert.equal(stored.rows[0].recipient, ctx.masters.shopA.email);
  });

  it("does not duplicate status rows or resend when already sent", async () => {
    const ctx = await makeTripWithDeliveries([]);
    const id = ctx.deliveries[0].id;
    const first = await postJson(app.baseUrl, emailPath(ctx.trip.id, id), { pdfBase64: PDF_B64 });
    const second = await postJson(app.baseUrl, emailPath(ctx.trip.id, id), { pdfBase64: PDF_B64 });
    assert.equal(first.body.status, "sent");
    assert.equal(second.body.status, "sent");
    const count = await pool.query(
      `SELECT COUNT(*)::int AS n FROM trip_delivery_emails WHERE trip_id = $1 AND delivery_id = $2`,
      [ctx.trip.id, id]
    );
    assert.equal(count.rows[0].n, 1);
    const deliveries = await pool.query(
      `SELECT COUNT(*)::int AS n FROM trip_deliveries WHERE trip_id = $1`,
      [ctx.trip.id]
    );
    assert.equal(deliveries.rows[0].n, ctx.deliveries.length);
  });

  it("does not send twice for concurrent requests of the same delivery", async () => {
    const ctx = await makeTripWithDeliveries([]);
    const id = ctx.deliveries[0].id;
    const [a, b] = await Promise.all([
      postJson(app.baseUrl, emailPath(ctx.trip.id, id), { pdfBase64: PDF_B64 }),
      postJson(app.baseUrl, emailPath(ctx.trip.id, id), { pdfBase64: PDF_B64 }),
    ]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    const count = await pool.query(
      `SELECT COUNT(*)::int AS n FROM trip_delivery_emails WHERE trip_id = $1 AND delivery_id = $2`,
      [ctx.trip.id, id]
    );
    assert.equal(count.rows[0].n, 1);
    const st = await pool.query(
      `SELECT status FROM trip_delivery_emails WHERE trip_id = $1 AND delivery_id = $2`,
      [ctx.trip.id, id]
    );
    assert.ok(["sent", "sending"].includes(String(st.rows[0].status)));
  });

  it("retries a failed row without duplicating the delivery", async () => {
    const ctx = await makeTripWithDeliveries([]);
    const id = ctx.deliveries[0].id;
    await pool.query(
      `INSERT INTO trip_delivery_emails (trip_id, delivery_id, status, failure_reason)
       VALUES ($1, $2, 'failed', 'previous')`,
      [ctx.trip.id, id]
    );
    const before = await pool.query(
      `SELECT COUNT(*)::int AS n FROM trip_deliveries WHERE trip_id = $1`,
      [ctx.trip.id]
    );
    const res = await postJson(app.baseUrl, emailPath(ctx.trip.id, id), { pdfBase64: PDF_B64 });
    assert.equal(res.body.success, true);
    const after = await pool.query(
      `SELECT COUNT(*)::int AS n FROM trip_deliveries WHERE trip_id = $1`,
      [ctx.trip.id]
    );
    assert.equal(after.rows[0].n, before.rows[0].n);
    const st = await pool.query(
      `SELECT status FROM trip_delivery_emails WHERE trip_id = $1 AND delivery_id = $2`,
      [ctx.trip.id, id]
    );
    assert.equal(st.rows[0].status, "sent");
  });

  it("uses the current shops.email on retry after a master change", async () => {
    const ctx = await makeTripWithDeliveries([]);
    const id = ctx.deliveries[0].id;
    const nextEmail = `updated-a-${seq}@example.com`;
    await pool.query(`UPDATE shops SET email = $2 WHERE id = $1`, [ctx.masters.shopA.id, nextEmail]);
    const res = await postJson(app.baseUrl, emailPath(ctx.trip.id, id), { pdfBase64: PDF_B64 });
    assert.equal(res.body.success, true);
    const stored = await pool.query(
      `SELECT recipient FROM trip_delivery_emails WHERE trip_id = $1 AND delivery_id = $2`,
      [ctx.trip.id, id]
    );
    assert.equal(stored.rows[0].recipient, nextEmail);
  });

  it("sends each of three shops independently", async () => {
    const ctx = await makeTripWithDeliveries([]);
    assert.equal(ctx.deliveries.length, 3);
    for (const d of ctx.deliveries) {
      const res = await postJson(app.baseUrl, emailPath(ctx.trip.id, d.id), { pdfBase64: PDF_B64 });
      assert.equal(res.body.success, true);
    }
    const listed = await getJson(app.baseUrl, `/api/trips/${ctx.trip.id}/delivery-emails`);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.length, 3);
    assert.ok(listed.body.every((r: { status: string }) => r.status === "sent"));
  });

  it("SMTP failure marks email failed and leaves the trip Completed", async () => {
    const ctx = await makeTripWithDeliveries([]);
    const prev = {
      host: env.smtpHost,
      user: env.smtpUser,
      pass: env.smtpPass,
      from: env.smtpFrom,
    };
    env.smtpHost = "";
    env.smtpUser = "";
    env.smtpPass = "";
    env.smtpFrom = "";
    try {
      const result = await deliveryEmailService.sendDeliveryEmail(
        ctx.trip.id,
        ctx.deliveries[0].id,
        { pdfBase64: PDF_B64 }
      );
      assert.equal(result.success, false);
      assert.equal(result.status, "failed");
      const trip = await pool.query(`SELECT status FROM trips WHERE id = $1`, [ctx.trip.id]);
      assert.equal(String(trip.rows[0].status), "Completed");
      const st = await pool.query(
        `SELECT status FROM trip_delivery_emails WHERE trip_id = $1 AND delivery_id = $2`,
        [ctx.trip.id, ctx.deliveries[0].id]
      );
      assert.equal(st.rows[0].status, "failed");
    } finally {
      env.smtpHost = prev.host;
      env.smtpUser = prev.user;
      env.smtpPass = prev.pass;
      env.smtpFrom = prev.from;
    }
  });
});
