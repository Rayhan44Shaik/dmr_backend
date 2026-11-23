#!/usr/bin/env node
/**
 * Read-only production configuration check.
 *
 * Verifies a candidate backend env file (and optionally the Cloudflare Pages
 * variable file) against what the application actually requires:
 *   backend/src/config/env.ts        - startup validation rules
 *   backend/src/services/authService - MFA_SECRET_KEY format (64 hex chars)
 *   frontend/.../functions/api       - API_ORIGIN + proxy secret rules
 *
 * It NEVER prints a value: only variable names, PASS/WARN/FAIL, and static
 * reasons. Exit code is non-zero when any check FAILs.
 *
 * Usage:
 *   node scripts/checkProductionConfig.mjs --env-file <backend.env> [--pages-file <pages.txt>]
 */
import fs from "node:fs";
import path from "node:path";

const RANK = { PASS: 0, WARN: 1, FAIL: 2 };
const results = [];
let currentGroup = "";

function group(name) {
  currentGroup = name;
  results.push({ group: name, level: "GROUP", message: "" });
}

function record(level, name, message = "") {
  results.push({ group: currentGroup, level, name, message });
}

function pass(name, message = "") {
  record("PASS", name, message);
}
function warn(name, message = "") {
  record("WARN", name, message);
}
function fail(name, message = "") {
  record("FAIL", name, message);
}

/** Parse KEY=VALUE lines. Blank lines and # comments are ignored. */
function parseEnvFile(file) {
  const text = fs.readFileSync(file, "utf8");
  const map = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map.set(key, value);
  }
  return map;
}

/** Placeholder / unedited markers. The marker itself is never echoed. */
function isPlaceholder(value) {
  if (value === undefined || value === null) return true;
  const v = value.trim();
  if (v === "") return true;
  if (/[<>]/.test(v)) return true;
  return /^(changeme|change-me|replace[-_]?me|todo|tbd|example|placeholder)$/i.test(v);
}

function isHttpOrigin(value) {
  try {
    const parsed = new URL(value);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    if (parsed.username || parsed.password) return false;
    return parsed.origin === value;
  } catch {
    return false;
  }
}

function isLoopbackHost(value) {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return ["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(host);
  } catch {
    return false;
  }
}

function uniqueChars(value) {
  return new Set(value).size;
}

function checkBackend(file) {
  const vars = parseEnvFile(file);
  group(`Backend environment file: ${file}`);

  // NODE_ENV ---------------------------------------------------------------
  if (vars.get("NODE_ENV") === "production") pass("NODE_ENV", "production");
  else fail("NODE_ENV", "must be exactly 'production' for the hardened behavior");

  // PORT -------------------------------------------------------------------
  const portRaw = vars.get("PORT");
  const port = Number(portRaw);
  if (portRaw === undefined || portRaw.trim() === "") {
    warn("PORT", "not set; defaults to 4000");
  } else if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    fail("PORT", "must be an integer between 1 and 65535");
  } else {
    pass("PORT", String(port));
  }

  // DATABASE_URL -----------------------------------------------------------
  const databaseUrl = vars.get("DATABASE_URL");
  if (isPlaceholder(databaseUrl)) {
    fail("DATABASE_URL", "not supplied (paste the operational PostgreSQL URL)");
  } else {
    try {
      const parsed = new URL(databaseUrl);
      const okProtocol = parsed.protocol === "postgresql:" || parsed.protocol === "postgres:";
      const okTarget = parsed.hostname !== "" && parsed.pathname.replace(/^\//, "") !== "";
      if (!okProtocol) fail("DATABASE_URL", "must use the postgresql:// scheme");
      else if (!okTarget) fail("DATABASE_URL", "must include a host and a database name");
      else pass("DATABASE_URL", "present, parseable (value not shown)");
    } catch {
      fail("DATABASE_URL", "is not a parseable URL");
    }
  }

  // CORS_ORIGIN ------------------------------------------------------------
  const corsRaw = vars.get("CORS_ORIGIN");
  if (isPlaceholder(corsRaw)) {
    fail("CORS_ORIGIN", "not supplied (use the Pages production origin)");
  } else {
    const entries = String(corsRaw).split(",").map((entry) => entry.trim());
    if (entries.some((entry) => entry === "")) {
      fail("CORS_ORIGIN", "contains an empty entry");
    } else if (entries.includes("*")) {
      fail("CORS_ORIGIN", "wildcard is not allowed with credentials");
    } else {
      const bad = entries.filter((entry) => !isHttpOrigin(entry));
      if (bad.length) {
        fail("CORS_ORIGIN", "every entry must be an exact http(s) origin (no path, no trailing slash)");
      } else if (entries.some((entry) => isLoopbackHost(entry))) {
        fail("CORS_ORIGIN", "must not contain a localhost origin in production");
      } else if (entries.some((entry) => new URL(entry).protocol !== "https:")) {
        fail("CORS_ORIGIN", "must be HTTPS in production");
      } else if (entries.length > 2) {
        fail("CORS_ORIGIN", `lists ${entries.length} origins; keep only the intended Pages origin(s)`);
      } else {
        pass("CORS_ORIGIN", `${entries.length} HTTPS origin(s)`);
      }
    }
  }

  // TRUSTED_PROXY_SECRET ---------------------------------------------------
  const proxy = vars.get("TRUSTED_PROXY_SECRET");
  if (isPlaceholder(proxy)) {
    fail("TRUSTED_PROXY_SECRET", "not supplied");
  } else if (proxy.length < 32) {
    fail("TRUSTED_PROXY_SECRET", `too short (${proxy.length} chars; minimum 32)`);
  } else if (uniqueChars(proxy) < 10) {
    fail("TRUSTED_PROXY_SECRET", "low entropy (too few distinct characters)");
  } else {
    pass("TRUSTED_PROXY_SECRET", `${proxy.length} chars, ${uniqueChars(proxy)} distinct`);
  }

  // MFA_SECRET_KEY (used as a 32-byte AES-256-GCM key) ----------------------
  const mfa = vars.get("MFA_SECRET_KEY");
  if (isPlaceholder(mfa)) {
    fail("MFA_SECRET_KEY", "not supplied; required for production startup");
  } else if (!/^[0-9a-fA-F]{64}$/.test(mfa)) {
    fail("MFA_SECRET_KEY", "must be exactly 64 hex characters (32 bytes)");
  } else {
    pass("MFA_SECRET_KEY", "64 hex characters (32 bytes)");
  }

  // SMTP -------------------------------------------------------------------
  const smtpKeys = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"];
  const smtpSet = smtpKeys.filter((key) => {
    const value = vars.get(key);
    return value !== undefined && value.trim() !== "";
  });
  if (smtpSet.length === 0) {
    warn("SMTP_*", "not configured; password-reset emails will not be delivered");
  } else {
    if (isPlaceholder(vars.get("SMTP_HOST"))) fail("SMTP_HOST", "not supplied");
    else pass("SMTP_HOST", "present (value not shown)");

    const smtpPortRaw = vars.get("SMTP_PORT");
    const smtpPort = Number(smtpPortRaw ?? "587");
    if (isPlaceholder(smtpPortRaw)) {
      fail("SMTP_PORT", "not supplied (usually 587, or 465 for implicit TLS)");
    } else if (!Number.isSafeInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
      fail("SMTP_PORT", "must be an integer between 1 and 65535");
    } else {
      pass("SMTP_PORT", String(smtpPort));
    }

    const user = vars.get("SMTP_USER");
    const password = vars.get("SMTP_PASS");
    const hasUser = !isPlaceholder(user);
    const hasPass = !isPlaceholder(password);
    if (hasUser !== hasPass) fail("SMTP_USER/SMTP_PASS", "must be configured together");
    else pass("SMTP_USER/SMTP_PASS", hasUser ? "both present (values not shown)" : "both absent (unauthenticated relay)");

    const from = vars.get("SMTP_FROM") ?? user ?? "";
    if (isPlaceholder(from) || !/@/.test(from) || /[\r\n]/.test(from)) {
      fail("SMTP_FROM", "must be a usable email address (or SMTP_USER must be one)");
    } else {
      pass("SMTP_FROM", "present (value not shown)");
    }
  }

  // APP_PUBLIC_URL ---------------------------------------------------------
  const publicUrl = vars.get("APP_PUBLIC_URL");
  if (publicUrl === undefined || publicUrl.trim() === "") {
    warn("APP_PUBLIC_URL", "not set; reset links fall back to the first CORS origin");
  } else if (isPlaceholder(publicUrl) || !isHttpOrigin(publicUrl) || new URL(publicUrl).protocol !== "https:") {
    fail("APP_PUBLIC_URL", "must be an exact HTTPS origin");
  } else {
    pass("APP_PUBLIC_URL", "exact HTTPS origin");
  }

  // Delivery switch --------------------------------------------------------
  if (vars.get("SMTP_DELIVERY_ENABLED") !== undefined) {
    warn("SMTP_DELIVERY_ENABLED", "not needed in production; remove it (delivery is automatic)");
  }

  return vars;
}

function checkPages(file, backendVars) {
  const vars = parseEnvFile(file);
  group(`Cloudflare Pages variables: ${file}`);

  const apiOrigin = vars.get("API_ORIGIN");
  if (isPlaceholder(apiOrigin)) {
    fail("API_ORIGIN", "not supplied (use the HTTPS tunnel hostname)");
  } else if (!isHttpOrigin(apiOrigin) || new URL(apiOrigin).protocol !== "https:") {
    fail("API_ORIGIN", "must be an exact HTTPS origin with no path");
  } else if (isLoopbackHost(apiOrigin)) {
    fail("API_ORIGIN", "must be the tunnel hostname, not localhost");
  } else {
    pass("API_ORIGIN", "exact HTTPS origin");
  }

  const secret = vars.get("TRUSTED_PROXY_SECRET");
  if (isPlaceholder(secret)) {
    fail("TRUSTED_PROXY_SECRET", "not supplied");
  } else if (secret.length < 32) {
    fail("TRUSTED_PROXY_SECRET", `too short (${secret.length} chars; minimum 32)`);
  } else if (uniqueChars(secret) < 10) {
    fail("TRUSTED_PROXY_SECRET", "low entropy (too few distinct characters)");
  } else {
    pass("TRUSTED_PROXY_SECRET", `${secret.length} chars, ${uniqueChars(secret)} distinct`);
  }

  // The two sides must carry the identical value.
  const backendSecret = backendVars?.get("TRUSTED_PROXY_SECRET");
  if (backendSecret && secret) {
    if (backendSecret.trim() === secret.trim()) pass("PROXY_SECRET_MATCH", "backend and Pages values match");
    else fail("PROXY_SECRET_MATCH", "backend and Pages values differ");
  }

  // Public build variables must never contain the proxy secret.
  const leaked = [...vars.keys()].filter((key) => /^VITE_/i.test(key));
  if (leaked.length) {
    fail("VITE_*", `Pages file defines build-time public variables (${leaked.join(", ")}); the proxy secret must not be one`);
  } else {
    pass("VITE_*", "no public build variables in the Pages file");
  }
}

function printReport() {
  let worst = "PASS";
  for (const row of results) {
    if (row.level === "GROUP") {
      console.log(`\n${row.group}`);
      continue;
    }
    console.log(`  ${row.level.padEnd(4)}  ${row.name}${row.message ? ` — ${row.message}` : ""}`);
    if (RANK[row.level] > RANK[worst]) worst = row.level;
  }
  console.log(`\nRESULT: ${worst}`);
  return worst;
}

// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
function argValue(flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? null : argv[index + 1] ?? null;
}

const envFile = argValue("--env-file");
const pagesFile = argValue("--pages-file");
if (!envFile) {
  console.error("usage: node scripts/checkProductionConfig.mjs --env-file <backend.env> [--pages-file <pages.txt>]");
  process.exit(2);
}
if (!fs.existsSync(path.resolve(envFile))) {
  console.error("checkProductionConfig: backend env file not found");
  process.exit(2);
}

const backendVars = checkBackend(path.resolve(envFile));
if (pagesFile) {
  if (!fs.existsSync(path.resolve(pagesFile))) {
    console.error("checkProductionConfig: Pages variable file not found");
    process.exit(2);
  }
  checkPages(path.resolve(pagesFile), backendVars);
}

const worst = printReport();
process.exit(worst === "FAIL" ? 1 : 0);
