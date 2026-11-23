import { readFileSync } from "node:fs";
import { rootCertificates, type ConnectionOptions } from "node:tls";
import nodemailer, { type Transporter } from "nodemailer";
import {
  env,
  isSmtpDeliveryEnabled,
  readSmtpConfiguration,
  type SmtpConfiguration,
} from "../config/env.js";

/**
 * Password-reset email delivery.
 *
 * Rules enforced here:
 *  - configuration comes from environment variables only;
 *  - an unusable configuration disables delivery instead of throwing at
 *    request time (the caller still answers generically);
 *  - provider errors are reduced to a static code before they reach a log, so
 *    credentials, host names, recipients and tokens can never leak;
 *  - the reset link is the ONLY place the raw token appears outside the
 *    service layer, and it is never logged or returned by an API route;
 *  - the transport is encrypted: port 465 uses implicit TLS, every other port
 *    must complete STARTTLS before AUTH or the message body is written, and
 *    certificates are always verified against the system trust store.
 */

export type PasswordResetMailInput = {
  to: string;
  resetUrl: string;
  expiresMinutes: number;
};

const SMTP_TIMEOUT_MS = 10_000;

let cachedTransport: { transport: Transporter; signature: string } | null = null;

function transportSignature(smtp: SmtpConfiguration): string {
  // Identity of the transport settings WITHOUT the password: a rotated
  // credential must produce a new transport, but the password itself is never
  // stored outside the process environment.
  return [smtp.host, smtp.port, smtp.user, smtp.pass ? "auth" : "noauth", smtp.secure, smtp.tlsCaFile].join("|");
}

/**
 * Trust anchors for the SMTP TLS session.
 *
 * Validation is always ON (`rejectUnauthorized: true`) and TLS 1.2 is the floor.
 * `SMTP_TLS_CA_FILE` can only ADD a trust anchor — for an internal relay with a
 * private CA — by appending it to Node's own root bundle. There is deliberately
 * no option that disables certificate checks.
 */
function smtpTlsOptions(smtp: SmtpConfiguration): ConnectionOptions {
  const options: ConnectionOptions = { rejectUnauthorized: true, minVersion: "TLSv1.2" };
  if (smtp.tlsCaFile) {
    const pem = readFileSync(smtp.tlsCaFile, "utf8");
    if (!pem.includes("-----BEGIN CERTIFICATE-----")) {
      throw new Error("SMTP_TLS_CA_FILE does not contain a PEM certificate");
    }
    options.ca = [...rootCertificates, pem].join("\n");
  }
  return options;
}

/**
 * Transport options (exported for tests).
 *
 *  - port 465: implicit TLS from the first byte (`secure: true`);
 *  - any other port: STARTTLS is REQUIRED (`requireTLS: true`), so nodemailer
 *    aborts with `ETLS` instead of sending credentials or message content over
 *    a plaintext connection;
 *  - certificates are verified and TLS 1.2+ is required.
 */
export function smtpTransportOptions(smtp: SmtpConfiguration) {
  return {
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: !smtp.secure,
    ignoreTLS: false,
    tls: smtpTlsOptions(smtp),
    ...(smtp.user && smtp.pass ? { auth: { user: smtp.user, pass: smtp.pass } } : {}),
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  };
}

function transportFor(smtp: SmtpConfiguration): Transporter {
  const signature = transportSignature(smtp);
  if (cachedTransport && cachedTransport.signature === signature) return cachedTransport.transport;
  const transport = nodemailer.createTransport(smtpTransportOptions(smtp));
  cachedTransport = { transport, signature };
  return transport;
}

/**
 * Static, non-secret description of a send failure. Only a well-formed error
 * code (for example `ECONNREFUSED`) is surfaced; messages and stacks are
 * dropped because they can embed host names, recipients, credentials, or the
 * message body.
 */
export function describeSmtpFailure(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[A-Z0-9_]{2,40}$/.test(code)
    ? `SMTP_SEND_FAILED:${code}`
    : "SMTP_SEND_FAILED";
}

/** Absolute reset link consumed by the sign-in screen (`?resetToken=`). */
export function buildPasswordResetUrl(token: string): string {
  const base = env.appBaseUrl.replace(/\/+$/, "");
  return `${base}/?resetToken=${encodeURIComponent(token)}`;
}

export function passwordResetEmailBody(input: PasswordResetMailInput): string {
  return [
    "A password reset was requested for your DMR Poultries ERP account.",
    "",
    "Open this link to choose a new password:",
    input.resetUrl,
    "",
    `The link expires in ${input.expiresMinutes} minutes and can be used once.`,
    "If you did not request this, you can ignore this email; your password stays unchanged.",
    "",
    "DMR Poultries ERP",
  ].join("\n");
}

/**
 * Send the reset link. Returns false (never throws) when delivery is
 * unavailable or the provider rejects the message, so the request handler can
 * keep one identical outward response.
 */
export async function sendPasswordResetEmail(input: PasswordResetMailInput): Promise<boolean> {
  if (!isSmtpDeliveryEnabled()) {
    // Development/testing default: never email a real user just because the
    // local environment holds working SMTP credentials.
    console.warn(
      "[password-reset] email delivery is disabled outside production (set SMTP_DELIVERY_ENABLED=true to opt in)",
    );
    return false;
  }
  const smtp = readSmtpConfiguration();
  if (!smtp.configured) {
    console.warn(`[password-reset] email delivery skipped: ${smtp.problem ?? "SMTP is not configured"}`);
    return false;
  }
  try {
    await transportFor(smtp).sendMail({
      from: smtp.from,
      to: input.to,
      subject: "Reset your DMR Poultries ERP password",
      text: passwordResetEmailBody(input),
    });
    return true;
  } catch (error) {
    // Static code only — no provider message, recipient, or link.
    console.warn(`[password-reset] email delivery failed (${describeSmtpFailure(error)})`);
    return false;
  }
}

/** Test/diagnostic seam: forget any cached transport. */
export function resetMailTransportCache(): void {
  cachedTransport = null;
}

/** Safe status for operators: booleans/static reasons only, never values. */
export function smtpStatus(): { configured: boolean; problem: string | null } {
  const smtp = readSmtpConfiguration();
  return { configured: smtp.configured, problem: smtp.problem };
}
