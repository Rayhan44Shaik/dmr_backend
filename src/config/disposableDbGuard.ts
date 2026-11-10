/**
 * Test-only safety guard for backend tests that talk to a PostgreSQL
 * server through the shared pool (`src/config/db.ts`).
 *
 * Why this exists (D8): `src/config/env.ts` auto-loads `backend/.env`, and
 * `src/config/db.ts` falls back to a built-in default URL. Both point at
 * `dmr_poultries` — the operational database. A test file that imports the
 * pool and forgets to override `DATABASE_URL` therefore writes fixtures into
 * operational data. This guard makes that failure mode impossible to reach:
 * it runs synchronously, before any INSERT/migration/fixture/DELETE, and
 * refuses to continue unless the resolved database is clearly
 * disposable.
 *
 * DBSAFE-1 adds fail-closed enforcement for every test/E2E path:
 *  - `dmr_poultries` and any `dmr_poultries`-prefixed name are refused, with
 *    exactly one documented exception: the setup script's historic default
 *    `dmr_poultries_e2e` (deprecated, warns on every use).
 *  - production-like hostnames (managed Postgres suffixes, prod/live tokens)
 *    and any non-loopback host are refused unless the database name is
 *    allowed AND `ALLOW_REMOTE_TEST_DB=1` is explicitly set.
 *  - the PGlite gateway (`postgres` on loopback) is accepted ONLY with an
 *    explicit caller opt-in (`allowPgliteGateway`), because a real
 *    PostgreSQL cluster also has a `postgres` maintenance database.
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

/**
 * DBSAFE-1: single documented exception to the `dmr_poultries` prefix rule.
 * This is the historic default database name of `src/scripts/setupE2eDatabase.ts`
 * (and `e2e.env.example`). It stays connectable by tests so existing disposable
 * E2E databases keep working, but every use logs a deprecation warning.
 * All OTHER `dmr_poultries*` names stay refused. A future batch may rename the
 * setup default to `dmr_e2e_default`; that rename is explicitly out of scope.
 */
export const GRANDFATHERED_DATABASE_NAMES: readonly string[] = ["dmr_poultries_e2e"];

/** DBSAFE-1: hosts that are always test-local. Anything else is remote. */
export const LOOPBACK_HOSTS: readonly string[] = ["localhost", "127.0.0.1", "::1"];

/**
 * DBSAFE-1: managed PostgreSQL host suffixes. A test must never silently
 * target a cloud database just because its name looks disposable — the README
 * documents RDS/Neon/Supabase migration purely through `DATABASE_URL`.
 */
export const MANAGED_POSTGRES_HOST_SUFFIXES: readonly string[] = [
  "rds.amazonaws.com",
  "neon.tech",
  "supabase.co",
  "supabase.com",
  "googleapis.com",
  "database.azure.com",
  "herokuapp.com",
  "herokussl.com",
];

/**
 * DBSAFE-1: hostname tokens that mark a host as production-like. Matched as
 * whole dot/dash/underscore-separated tokens (`prod-db` matches, `liveoak`
 * does not), case-insensitively.
 */
export const PRODUCTION_LIKE_HOST_TOKENS: readonly string[] = [
  "prod",
  "production",
  "live",
  "primary",
];

/**
 * DBSAFE-1: explicit opt-in that allows an allowed (disposable or
 * grandfathered) database name on a non-loopback host. Fail-closed default:
 * nothing in the repo sets it; CI for a remote throwaway cluster must set
 * `ALLOW_REMOTE_TEST_DB=1` deliberately.
 */
export const ALLOW_REMOTE_TEST_DB_ENV = "ALLOW_REMOTE_TEST_DB";

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
 * Resolves the database a test would connect to, using the same rule as
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

/** DBSAFE-1: exact (case-insensitive) match only — `dmr_poultries_e2e_backup` is NOT covered. */
export function isGrandfatheredDatabaseName(databaseName: string): boolean {
  return GRANDFATHERED_DATABASE_NAMES.includes(databaseName.toLowerCase());
}

/** DBSAFE-1: `localhost`, IPv4 loopback, and IPv6 loopback (with or without brackets). */
export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return (LOOPBACK_HOSTS as readonly string[]).includes(normalized);
}

/** DBSAFE-1: exact suffix or dot-separated subsuffix match, case-insensitive. */
export function isManagedPostgresHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return MANAGED_POSTGRES_HOST_SUFFIXES.some(
    (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`)
  );
}

/** DBSAFE-1: whole-token match so `liveoak` does not count but `live-db` does. */
export function hasProductionLikeHostToken(host: string): boolean {
  const tokens = host.toLowerCase().split(/[.\-_]/);
  return tokens.some((token) =>
    (PRODUCTION_LIKE_HOST_TOKENS as readonly string[]).includes(token)
  );
}

/** DBSAFE-1: the only way a non-loopback host passes. Fail-closed default. */
export function isRemoteTestingAllowed(): boolean {
  return process.env[ALLOW_REMOTE_TEST_DB_ENV] === "1";
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
    "Deprecated exception (warns on every use): dmr_poultries_e2e",
    "Never allowed:",
    "  dmr_poultries, dmr_poultries_* (except the exception above), postgres, template0, template1",
    "Hosts:",
    "  loopback only (localhost, 127.0.0.1, ::1) unless the name is allowed AND",
    `  ${ALLOW_REMOTE_TEST_DB_ENV}=1 is set. Production-like hosts (RDS, Neon, Supabase,`,
    "  Heroku Postgres, Google Cloud SQL, Azure Database, prod/live/primary hostnames)",
    "  are always refused without that explicit opt-in.",
    "",
    "Set a disposable database, for example:",
    '  DATABASE_URL="postgresql://<user>:<password>@localhost:5432/dmr_test_<yourname>" \\',
    "    node -r ./tests/helpers/osUserInfoShim.cjs --import tsx --test <test-file>",
  ].join("\n");
}

export interface DisposableDbGuardOptions {
  /**
   * Allow the `postgres` database name, but ONLY on a loopback host. The
   * PGlite test gateway serves database `postgres` on 127.0.0.1, which is
   * otherwise forbidden because every real PostgreSQL cluster also has a
   * `postgres` maintenance database. Test harnesses pass this when the URL
   * is proven to be the PGlite gateway; every other caller stays refused.
   */
  allowPgliteGateway?: boolean;
}

function isAllowedPgliteTarget(target: DatabaseTarget, options: DisposableDbGuardOptions): boolean {
  return (
    options.allowPgliteGateway === true &&
    target.databaseName.toLowerCase() === "postgres" &&
    target.host !== null &&
    isLoopbackHost(target.host)
  );
}

/**
 * Throws `OperationalDatabaseRefusedError` unless the resolved database is
 * disposable. Call it at the top of a test file, before the first query.
 *
 * @param context human-readable owner of the check, e.g. the test file path
 * @param rawUrl  override, defaulting to `process.env.DATABASE_URL`
 * @param options `{ allowPgliteGateway: true }` for the PGlite gateway only
 */
export function assertDisposableTestDatabase(
  context: string,
  rawUrl: string | undefined = process.env.DATABASE_URL,
  options: DisposableDbGuardOptions = {}
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

  // Host policy first: anything off loopback needs an allowed name plus the
  // explicit remote-testing opt-in. This runs before any name verdict so a
  // production-like host can never be reached even with a disposable name.
  if (target.host !== null && !isLoopbackHost(target.host)) {
    const nameOk =
      isDisposableDatabaseName(target.databaseName) ||
      isGrandfatheredDatabaseName(target.databaseName);
    if (nameOk && !isRemoteTestingAllowed()) {
      if (isManagedPostgresHost(target.host) || hasProductionLikeHostToken(target.host)) {
        throw new OperationalDatabaseRefusedError(
          refusalMessage(
            context,
            target,
            `this is a production-like database host and ${ALLOW_REMOTE_TEST_DB_ENV}=1 is not set`
          ),
          context,
          target.databaseName
        );
      }
      throw new OperationalDatabaseRefusedError(
        refusalMessage(
          context,
          target,
          `non-loopback test hosts require an allowed database name AND ${ALLOW_REMOTE_TEST_DB_ENV}=1`
        ),
        context,
        target.databaseName
      );
    }
    // A non-allowed name on a remote host falls through to the name checks
    // below, which refuse it with the name reason.
  }

  // Deprecated exception: exact match only, still subject to the host policy
  // above. Kept visible with a warning on every use.
  if (isGrandfatheredDatabaseName(target.databaseName)) {
    console.warn(
      `[disposableDbGuard] DEPRECATED: database "${target.databaseName}" is a grandfathered ` +
        `exception to the dmr_poultries-prefix rule (context: ${context}). ` +
        `Prefer dmr_e2e_<name>.`
    );
    return target;
  }

  // PGlite gateway: `postgres` on loopback, only with explicit caller opt-in.
  if (isAllowedPgliteTarget(target, options)) {
    return target;
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
