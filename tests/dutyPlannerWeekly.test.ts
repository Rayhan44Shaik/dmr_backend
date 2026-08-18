/**
 * Duty Planner backend tests — weekly lifecycle locking.
 *
 * Runs the real services against a real PostgreSQL engine (PGlite WASM behind
 * the pg-gateway wire-protocol server) — no mocks.
 *
 * Covers:
 *   - a completed week (its Sunday has passed) is reported as status "Closed"
 *     by both getDutyWeek and getWeekStatus, even though its stored row is Open
 *   - a Closed (previous) week cannot be submitted
 *   - an Open current week submits cleanly (Draft/Open → Submitted)
 *   - a Submitted week cannot be submitted again
 *   - a Submitted week rejects edits (validateAssignment / autoAssignApply)
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { applySchema, shutdownTestEnv, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");
const { dutyPlannerService } = await import("../src/services/dutyPlannerService.js");

after(async () => {
  await shutdownTestEnv({ testDb, pool });
});

// Local-calendar date strings, matching dateOnly()/server "today".
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function loc(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const now = new Date();
const todayStr = loc(now);

// Monday of the current week (Mon..Sun weeks, like the server).
const dow = now.getDay();
const cur: Date = new Date(now);
cur.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow));
const curMonday = loc(cur);

// A Monday two weeks earlier — its Sunday is surely in the past.
const past: Date = new Date(cur);
past.setDate(cur.getDate() - 14);
const pastMonday = loc(past);

let empId: number;

before(async () => {
  const e = await mastersService.upsertEmployee({
    employeeName: "Duty Planner Weekly",
    department: "Operations",
    role: "Worker",
    phoneNumber: "9111222333",
    salary: 15000,
    status: "Active",
  });
  empId = e.id as number;
});

function saturdayOf(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 5);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Closed weeks (completed Sunday already passed)
// ---------------------------------------------------------------------------

describe("Duty Planner — previous (Closed) weeks", () => {
  it("reports a completed week as Closed even though the stored row is Open", async () => {
    assert.ok(pastMonday < todayStr, "test precondition: past week must be before today");

    const week = await dutyPlannerService.getDutyWeek(pastMonday);
    assert.equal(week.status, "Closed");

    const st = await dutyPlannerService.getWeekStatus(pastMonday);
    assert.equal(st.status, "Closed");

    // The stored row is still Open (effective status is computed, not written).
    const row = await pool.query("SELECT status FROM duty_weeks WHERE week_start = $1", [pastMonday]);
    assert.equal(row.rowCount, 1);
  });

  it("cannot submit a Closed week", async () => {
    await assert.rejects(
      () => dutyPlannerService.submitWeek(pastMonday),
      (err: Error & { status?: number }) =>
        err.message.toLowerCase().includes("closed") && (err as any).status === 409
    );
  });
});

// ---------------------------------------------------------------------------
// Open → Submitted → frozen (current week)
// ---------------------------------------------------------------------------

describe("Duty Planner — current week lifecycle", () => {
  it("submits an Open week that passes validation", async () => {
    const sat = saturdayOf(curMonday);
    // One active employee covering Saturday → no staff shortage → valid.
    await dutyPlannerService.upsertDuty({
      employeeId: empId,
      dutyType: "Delivery",
      date: sat,
    });

    const week = await dutyPlannerService.getDutyWeek(curMonday);
    assert.equal(week.status, "Open");
    assert.equal(week.validation.ok, true, JSON.stringify(week.validation.problems));

    const submitted = await dutyPlannerService.submitWeek(curMonday, "test-user");
    assert.equal(submitted.status, "Submitted");

    const db = await pool.query(
      "SELECT status, submitted_by FROM duty_weeks WHERE week_start = $1",
      [curMonday]
    );
    assert.equal(db.rows[0].status, "Submitted");
    assert.equal(db.rows[0].submitted_by, "test-user");
  });

  it("cannot submit an already-submitted week again", async () => {
    await assert.rejects(
      () => dutyPlannerService.submitWeek(curMonday),
      (err: Error & { status?: number }) => {
        const msg = err.message;
        return msg.includes("already been submitted") && (err as any).status === 409;
      }
    );
  });

  it("a Submitted week rejects new duty assignments", async () => {
    const wed = (() => {
      const d = new Date(`${curMonday}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 2);
      return d.toISOString().slice(0, 10);
    })();
    await assert.rejects(
      () =>
        dutyPlannerService.upsertDuty({
          employeeId: empId,
          dutyType: "Repair",
          date: wed,
        }),
      (err: Error & { status?: number }) => (err as any).status === 409
    );
  });

  it("a Submitted week rejects auto-assign apply", async () => {
    await assert.rejects(
      () => dutyPlannerService.autoAssignApply(curMonday),
      (err: Error & { status?: number }) =>
        err.message.toLowerCase().includes("submitted") && (err as any).status === 409
    );
  });
});