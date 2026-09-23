import assert from "node:assert/strict";
import test from "node:test";
import type pg from "pg";
import { getTripMeterLock } from "../src/utils/tripMeterLock.js";

test("meter lock sends PostgreSQL an ISO timestamptz instead of a GMT+0530 Date string", async () => {
  const submittedAt = new Date("2026-09-23T05:30:00.123Z");
  const calls: unknown[][] = [];
  let queryIndex = 0;
  const client = {
    async query(_sql: string, params: unknown[]) {
      calls.push(params);
      queryIndex += 1;
      if (queryIndex === 1) {
        return {
          rowCount: 1,
          rows: [{
            id: 84,
            trip_date: new Date(2026, 8, 23),
            status: "Pending",
            deleted: false,
            vehicle_id: 7,
            expenses_step_submitted_at: null,
            start_step_submitted_at: submittedAt,
            created_at: new Date("2026-09-23T05:00:00.000Z"),
          }],
        };
      }
      return { rowCount: 0, rows: [] };
    },
  } as unknown as pg.PoolClient;

  const result = await getTripMeterLock(client, 84);

  assert.deepEqual(result, { locked: false, reason: null });
  assert.equal(calls.length, 4);
  assert.equal(calls[1]?.[3], "2026-09-23T05:30:00.123Z");
  assert.equal(calls[2]?.[2], "2026-09-23T05:30:00.123Z");
  assert.equal(calls[3]?.[3], "2026-09-23T05:30:00.123Z");
  for (const params of calls.slice(1)) {
    assert.equal(params.some((param) => /GMT[+-]\d{4}/i.test(String(param))), false);
  }
});
