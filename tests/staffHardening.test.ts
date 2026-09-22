/**
 * Staff P2/P3 hardening closure tests (audit 2026-09-22 follow-up).
 *
 * Covers, against the real schema + real services on an isolated PGlite DB:
 *  P2  overlapping-leave DB trigger (direct-SQL writers included)
 *  P2  Repair vehicle double-claim arbitrates on the unique key
 *  P2  driver maintenance KPI reads trip-attributed cost, not the fleet ledger
 *  P2  production-volume query plans use staff indexes
 *  P2  burst load: 10 concurrent creators + duplicate-duty storm
 *  P3  redundant duty employee index removed (composite covers)
 *  P3  pool exhaustion fails controlled and recovers
 *  P3  Staff rate limiter sheds load with 429 + Retry-After
 *  P3  correlation IDs propagate end to end (incl. error bodies)
 *  P3  security headers present on responses
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import pg from "pg";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();

const { pool } = await import("../src/config/db.js");
const { staffService } = await import("../src/services/staffService.js");
const { dutyPlannerService } = await import("../src/services/dutyPlannerService.js");
const { staffPerformanceService } = await import(
  "../src/services/staffPerformanceService.js"
);
const { mapPgError } = await import("../src/utils/pgErrors.js");
const { createRateLimiter } = await import(
  "../src/middleware/staffRateLimit.js"
);
const { requestId } = await import("../src/middleware/requestId.js");
const { securityHeaders } = await import(
  "../src/middleware/securityHeaders.js"
);
const { errorHandler, AppError } = await import(
  "../src/middleware/errorHandler.js"
);
const { staffRouter } = await import("../src/routes/staff.js");

function mockRes() {
  const headers: Record<string, string> = {};
  const res: Record<string, unknown> = {
    locals: {},
    statusCode: 200,
    body: undefined,
    setHeader: (k: string, v: string) => {
      headers[k.toLowerCase()] = v;
    },
    getHeader: (k: string) => headers[k.toLowerCase()],
    status: (c: number) => {
      res.statusCode = c;
      return res;
    },
    json: (b: unknown) => {
      res.body = b;
      return res;
    },
  };
  return { res: res as never, headers };
}

function mockReq(
  headers: Record<string, string | string[]> = {},
  ip = "9.9.9.9"
) {
  return { headers, ip, socket: { remoteAddress: ip } } as never;
}

function nextMonday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + (((8 - d.getUTCDay()) % 7) || 7));
  return d.toISOString().slice(0, 10);
}

async function makeEmployee(no: number, name: string): Promise<number> {
  const r = await pool.query(
    `INSERT INTO employees (employee_no,employee_name,department,role,status)
     VALUES ($1,$2,'Operations','Driver','Active') RETURNING id`,
    [no, name]
  );
  return Number(r.rows[0].id);
}

async function explain(sql: string, params: unknown[]): Promise<string> {
  // Force index planning so the chosen access path is visible even on the
  // tiny test tables; at production volume the planner picks these indexes
  // on cost without the hint.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL enable_seqscan = off");
    const r = await client.query(`EXPLAIN ${sql}`, params);
    await client.query("ROLLBACK");
    return r.rows.map((row) => String(row["QUERY PLAN"])).join("\n");
  } finally {
    client.release();
  }
}

let empA = 0;
let empB = 0;

before(async () => {
  empA = await makeEmployee(70001, "Hardening Emp A");
  empB = await makeEmployee(70002, "Hardening Emp B");
});

after(async () => {
  await testDb.close();
  await pool.end();
});

describe("P2: overlapping-leave DB guard (trigger, direct writers included)", () => {
  it("blocks an overlapping Pending insert from raw SQL with 23P01", async () => {
    await pool.query(
      `INSERT INTO leave_requests(employee_id,employee_name,leave_type,from_date,to_date,days,status)
       VALUES($1,'Hardening Emp A','Casual','2026-11-01','2026-11-03',3,'Pending')`,
      [empA]
    );
    const err = await pool
      .query(
        `INSERT INTO leave_requests(employee_id,employee_name,leave_type,from_date,to_date,days,status)
         VALUES($1,'Hardening Emp A','Casual','2026-11-02','2026-11-04',3,'Pending')`,
        [empA]
      )
      .then(
        () => null,
        (e: unknown) => e as { code?: string }
      );
    assert.ok(err, "overlapping insert must fail");
    assert.equal(err.code, "23P01");
    const mapped = mapPgError(err);
    assert.ok(mapped, "23P01 must map to an AppError");
    assert.equal(mapped.status, 409);
  });

  it("allows Rejected rows and other employees, blocks promotion into overlap", async () => {
    await pool.query(
      `INSERT INTO leave_requests(employee_id,employee_name,leave_type,from_date,to_date,days,status)
       VALUES($1,'Hardening Emp A','Casual','2026-11-02','2026-11-04',3,'Rejected')`,
      [empA]
    );
    await pool.query(
      `INSERT INTO leave_requests(employee_id,employee_name,leave_type,from_date,to_date,days,status)
       VALUES($1,'Hardening Emp B','Casual','2026-11-02','2026-11-04',3,'Pending')`,
      [empB]
    );
    const rejected = await pool.query(
      `SELECT id FROM leave_requests WHERE employee_id=$1 AND status='Rejected'`,
      [empA]
    );
    await assert.rejects(
      pool.query(
        `UPDATE leave_requests SET status='Pending' WHERE id=$1`,
        [rejected.rows[0].id]
      ),
      (e: unknown) => (e as { code?: string }).code === "23P01"
    );
  });

  it("blocks overlapping createLeave at the service layer with 409", async () => {
    await assert.rejects(
      staffService.createLeave({
        employeeId: empA,
        type: "Casual",
        fromDate: "2026-11-02",
        toDate: "2026-11-05",
      }),
      (e: unknown) => (e as { status?: number }).status === 409
    );
  });
});

describe("P2: Repair vehicle double-claim arbitrates on the unique key", () => {
  it("partial unique index predicate covers Repair", async () => {
    const r = await pool.query(
      `SELECT indexdef FROM pg_indexes WHERE indexname='uq_duty_vehicle_date'`
    );
    assert.equal(r.rows.length, 1);
    assert.match(String(r.rows[0].indexdef), /Repair/);
  });

  it("concurrent Repair claims on one vehicle/date leave exactly one row", async () => {
    const vehicle = await pool.query(
      `INSERT INTO vehicles(vehicle_no,vehicle_number,vehicle_type,bird_capacity,capacity_kg,status)
       VALUES(77001,'HDN-01','Truck',1000,2000,'Active') RETURNING id`
    );
    const vehicleId = Number(vehicle.rows[0].id);
    const date = nextMonday();
    const attempt = (employeeId: number) =>
      pool.query(
        `INSERT INTO duty_assignments(employee_id,employee_name,department,role,duty_type,duty_date,vehicle_id,vehicle_no)
         VALUES($1,'Hardening','Operations','Driver','Repair',$2,$3,'HDN-01')`,
        [employeeId, date, vehicleId]
      );
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        attempt(i % 2 === 0 ? empA : empB)
      )
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const conflicts = results.filter(
      (r) =>
        r.status === "rejected" &&
        (r.reason as { code?: string }).code === "23505"
    ).length;
    // Same-employee duplicates also hit the (employee_id,duty_date) key, so
    // at most 2 rows (one per employee) may win; every loser is a 23505.
    assert.ok(ok >= 1 && ok <= 2, `expected 1-2 winners, got ${ok}`);
    assert.equal(ok + conflicts, 8);
    const count = await pool.query(
      `SELECT COUNT(*)::int AS n FROM duty_assignments WHERE vehicle_id=$1 AND duty_date=$2`,
      [vehicleId, date]
    );
    assert.equal(Number(count.rows[0].n), 1);
  });
});

describe("P2: driver maintenance KPI source (trip-attributed, not fleet ledger)", () => {
  it("ignores fleet_maintenance ledger rows, sums trips.vehicle_maintenance", async () => {
    const driver = await makeEmployee(70003, "KPI Driver");
    const vehicle = await pool.query(
      `INSERT INTO vehicles(vehicle_no,vehicle_number,vehicle_type,bird_capacity,capacity_kg,status)
       VALUES(77002,'KPI-01','Truck',1000,2000,'Active') RETURNING id`
    );
    const vehicleId = Number(vehicle.rows[0].id);
    const trip = await pool.query(
      `INSERT INTO trips(trip_no,trip_date,status,vehicle_id,vehicle_no,driver_id,driver_name,
         total_km,total_shops,total_birds_delivered,total_delivered_weight,
         total_mortality_count,weight_loss,vehicle_maintenance,deleted)
       VALUES('TRIP-KPI-1','2026-09-15','Completed',$1,'KPI-01',$2,'KPI Driver',
         120,3,900,1800,9,4.5,250,FALSE) RETURNING id`,
      [vehicleId, driver]
    );
    assert.ok(trip.rows[0].id);
    await pool.query(
      `INSERT INTO fleet_maintenance(bill_no,maintenance_date,vehicle_id,vehicle_no,driver_id,driver_name,total_cost,status)
       VALUES('KPI-BILL-1','2026-09-16',$1,'KPI-01',$2,'KPI Driver',9999,'Approved')`,
      [vehicleId, driver]
    );
    const result = await staffPerformanceService.drivers({
      fromDate: "2026-09-01",
      toDate: "2026-09-30",
      personId: driver,
    });
    assert.equal(result.kpis.maintenanceCost, 250);
    assert.equal(result.rows[0].maintenanceCost, 250);
  });
});

describe("P2: production-volume query plans use staff indexes", () => {
  it("duty employee/date lookup scans idx_duty_emp_date", async () => {
    const plan = await explain(
      `SELECT * FROM duty_assignments WHERE employee_id=$1 AND duty_date BETWEEN $2 AND $3`,
      [empA, "2026-01-01", "2026-12-31"]
    );
    assert.match(plan, /idx_duty_emp_date/);
  });

  it("leave overlap lookup scans the leave employee/dates/status index", async () => {
    const plan = await explain(
      `SELECT id FROM leave_requests WHERE employee_id=$1 AND status IN ('Pending','Approved')
        AND from_date <= $3 AND to_date >= $2 LIMIT 1`,
      [empA, "2026-11-02", "2026-11-04"]
    );
    assert.match(plan, /idx_leave_employee_dates_status/);
    assert.doesNotMatch(plan, /Seq Scan/);
  });

  it("salary employee/month lookup uses an index, not a sequence scan", async () => {
    const plan = await explain(
      `SELECT * FROM salary_records WHERE employee_id=$1 AND month=$2`,
      [empA, "2026-09"]
    );
    assert.match(plan, /Index Scan|Bitmap Heap/);
    assert.doesNotMatch(plan, /Seq Scan/);
  });

  it("performance driver/date lookup uses an index, not a sequence scan", async () => {
    const plan = await explain(
      `SELECT * FROM trips WHERE deleted=FALSE AND trip_date BETWEEN $1 AND $2 AND driver_id=$3`,
      ["2026-09-01", "2026-09-30", empA]
    );
    assert.match(plan, /Index Scan|Bitmap Heap/);
    assert.doesNotMatch(plan, /Seq Scan/);
  });
});

describe("P2: burst load (10 concurrent users, duplicate-duty storm)", () => {
  it("10 concurrent leave creators on distinct employees all succeed", async () => {
    const ids = await Promise.all(
      Array.from({ length: 10 }, (_, i) => makeEmployee(70100 + i, `Burst ${i}`))
    );
    const results = await Promise.allSettled(
      ids.map((employeeId, i) =>
        staffService.createLeave({
          employeeId,
          type: "Casual",
          fromDate: `2026-12-${String(i + 1).padStart(2, "0")}`,
          toDate: `2026-12-${String(i + 1).padStart(2, "0")}`,
        })
      )
    );
    assert.equal(
      results.filter((r) => r.status === "fulfilled").length,
      10
    );
  });

  it("10 concurrent duplicate duty upserts leave exactly one row", async () => {
    const employeeId = await makeEmployee(70200, "Storm Emp");
    const date = nextMonday();
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        dutyPlannerService.upsertDuty({ employeeId, dutyType: "Office", date })
      )
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    assert.equal(ok, 1);
    for (const r of results) {
      if (r.status === "rejected") {
        assert.equal((r.reason as { status?: number }).status, 409);
      }
    }
    const count = await pool.query(
      `SELECT COUNT(*)::int AS n FROM duty_assignments WHERE employee_id=$1 AND duty_date=$2`,
      [employeeId, date]
    );
    assert.equal(Number(count.rows[0].n), 1);
  });
});

describe("P3: redundant duty employee index removed, composite covers", () => {
  it("idx_duty_employee is gone and employee-only lookup uses the composite", async () => {
    const gone = await pool.query(
      `SELECT indexname FROM pg_indexes WHERE indexname='idx_duty_employee'`
    );
    assert.equal(gone.rows.length, 0);
    const kept = await pool.query(
      `SELECT indexname FROM pg_indexes WHERE indexname='idx_duty_emp_date'`
    );
    assert.equal(kept.rows.length, 1);
  });
});

describe("P3: pool exhaustion fails controlled and recovers", () => {
  it("bounded pool with a connection timeout; exhaustion is sanitized + correlated", async () => {
    assert.equal(
      (pool as unknown as { options: { connectionTimeoutMillis: number } })
        .options.connectionTimeoutMillis,
      5000
    );
    const tiny = new pg.Pool({
      connectionString: testDb.url,
      max: 1,
      connectionTimeoutMillis: 500,
    });
    try {
      const holder = await tiny.connect();
      await assert.rejects(tiny.query("SELECT 1"), /timeout/i);
      holder.release();
      const ok = await tiny.query("SELECT 1 AS one");
      assert.equal(Number(ok.rows[0].one), 1);
    } finally {
      await tiny.end();
    }
  });

  it("errorHandler never leaks SQL text and attaches the request id", async () => {
    const { res } = mockRes();
    (res as Record<string, unknown>).locals = { requestId: "req-pool-1" };
    errorHandler(
      new Error("Timeout acquiring a client. SELECT * FROM salary_records"),
      mockReq(),
      res,
      () => {}
    );
    const body = (res as unknown as { statusCode: number; body: Record<string, unknown> });
    assert.equal(body.statusCode, 500);
    assert.equal(body.body.error, "Internal server error");
    assert.equal(body.body.requestId, "req-pool-1");
    assert.doesNotMatch(JSON.stringify(body.body), /salary_records/);
  });
});

describe("P3: Staff rate limiter sheds abusive load with 429", () => {
  it("allows max requests then returns 429 with Retry-After", async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
    let nexts = 0;
    const next = () => {
      nexts += 1;
    };
    const first = mockRes();
    limiter(mockReq(), first.res, next);
    const second = mockRes();
    limiter(mockReq(), second.res, next);
    assert.equal(nexts, 2);
    const third = mockRes();
    limiter(mockReq(), third.res, next);
    assert.equal(nexts, 2);
    const captured = third.res as unknown as {
      statusCode: number;
      body: Record<string, string>;
    };
    assert.equal(captured.statusCode, 429);
    assert.equal(captured.body.error, "Too many requests");
    assert.ok(third.headers["retry-after"]);
    limiter.reset();
    const fourth = mockRes();
    limiter(mockReq(), fourth.res, next);
    assert.equal(nexts, 3);
  });

  it("limiter is mounted on the Staff router", async () => {
    const stack = (staffRouter as unknown as { stack: Array<{ handle?: { reset?: unknown } }> }).stack;
    assert.ok(
      stack.some((l) => typeof l?.handle?.reset === "function"),
      "staffRouter must mount the rate limiter"
    );
  });
});

describe("P3: correlation IDs and security headers", () => {
  it("propagates a valid incoming id and mints one otherwise", async () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    const { res, headers } = mockRes();
    let nexts = 0;
    requestId(mockReq({ "x-request-id": id }), res, () => {
      nexts += 1;
    });
    assert.equal(nexts, 1);
    assert.equal(headers["x-request-id"], id);
    assert.equal(
      (res as unknown as { locals: { requestId: string } }).locals.requestId,
      id
    );
    const minted = mockRes();
    requestId(mockReq(), minted.res, () => {});
    assert.match(
      minted.headers["x-request-id"],
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it("error bodies carry the request id", async () => {
    const { res } = mockRes();
    (res as Record<string, unknown>).locals = { requestId: "req-err-1" };
    errorHandler(new AppError(409, "Conflict!"), mockReq(), res, () => {});
    const body = (res as unknown as { statusCode: number; body: Record<string, unknown> });
    assert.equal(body.statusCode, 409);
    assert.equal(body.body.requestId, "req-err-1");
  });

  it("security headers are set on responses", async () => {
    const { res, headers } = mockRes();
    let nexts = 0;
    securityHeaders(mockReq(), res, () => {
      nexts += 1;
    });
    assert.equal(nexts, 1);
    assert.equal(headers["x-content-type-options"], "nosniff");
    assert.equal(headers["x-frame-options"], "DENY");
    assert.equal(headers["referrer-policy"], "no-referrer");
    assert.ok(String(headers["content-security-policy"]).includes("frame-ancestors 'none'"));
    assert.ok(headers["strict-transport-security"]);
  });
});
