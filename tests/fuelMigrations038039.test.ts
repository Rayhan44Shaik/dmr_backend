/**
 * Production-safety checks for sql/038 and sql/039 only.
 * Uses isolated PGlite (same applySchema path as other backend tests).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import { applySchema, shutdownTestEnv, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const { pool } = await import("../src/config/db.js");

const sqlDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../sql");

after(async () => {
  await shutdownTestEnv({ testDb, pool });
});

async function applySqlFile(file: string) {
  const sql = fs.readFileSync(path.join(sqlDir, file), "utf8");
  await pool.query(sql);
}

async function fkDef(): Promise<string> {
  const r = await pool.query<{ def: string }>(
    `SELECT pg_get_constraintdef(c.oid) AS def
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (c.conkey)
     WHERE t.relname = 'fuel_expenses' AND c.contype = 'f' AND a.attname = 'trip_id'`
  );
  assert.ok(r.rowCount, "trip_id foreign key missing");
  return r.rows[0].def;
}

describe("Fuel migrations 038/039", () => {
  it("is idempotent when 038 and 039 are applied again", async () => {
    await applySqlFile("038_fuel_expenses_hardening.sql");
    await applySqlFile("039_fuel_trip_independence.sql");
    await applySqlFile("038_fuel_expenses_hardening.sql");
    await applySqlFile("039_fuel_trip_independence.sql");
  });

  it("creates GPS, snapshot columns, seq table, unique indexes, SET NULL FK", async () => {
    const cols = await pool.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_name = 'fuel_expenses'
         AND column_name IN (
           'gps_lat','gps_lon','gps_accuracy','gps_captured_at',
           'source_trip_id','source_trip_no','trip_id','trip_fuel_entry_index',
           'bill_no','amount','litres','rate'
         )
       ORDER BY column_name`
    );
    const byName = Object.fromEntries(cols.rows.map((r) => [r.column_name, r.data_type]));
    assert.equal(byName.gps_lat, "double precision");
    assert.equal(byName.gps_lon, "double precision");
    assert.equal(byName.gps_accuracy, "double precision");
    assert.equal(byName.gps_captured_at, "timestamp with time zone");
    assert.equal(byName.source_trip_id, "integer");
    assert.equal(byName.source_trip_no, "character varying");
    assert.equal(byName.trip_id, "integer");
    assert.equal(byName.amount, "numeric");
    assert.equal(byName.litres, "numeric");
    assert.equal(byName.rate, "numeric");

    const idx = await pool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE tablename = 'fuel_expenses'
         AND indexname IN (
           'ux_fuel_expenses_manual_bill_no',
           'ux_fuel_expenses_source_trip_entry',
           'idx_fuel_expenses_source_trip_no'
         )`
    );
    assert.equal(idx.rowCount, 3);

    const def = await fkDef();
    assert.match(def, /ON DELETE SET NULL/i);
    assert.doesNotMatch(def, /ON DELETE CASCADE/i);
    assert.doesNotMatch(def, /ON DELETE RESTRICT/i);

    const seq = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'fuel_manual_bill_seq'`
    );
    assert.equal(seq.rowCount, 1);
  });

  it("initializes fuel_manual_bill_seq from existing MANUAL bills and does not reset downward", async () => {
    await pool.query(
      `INSERT INTO fuel_expenses (
         bill_no, expense_date, source_type, meter_reading, amount, rate, litres,
         status, ops_status, created_by
       ) VALUES (
         'BILL-20260818-157', '2026-08-18', 'MANUAL', 0, 90, 90, 1,
         'Pending', 'Pending Approval', 'mig-test'
       )`
    );
    await applySqlFile("038_fuel_expenses_hardening.sql");
    const after = await pool.query<{ last_seq: number }>(
      `SELECT last_seq FROM fuel_manual_bill_seq WHERE ymd = '20260818'`
    );
    assert.ok(Number(after.rows[0]?.last_seq) >= 157);
    await pool.query(`UPDATE fuel_manual_bill_seq SET last_seq = 200 WHERE ymd = '20260818'`);
    await applySqlFile("038_fuel_expenses_hardening.sql");
    const kept = await pool.query<{ last_seq: number }>(
      `SELECT last_seq FROM fuel_manual_bill_seq WHERE ymd = '20260818'`
    );
    assert.equal(Number(kept.rows[0].last_seq), 200);
  });

  it("SET NULL on trip delete keeps Fuel bill_no, amount, and source snapshots", async () => {
    const v = await pool.query<{ id: number }>(
      `INSERT INTO vehicles (vehicle_no, vehicle_number, vehicle_type, status)
       VALUES (9038, 'MIG038', 'Lorry', 'Active') RETURNING id`
    );
    const trip = await pool.query<{ id: number }>(
      `INSERT INTO trips (trip_no, trip_date, status, vehicle_id, vehicle_no, opening_meter, dest_meter)
       VALUES ('TR-20260817', '2026-08-17', 'Completed', $1, 'MIG038', 1, 2)
       RETURNING id`,
      [v.rows[0].id]
    );
    const fuel = await pool.query<{ id: string }>(
      `INSERT INTO fuel_expenses (
         bill_no, expense_date, vehicle_id, trip_id, source_trip_id, source_trip_no,
         trip_fuel_entry_index, source_type, meter_reading, amount, rate, litres,
         status, ops_status, created_by
       ) VALUES (
         'TR-20260817-001', '2026-08-17', $1, $2, $2, 'TR-20260817',
         1, 'TRIP', 0, 9000, 90, 100,
         'Approved', 'Approved', 'mig-test'
       ) RETURNING id`,
      [v.rows[0].id, trip.rows[0].id]
    );
    await pool.query(`DELETE FROM trips WHERE id = $1`, [trip.rows[0].id]);
    const gone = await pool.query(`SELECT 1 FROM trips WHERE id = $1`, [trip.rows[0].id]);
    assert.equal(gone.rowCount, 0);
    const row = await pool.query(
      `SELECT trip_id, source_trip_id, source_trip_no, bill_no, amount, litres, rate, ops_status
       FROM fuel_expenses WHERE id = $1`,
      [fuel.rows[0].id]
    );
    assert.equal(row.rowCount, 1);
    assert.equal(row.rows[0].trip_id, null);
    assert.equal(Number(row.rows[0].source_trip_id), trip.rows[0].id);
    assert.equal(row.rows[0].source_trip_no, "TR-20260817");
    assert.equal(row.rows[0].bill_no, "TR-20260817-001");
    assert.equal(Number(row.rows[0].amount), 9000);
    assert.equal(Number(row.rows[0].litres), 100);
    assert.equal(Number(row.rows[0].rate), 90);
    assert.equal(row.rows[0].ops_status, "Approved");
  });
});
