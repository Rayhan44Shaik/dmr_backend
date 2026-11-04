/**
 * D8 — focused tests for the disposable-database guard.
 *
 * These run with no database at all: the guard is pure, and that is exactly
 * the property under test. A network listener is used to prove that a refused
 * URL never gets the chance to open a socket.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import {
  assertDisposableTestDatabase,
  inspectDatabaseUrl,
  isDisposableDatabaseName,
  OperationalDatabaseRefusedError,
  DEFAULT_OPERATIONAL_DATABASE_URL,
  EMPTY_DATABASE_NAME,
  UNPARSEABLE_DATABASE_URL,
} from "../src/config/disposableDbGuard.js";

const url = (name: string, host = "localhost", port = "5432") =>
  `postgresql://tester:sup3r-s3cret@${host}:${port}/${name}`;

function expectRefusal(name: string, expectedFragment?: string): string {
  try {
    assertDisposableTestDatabase(`test file for ${name}`, url(name));
  } catch (error) {
    assert.ok(error instanceof OperationalDatabaseRefusedError, `expected guard error for ${name}`);
    if (expectedFragment) {
      assert.match(error.message, new RegExp(expectedFragment));
    }
    return error.message;
  }
  assert.fail(`guard accepted ${name}, which is not disposable`);
}

describe("disposable database guard — rejected databases", () => {
  test("rejects the operational database dmr_poultries and names it", () => {
    const message = expectRefusal("dmr_poultries");
    assert.match(message, /Resolved database: dmr_poultries/);
    assert.match(message, /dmr_test_<name>/);
    assert.match(message, /DATABASE_URL=/);
    assert.match(message, /before any INSERT/);
  });

  test("rejects the postgres maintenance database", () => {
    const message = expectRefusal("postgres");
    assert.match(message, /Resolved database: postgres/);
  });

  test("rejects the template databases", () => {
    expectRefusal("template0");
    expectRefusal("template1");
  });

  test("rejects an unknown database name", () => {
    const message = expectRefusal("dmr_analytics_staging");
    assert.match(message, /not a recognised disposable test database/);
  });

  test("rejects an empty database name", () => {
    const message = expectRefusal("");
    assert.ok(message.includes(`Resolved database: ${EMPTY_DATABASE_NAME}`), message);
    assert.match(message, /empty database name/);
  });

  test("rejects an unparseable DATABASE_URL", () => {
    assert.throws(
      () => assertDisposableTestDatabase("test file", "://not-a-url"),
      (error: unknown) =>
        error instanceof OperationalDatabaseRefusedError &&
        error.databaseName === UNPARSEABLE_DATABASE_URL &&
        /could not be parsed/.test(error.message)
    );
  });

  test("rejects copies of the operational database that merely append a suffix", () => {
    expectRefusal("dmr_poultries_test");
    expectRefusal("dmr_poultries_backup");
  });

  test("treats an unset/blank DATABASE_URL as the operational default and refuses", () => {
    // "" exercises the same branch as "not set" in src/config/env.ts.
    assert.throws(
      () => assertDisposableTestDatabase("test file with no DATABASE_URL", ""),
      (error: unknown) =>
        error instanceof OperationalDatabaseRefusedError &&
        /built-in default \(DATABASE_URL is not set\)/.test(error.message) &&
        /Resolved database: dmr_poultries/.test(error.message)
    );
    assert.equal(inspectDatabaseUrl(DEFAULT_OPERATIONAL_DATABASE_URL).databaseName, "dmr_poultries");
  });

  test("never echoes the password into the refusal message", () => {
    const message = expectRefusal("dmr_poultries");
    assert.ok(!message.includes("sup3r-s3cret"), "guard message leaked a password");
  });
});

describe("disposable database guard — accepted databases", () => {
  test("accepts dmr_d4_verify", () => {
    const target = assertDisposableTestDatabase("test file", url("dmr_d4_verify"));
    assert.equal(target.databaseName, "dmr_d4_verify");
  });

  test("accepts dmr_test_example", () => {
    assert.equal(assertDisposableTestDatabase("t", url("dmr_test_example")).databaseName, "dmr_test_example");
  });

  test("accepts dmr_e2e_<name> and <name>_test", () => {
    assert.equal(assertDisposableTestDatabase("t", url("dmr_e2e_ci")).databaseName, "dmr_e2e_ci");
    assert.equal(assertDisposableTestDatabase("t", url("dmr_verify_test")).databaseName, "dmr_verify_test");
  });

  test("name matcher is anchored, not a substring search", () => {
    assert.equal(isDisposableDatabaseName("dmr_d4_verify"), true);
    assert.equal(isDisposableDatabaseName("dmr_d4_verify_extra"), false);
    assert.equal(isDisposableDatabaseName("dmr_poultries_test"), false);
    assert.equal(isDisposableDatabaseName("xdmr_d4_verify"), false);
    assert.equal(isDisposableDatabaseName("dmr_test_"), false);
  });
});

describe("disposable database guard — fires before any connection", () => {
  let server: net.Server;
  let port = 0;
  let acceptedConnections = 0;

  before(async () => {
    server = net.createServer((socket) => {
      acceptedConnections += 1;
      socket.destroy();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    port = address.port;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("refusals open no socket at all, and the throw is synchronous", () => {
    const before = acceptedConnections;
    for (const name of ["dmr_poultries", "postgres", "template1", "unknown_db"]) {
      assert.throws(() => assertDisposableTestDatabase("t", url(name, "127.0.0.1", String(port))));
    }
    assert.equal(acceptedConnections, before, "a refused URL opened a connection");
  });

  test("an accepted database is only judged by name — the guard still opens nothing", () => {
    const before = acceptedConnections;
    assertDisposableTestDatabase("t", url("dmr_test_guard", "127.0.0.1", String(port)));
    assert.equal(acceptedConnections, before, "the guard itself connected to the database");
  });
});
