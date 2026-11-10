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

describe("disposable database guard — DBSAFE-1 PGlite gateway", () => {
  const pglite = (host = "127.0.0.1", port = "5432") =>
    `postgresql://postgres:postgres@${host}:${port}/postgres`;

  test("refuses the postgres database name by default (no opt-in)", () => {
    for (const host of ["127.0.0.1", "localhost"]) {
      assert.throws(
        () => assertDisposableTestDatabase("t", pglite(host)),
        (error: unknown) =>
          error instanceof OperationalDatabaseRefusedError &&
          /Resolved database: postgres/.test(error.message)
      );
    }
  });

  test("allows postgres on loopback with explicit opt-in", () => {
    for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
      const target = assertDisposableTestDatabase("t", pglite(host), { allowPgliteGateway: true });
      assert.equal(target.databaseName, "postgres");
    }
  });

  test("refuses postgres on a non-loopback host even with opt-in", () => {
    for (const host of ["db", "192.168.1.10", "example.com"]) {
      assert.throws(
        () => assertDisposableTestDatabase("t", pglite(host), { allowPgliteGateway: true }),
        (error: unknown) => error instanceof OperationalDatabaseRefusedError
      );
    }
  });

  test("refuses postgres on a managed host even with opt-in", () => {
    assert.throws(
      () =>
        assertDisposableTestDatabase("t", pglite("mydb.abcdefgh.neon.tech"), {
          allowPgliteGateway: true,
        }),
      (error: unknown) => error instanceof OperationalDatabaseRefusedError
    );
  });
});

describe("disposable database guard — DBSAFE-1 dmr_poultries prefix rule", () => {
  test("allows the exact grandfathered dmr_poultries_e2e name (with deprecation warning)", () => {
    const target = assertDisposableTestDatabase("t", url("dmr_poultries_e2e"));
    assert.equal(target.databaseName, "dmr_poultries_e2e");
  });

  test("refuses every other dmr_poultries-prefixed name", () => {
    for (const name of [
      "dmr_poultries_e2e_backup",
      "dmr_poultries_e2e_old",
      "dmr_poultries_test",
      "dmr_poultries_backup",
      "dmr_poultries2",
      "DMR_POULTRIES_E2E_BACKUP",
    ]) {
      assert.throws(
        () => assertDisposableTestDatabase("t", url(name)),
        (error: unknown) => error instanceof OperationalDatabaseRefusedError,
        `guard accepted prefixed copy ${name}`
      );
    }
  });
});

describe("disposable database guard — DBSAFE-1 production-like and remote hosts", () => {
  const remoteUrl = (name: string, host: string) =>
    `postgresql://tester:sup3r-s3cret@${host}:5432/${name}`;

  test("refuses disposable names on managed hosts by default", () => {
    for (const host of [
      "mydb.abcdefghijk.rds.amazonaws.com",
      "mydb.neon.tech",
      "mydb.supabase.co",
      "mydb.supabase.com",
      "mydb.googleapis.com",
      "mydb.database.azure.com",
      "mydb.herokuapp.com",
      "mydb.herokussl.com",
    ]) {
      assert.throws(
        () => assertDisposableTestDatabase("t", remoteUrl("dmr_test_ci", host)),
        (error: unknown) =>
          error instanceof OperationalDatabaseRefusedError &&
          /production-like database host/.test(error.message),
        `guard accepted managed host ${host}`
      );
    }
  });

  test("refuses prod/live/primary hostname tokens by default", () => {
    for (const host of ["prod-db.internal", "production-pg.example.com", "live-pg.internal", "primary.db.svc"]) {
      assert.throws(
        () => assertDisposableTestDatabase("t", remoteUrl("dmr_test_ci", host)),
        (error: unknown) =>
          error instanceof OperationalDatabaseRefusedError &&
          /production-like database host/.test(error.message),
        `guard accepted production-like host ${host}`
      );
    }
  });

  test("does not treat substrings as production tokens (still refused as remote, different reason)", () => {
    assert.throws(
      () => assertDisposableTestDatabase("t", remoteUrl("dmr_test_ci", "liveoak.example.com")),
      (error: unknown) =>
        error instanceof OperationalDatabaseRefusedError &&
          /non-loopback test hosts require/.test(error.message) &&
          !/production-like database host/.test(error.message)
    );
  });

  test("refuses unknown non-loopback hosts by default, even with disposable names", () => {
    for (const host of ["db", "postgres", "192.168.1.10", "ci-runner.internal"]) {
      assert.throws(
        () => assertDisposableTestDatabase("t", remoteUrl("dmr_test_ci", host)),
        (error: unknown) =>
          error instanceof OperationalDatabaseRefusedError &&
          /non-loopback test hosts require/.test(error.message),
        `guard accepted remote host ${host}`
      );
    }
  });

  test("refuses the operational name on a remote host with the name reason", () => {
    assert.throws(
      () => assertDisposableTestDatabase("t", remoteUrl("dmr_poultries", "db")),
      (error: unknown) =>
        error instanceof OperationalDatabaseRefusedError &&
        /operational \(or a copy of it\)/.test(error.message)
    );
  });

  test("allows a disposable name on a remote host only with ALLOW_REMOTE_TEST_DB=1", () => {
    const previous = process.env.ALLOW_REMOTE_TEST_DB;
    try {
      delete process.env.ALLOW_REMOTE_TEST_DB;
      assert.throws(() =>
        assertDisposableTestDatabase("t", remoteUrl("dmr_test_ci", "db"))
      );
      process.env.ALLOW_REMOTE_TEST_DB = "1";
      const target = assertDisposableTestDatabase("t", remoteUrl("dmr_test_ci", "db"));
      assert.equal(target.databaseName, "dmr_test_ci");
      const managed = assertDisposableTestDatabase(
        "t",
        remoteUrl("dmr_e2e_ci", "mydb.abcdefghijk.rds.amazonaws.com")
      );
      assert.equal(managed.databaseName, "dmr_e2e_ci");
    } finally {
      if (previous === undefined) delete process.env.ALLOW_REMOTE_TEST_DB;
      else process.env.ALLOW_REMOTE_TEST_DB = previous;
    }
  });

  test("ALLOW_REMOTE_TEST_DB=1 never rescues operational or prefixed names", () => {
    const previous = process.env.ALLOW_REMOTE_TEST_DB;
    try {
      process.env.ALLOW_REMOTE_TEST_DB = "1";
      for (const name of ["dmr_poultries", "dmr_poultries_backup"]) {
        assert.throws(
          () => assertDisposableTestDatabase("t", remoteUrl(name, "db")),
          (error: unknown) => error instanceof OperationalDatabaseRefusedError,
          `remote opt-in rescued ${name}`
        );
      }
    } finally {
      if (previous === undefined) delete process.env.ALLOW_REMOTE_TEST_DB;
      else process.env.ALLOW_REMOTE_TEST_DB = previous;
    }
  });

  test("allows loopback disposable databases without any opt-in", () => {
    for (const host of ["localhost", "127.0.0.1"]) {
      assert.equal(
        assertDisposableTestDatabase("t", remoteUrl("dmr_test_loopback", host)).databaseName,
        "dmr_test_loopback"
      );
    }
  });
});

describe("disposable database guard — DBSAFE-1 malformed URLs", () => {
  test("refuses URLs with no parseable database", () => {
    for (const bad of ["://not-a-url", "not a url at all", "postgresql://localhost:5432/"]) {
      assert.throws(
        () => assertDisposableTestDatabase("t", bad),
        (error: unknown) => error instanceof OperationalDatabaseRefusedError,
        `guard accepted malformed URL ${bad}`
      );
    }
  });

  test("refuses whitespace-only DATABASE_URL as the operational default", () => {
    assert.throws(
      () => assertDisposableTestDatabase("t", "   "),
      (error: unknown) =>
        error instanceof OperationalDatabaseRefusedError &&
        /Resolved database: dmr_poultries/.test(error.message)
    );
  });
});
