/**
 * Test-only safety guard for backend tests that talk to a real PostgreSQL
 * server through the shared pool (`src/config/db.ts`).
 *
 * Why this exists (D8): `src/config/env.ts` auto-loads `backend/.env`, and
 * `src/config/db.ts` falls back to a built-in default URL. Both point at
 * `dmr_poultries` — the operational database. A test file that imports the
 * pool and forgets to override `DATABASE_URL` therefore writes fixtures into
 * operational data. This guard makes that failure mode impossible to reach:
 * it runs synchronously, before any INSERT/migration/fixture/DELETE, and
 * refuses to continue unless the resolved database name is clearly
 * disposable.
 *
 * This module is imported by tests only. It must never be imported by runtime
 * code, and it must not import `src/config/env.ts` (which would itself load
 * `.env` and make the guard depend on the very configuration it polices).
 *
 * It is deliberately synchronous and dependency-free: no network, no driver,
 * no filesystem access. Being synchronous is part of the guarantee — the
 * check throws before a caller can even reach an `await pool.connect()`.
 */

/** Mirrors the fallback in `src/config/env.ts` so an unset DATABASE_URL is judged, not ignored. */
export const DEFAULT_OPERATIONAL_DATABASE_URL =
  "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries";

/**
 * Names a test may run against. Keep this list narrow: a database is only
 * disposable if its name says so.
 */
export const DISPOSABLE_DATABASE_PATTERNS: readonly RegExp[] = [
  /^dmr_d4_verify$/,
  /^dmr_test_[A-Za-z0-9_]+$/,
  /^dmr_e2e_[A-Za-z0-9_]+$/,
  /^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*_test$/,
];

/** Never allowed, even if a pattern above would otherwise match. */
export const FORBIDDEN_DATABASE_NAMES: readonly string[] = [
  "dmr_poultries",
  "postgres",
  "template0",
  "template1",
];

/**
 * Prefixes that are refused even when the name would otherwise look disposable:
 * `dmr_poultries_test`, `dmr_poultries_backup` and friends are copies of
 * operational data, not disposable scratch databases.
 */
export const FORBIDDEN_DATABASE_PREFIXES: readonly string[] = ["dmr_poultries"];

export interface DatabaseTarget {
  /** Database name resolved from the URL, or a marker for the broken cases. */
  databaseName: string;
  host: string | null;
  port: string | null;
  /** Where the URL came from — useful in the error message and in logs. */
  source: string;
}

export class OperationalDatabaseRefusedError extends Error {
  readonly databaseName: string;
  readonly context: string;

  constructor(message: string, context: string, databaseName: string) {
    super(message);
    this.name = "OperationalDatabaseRefusedError";
    this.context = context;
    this.databaseName = databaseName;
  }
}

export const EMPTY_DATABASE_NAME = "(empty)";
export const UNPARSEABLE_DATABASE_URL = "(unparseable URL)";

/**
 * Resolves the database name a test would connect to, using the same rule as
 * `src/config/env.ts`: explicit `DATABASE_URL`, else the built-in default.
 * Credentials are never included in the returned value.
 */
export function inspectDatabaseUrl(rawUrl: string | undefined = process.env.DATABASE_URL): DatabaseTarget {
  const provided = typeof rawUrl === "string" && rawUrl.trim() !== "";
  const url = provided ? (rawUrl as string).trim() : DEFAULT_OPERATIONAL_DATABASE_URL;
  const source = provided ? "DATABASE_URL" : "built-in default (DATABASE_URL is not set)";

  try {
    const parsed = new URL(url);
    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    return {
      databaseName: databaseName === "" ? EMPTY_DATABASE_NAME : databaseName,
      host: parsed.hostname || null,
      port: parsed.port || null,
      source,
    };
  } catch {
    return { databaseName: UNPARSEABLE_DATABASE_URL, host: null, port: null, source };
  }
}

export function isDisposableDatabaseName(databaseName: string): boolean {
  const name = databaseName.toLowerCase();
  if (FORBIDDEN_DATABASE_NAMES.includes(name)) return false;
  if (FORBIDDEN_DATABASE_PREFIXES.some((prefix) => name.startsWith(prefix))) return false;
  if (databaseName === EMPTY_DATABASE_NAME || databaseName === UNPARSEABLE_DATABASE_URL) return false;
  return DISPOSABLE_DATABASE_PATTERNS.some((pattern) => pattern.test(databaseName));
}

function refusalMessage(context: string, target: DatabaseTarget, reason: string): string {
  const where = target.host ? `${target.host}${target.port ? `:${target.port}` : ""}` : "unknown host";
  return [
    `Refusing to run "${context}" against a non-disposable database.`,
    "",
    `Resolved database: ${target.databaseName}`,
    `Resolved server:   ${where}`,
    `Resolved from:     ${target.source}`,
    `Reason:            ${reason}`,
    "",
    "This guard fires before any INSERT, migration, fixture, cleanup or DELETE executes, so no",
    "statement has been sent to that database.",
    "",
    "Allowed database names:",
    "  dmr_d4_verify, dmr_test_<name>, dmr_e2e_<name>, <name>_test",
    "Never allowed:",
    "  dmr_poultries, postgres, template0, template1",
    "",
    "Set a disposable database, for example:",
    '  DATABASE_URL="postgresql://<user>:<password>@localhost:5432/dmr_test_<yourname>" \\',
    "    node -r ./tests/helpers/osUserInfoShim.cjs --import tsx --test <test-file>",
  ].join("\n");
}

/**
 * Throws `OperationalDatabaseRefusedError` unless the resolved database is
 * disposable. Call it at the top of a test file, before the first query.
 *
 * @param context human-readable owner of the check, e.g. the test file path
 * @param rawUrl  override, defaulting to `process.env.DATABASE_URL`
 */
export function assertDisposableTestDatabase(
  context: string,
  rawUrl: string | undefined = process.env.DATABASE_URL
): DatabaseTarget {
  const target = inspectDatabaseUrl(rawUrl);

  if (target.databaseName === UNPARSEABLE_DATABASE_URL) {
    throw new OperationalDatabaseRefusedError(
      refusalMessage(context, target, "the URL could not be parsed"),
      context,
      target.databaseName
    );
  }
  if (target.databaseName === EMPTY_DATABASE_NAME) {
    throw new OperationalDatabaseRefusedError(
      refusalMessage(context, target, "the URL has an empty database name"),
      context,
      target.databaseName
    );
  }
  if (
    FORBIDDEN_DATABASE_NAMES.includes(target.databaseName.toLowerCase()) ||
    FORBIDDEN_DATABASE_PREFIXES.some((prefix) => target.databaseName.toLowerCase().startsWith(prefix))
  ) {
    throw new OperationalDatabaseRefusedError(
      refusalMessage(context, target, "this database is operational (or a copy of it) and must never receive test data"),
      context,
      target.databaseName
    );
  }
  if (!isDisposableDatabaseName(target.databaseName)) {
    throw new OperationalDatabaseRefusedError(
      refusalMessage(context, target, "the database name is not a recognised disposable test database"),
      context,
      target.databaseName
    );
  }
  return target;
}
