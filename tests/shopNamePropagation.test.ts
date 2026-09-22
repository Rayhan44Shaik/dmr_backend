import assert from "node:assert/strict";
import { after, test } from "node:test";
import { postJson, putJson, startApp } from "./helpers/app.js";
import { applySchema, startTestDb } from "./helpers/testDb.js";

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

test("renaming a shop propagates its name everywhere by shop id", async () => {
  const originalName = "Sri Laxmi Chiken";
  const correctedName = "Sri Lakshmi Chicken";
  const payload = {
    shopNumber: "PROP-1",
    shopName: originalName,
    ownerName: "Owner",
    phoneNumber: "9876543210",
    secondaryPhoneNumber: "",
    whatsappNumber: "",
    email: "",
    city: "Hyderabad",
    address: "Market Road",
    latitude: null,
    longitude: null,
    paperRate: 1,
    associationType: "Vencob Vij",
    openingBalance: 0,
    status: "Active",
  };
  const created = await postJson(app.baseUrl, "/api/masters/shops", payload);
  assert.equal(created.status, 201);
  const shopId = Number(created.body.id);

  const trip = await pool.query<{ id: number }>(
    `INSERT INTO trips (trip_no, trip_date, last_shop) VALUES ('PROP-TRIP', CURRENT_DATE, $1) RETURNING id`,
    [originalName]
  );
  const tripId = trip.rows[0].id;
  await pool.query(`INSERT INTO trip_deliveries (trip_id, sale_no, serial_no, shop_id, shop_name) VALUES ($1, 'PROP-DELIVERY', 2, $2, $3)`, [tripId, shopId, originalName]);
  await pool.query(`INSERT INTO shop_rates (shop_id, shop_name, effective_from) VALUES ($1, $2, CURRENT_DATE)`, [shopId, originalName]);
  await pool.query(`INSERT INTO shop_sales (sale_no, sale_date, shop_id, shop_name) VALUES ('PROP-SALE', CURRENT_DATE, $1, $2)`, [shopId, originalName]);
  await pool.query(`INSERT INTO collections (collection_no, collection_date, shop_id, shop_name, amount_collected) VALUES ('PROP-COLLECTION', CURRENT_DATE, $1, $2, 1)`, [shopId, originalName]);
  await pool.query(`INSERT INTO trip_deliveries (trip_id, sale_no, serial_no, shop_id, shop_name) VALUES ($1, 'FREE-TEXT', 1, NULL, $2)`, [tripId, originalName]);

  const updated = await putJson(app.baseUrl, `/api/masters/shops/${shopId}`, {
    ...payload,
    shopName: correctedName,
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.id, shopId, "renaming must preserve the shop identity");

  for (const table of ["trip_deliveries", "shop_rates", "shop_sales", "collections"]) {
    const row = await pool.query<{ shop_name: string }>(
      `SELECT shop_name FROM ${table} WHERE shop_id = $1 LIMIT 1`,
      [shopId]
    );
    assert.equal(row.rows[0].shop_name, correctedName, `${table} should use the corrected name`);
  }
  const tripRow = await pool.query<{ last_shop: string }>(`SELECT last_shop FROM trips WHERE id = $1`, [tripId]);
  assert.equal(tripRow.rows[0].last_shop, correctedName);
  const freeText = await pool.query<{ shop_name: string }>(`SELECT shop_name FROM trip_deliveries WHERE sale_no = 'FREE-TEXT'`);
  assert.equal(freeText.rows[0].shop_name, originalName, "rows without the matching id must not be rewritten");
});
