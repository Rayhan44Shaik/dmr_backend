import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Local default: Database dmr_poultries @ localhost:5432 as user dmr
const DEFAULT_DATABASE_URL =
  "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries";

/**
 * Mail transport configuration, derived from environment variables only.
 *
 * `problem` is a short, static description of the FIRST configuration issue —
 * never a value, host name, or credential. Missing or unusable SMTP must not
 * stop the API from running: password-reset delivery is simply disabled and
 * the caller keeps returning its generic response.
 */
export type SmtpConfiguration = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  /** Implicit TLS on the submission port (465). Every other port uses STARTTLS. */
  secure: boolean;
  /**
   * Optional extra PEM trust anchor for an internal SMTP server that uses a
   * private CA. It ADDS trust; validation is never turned off.
   */
  tlsCaFile: string;
  configured: boolean;
  problem: string | null;
};

const DEFAULT_SMTP_PORT = 587;
// Deliberately permissive: the transport (not this check) is the authority on
// address syntax. This only rejects empty, oversized, or header-injecting
// values so a stored address can never smuggle extra mail headers.
const ADDRESS_SHAPE = /^[^\s@,<>]{1,64}@[^\s@,<>]{1,255}$/;

/** True when the value can be used as a single envelope recipient. */
export function isUsableEmailAddress(value: string | null | undefined): boolean {
  const candidate = String(value ?? "").trim();
  if (!candidate || candidate.length > 320) return false;
  if (/[\r\n]/.test(candidate)) return false;
  return ADDRESS_SHAPE.test(candidate);
}

/** First address inside `Name <addr>` or a bare address; null when unusable. */
function extractAddress(value: string): string | null {
  const angle = /<([^<>]+)>\s*$/.exec(value);
  const candidate = (angle ? angle[1] : value).trim();
  return isUsableEmailAddress(candidate) ? candidate : null;
}

export function readSmtpConfiguration(source: NodeJS.ProcessEnv = process.env): SmtpConfiguration {
  const host = (source.SMTP_HOST ?? "").trim();
  const portRaw = (source.SMTP_PORT ?? "").trim();
  const user = (source.SMTP_USER ?? "").trim();
  // A password may legitimately contain leading/trailing spaces: never trim it.
  const pass = source.SMTP_PASS ?? "";
  const fromRaw = (source.SMTP_FROM ?? "").trim();
  const tlsCaFile = (source.SMTP_TLS_CA_FILE ?? "").trim();

  const problems: string[] = [];
  if (tlsCaFile !== "") {
    // Fail closed: a configured-but-unreadable bundle disables delivery instead
    // of silently falling back to the system trust store.
    try {
      fs.accessSync(tlsCaFile, fs.constants.R_OK);
    } catch {
      problems.push("SMTP_TLS_CA_FILE is not readable");
    }
  }
  let port = DEFAULT_SMTP_PORT;
  if (portRaw !== "") {
    const parsed = Number(portRaw);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65535) {
      problems.push("SMTP_PORT must be an integer between 1 and 65535");
    } else {
      port = parsed;
    }
  }

  // Authenticated submission needs both halves; a local relay needs neither.
  const hasUser = user !== "";
  const hasPass = pass.trim() !== "";
  if (hasUser !== hasPass) {
    problems.push("SMTP_USER and SMTP_PASS must be configured together");
  }

  const from = fromRaw || user;
  if (host === "") {
    problems.push("SMTP_HOST is not configured");
  }
  if (from === "" || extractAddress(from) === null) {
    problems.push("SMTP_FROM (or SMTP_USER) must be a valid email address");
  }

  return {
    host,
    port,
    user,
    pass,
    from,
    secure: port === 465,
    tlsCaFile,
    configured: problems.length === 0,
    problem: problems[0] ?? null,
  };
}

/**
 * Real delivery is opt-in outside production, so a development machine never
 * emails real users just because `.env` happens to hold working credentials.
 * Production is enabled whenever the transport is configured.
 */
export function isSmtpDeliveryEnabled(source: NodeJS.ProcessEnv = process.env): boolean {
  if ((source.NODE_ENV ?? "development") === "production") return true;
  return (source.SMTP_DELIVERY_ENABLED ?? "").trim().toLowerCase() === "true";
}

/** Narrow a value to a bare http(s) origin, or null when unusable. */
function parsePublicOrigin(value: string | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    if (parsed.username || parsed.password) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/** Deterministic strength rule shared by startup validation and unit tests. */
export function isStrongTrustedProxySecret(value: string | null | undefined): boolean {
  const candidate = (value ?? "").trim();
  return candidate.length >= 32 && new Set(candidate).size >= 10;
}

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env) {
  const nodeEnv = source.NODE_ENV ?? "development";
  if (nodeEnv === "production" && !source.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required when NODE_ENV=production.");
  }
  if (nodeEnv === "production" && !source.CORS_ORIGIN?.trim()) {
    throw new Error("CORS_ORIGIN is required when NODE_ENV=production.");
  }
  const trustedProxySecret = source.TRUSTED_PROXY_SECRET?.trim() || null;
  if (nodeEnv === "production" && !isStrongTrustedProxySecret(trustedProxySecret)) {
    throw new Error(
      "TRUSTED_PROXY_SECRET must be at least 32 characters with at least 10 distinct characters when NODE_ENV=production.",
    );
  }
  if (nodeEnv === "production" && !/^[0-9a-fA-F]{64}$/.test(source.MFA_SECRET_KEY ?? "")) {
    throw new Error("MFA_SECRET_KEY must be exactly 64 hexadecimal characters when NODE_ENV=production.");
  }
  const port = Number(source.PORT ?? 4000);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  const corsOrigin = parseCorsOrigins(source.CORS_ORIGIN);
  return {
    port,
    nodeEnv,
    databaseUrl: source.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL,
    corsOrigin,
    trustedProxySecret,
    smtp: readSmtpConfiguration(source),
    // Where a reset link points. APP_PUBLIC_URL wins; otherwise the first
    // configured browser origin is the sign-in screen that reads ?resetToken=.
    appBaseUrl: parsePublicOrigin(source.APP_PUBLIC_URL) ?? corsOrigin[0] ?? "http://localhost:5173",
  };
}

export function parseCorsOrigins(raw: string | undefined): string[] {
  const value = raw ?? "http://localhost:5173";
  const entries = value.split(",").map((item) => item.trim());
  if (entries.some((item) => !item)) {
    throw new Error("Invalid CORS configuration: origins must not be empty.");
  }
  if (entries.includes("*")) {
    throw new Error("Invalid CORS configuration: wildcard origin is not allowed with credentials.");
  }
  for (const origin of entries) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error("Invalid CORS configuration: every origin must be an absolute HTTP(S) origin.");
    }
    if (!/^https?:$/.test(parsed.protocol) || parsed.origin !== origin || parsed.username || parsed.password) {
      throw new Error("Invalid CORS configuration: every origin must be an absolute HTTP(S) origin.");
    }
  }
  return [...new Set(entries)];
}

export const env = loadEnvironment();
