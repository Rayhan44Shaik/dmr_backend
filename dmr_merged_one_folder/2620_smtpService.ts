import nodemailer from "nodemailer";
import { env, smtpFlags } from "../config/env.js";
import { AppError } from "../middleware/errorHandler.js";

export type SmtpAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export const SMTP_NOT_CONFIGURED_MESSAGE =
  "Email service is not configured. Please contact the administrator.";

export const SMTP_SEND_FAILED_MESSAGE = "Unable to send email.";

const SECRET_ENV_NAMES = ["SMTP_PASS", "SMTP_PASSWORD", "SMTP_USER", "SMTP_HOST"] as const;

export function missingSmtpKeys(): string[] {
  const missing: string[] = [];
  if (!env.smtpHost) missing.push("SMTP_HOST");
  if (env.smtpHost && env.smtpHost !== "json") {
    if (!env.smtpUser) missing.push("SMTP_USER");
    if (!env.smtpPass) missing.push("SMTP_PASS");
  }
  return missing;
}

export function isSmtpConfigured(): boolean {
  return missingSmtpKeys().length === 0;
}

export function logSmtpStartupStatus(): void {
  const flags = smtpFlags();
  console.log(`SMTP_HOST configured: ${flags.SMTP_HOST}`);
  console.log(`SMTP_PORT configured: ${flags.SMTP_PORT}`);
  console.log(`SMTP_USER configured: ${flags.SMTP_USER}`);
  console.log(`SMTP_PASS configured: ${flags.SMTP_PASS}`);
  console.log(`SMTP_FROM configured: ${flags.SMTP_FROM}`);
  const missing = missingSmtpKeys();
  if (missing.length === 0) {
    console.log("SMTP: configured (credentials are not logged)");
    return;
  }
  console.warn(
    `SMTP: not configured (missing ${missing.join(", ")}). Shop delivery emails will fail until these environment variables are set.`
  );
}

function secretValues(): string[] {
  return [env.smtpPass, env.smtpUser].filter((value) => value.length > 0);
}

export function containsSmtpSecret(text: string): boolean {
  const lower = text.toLowerCase();
  if (SECRET_ENV_NAMES.some((name) => lower.includes(name.toLowerCase()))) return true;
  return secretValues().some((secret) => secret.length >= 3 && text.includes(secret));
}

function isAuthFailure(err: unknown): boolean {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: unknown }).code ?? "")
      : "";
  if (code === "EAUTH") return true;
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /(?:^|\b)(?:eauth|invalid login|authentication|username and password not accepted)(?:\b|$)/i.test(
    message
  );
}

export function toSafeSmtpUserMessage(err: unknown): string {
  if (!isSmtpConfigured()) return SMTP_NOT_CONFIGURED_MESSAGE;
  if (err instanceof AppError && /not configured/i.test(err.message)) {
    return SMTP_NOT_CONFIGURED_MESSAGE;
  }
  if (isAuthFailure(err)) return SMTP_SEND_FAILED_MESSAGE;
  if (err instanceof AppError && !containsSmtpSecret(err.message) && !/not configured/i.test(err.message)) {
    return err.message;
  }
  return SMTP_SEND_FAILED_MESSAGE;
}

function logSendFailure(err: unknown): void {
  const code =
    err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code ?? "") : "";
  const name = err instanceof Error ? err.name : "Error";
  console.error("[smtp] send failed", { name, code: code || undefined });
}

function createTransport() {
  if (env.smtpHost === "json") {
    return nodemailer.createTransport({ jsonTransport: true });
  }
  const port = env.smtpPort;
  return nodemailer.createTransport({
    host: env.smtpHost,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass.replace(/\s+/g, ""),
    },
  });
}

export const smtpService = {
  isConfigured: isSmtpConfigured,

  async verifyConnection(): Promise<{ configured: boolean; connected: boolean }> {
    if (!isSmtpConfigured()) {
      return { configured: false, connected: false };
    }
    if (env.smtpHost === "json") {
      return { configured: true, connected: true };
    }
    try {
      const transporter = createTransport();
      await transporter.verify();
      return { configured: true, connected: true };
    } catch (err) {
      logSendFailure(err);
      return { configured: true, connected: false };
    }
  },

  async sendMail(input: {
    to: string;
    subject: string;
    text: string;
    attachments: SmtpAttachment[];
  }): Promise<void> {
    if (!isSmtpConfigured()) {
      throw new AppError(422, SMTP_NOT_CONFIGURED_MESSAGE);
    }
    const from = env.smtpFrom || env.smtpUser;
    const transporter = createTransport();
    try {
      await transporter.sendMail({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        attachments: input.attachments.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType ?? "application/pdf",
        })),
      });
    } catch (err) {
      logSendFailure(err);
      throw new AppError(422, toSafeSmtpUserMessage(err));
    }
  },
};
