import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function envCandidatePaths(): string[] {
  return [...new Set([
    path.resolve(__dirname, "../../.env"),
    path.resolve(process.cwd(), ".env"),
  ])];
}

function readEnv(name: string): string {
  return String(process.env[name] ?? "").trim();
}

let loadedEnvPath: string | null = null;
for (const candidate of envCandidatePaths()) {
  if (!fs.existsSync(candidate)) continue;
  const result = dotenv.config({ path: candidate });
  if (!result.error) {
    loadedEnvPath = candidate;
    break;
  }
}

if (loadedEnvPath) {
  console.log(`Env file loaded from ${loadedEnvPath}`);
} else {
  console.warn(
    `Env file not found. Looked in: ${envCandidatePaths().join(", ")}. Using process environment only.`
  );
}

const DEFAULT_DATABASE_URL =
  "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries";

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  corsOrigin: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  get smtpHost() {
    return readEnv("SMTP_HOST");
  },
  set smtpHost(value: string) {
    process.env.SMTP_HOST = value;
  },

  get smtpPort() {
    const parsed = Number(readEnv("SMTP_PORT") || 587);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 587;
  },
  set smtpPort(value: number) {
    process.env.SMTP_PORT = String(value);
  },

  get smtpUser() {
    return readEnv("SMTP_USER");
  },
  set smtpUser(value: string) {
    process.env.SMTP_USER = value;
  },

  get smtpPass() {
    return readEnv("SMTP_PASS");
  },
  set smtpPass(value: string) {
    process.env.SMTP_PASS = value;
  },

  get smtpFrom() {
    return readEnv("SMTP_FROM") || readEnv("SMTP_USER");
  },
  set smtpFrom(value: string) {
    process.env.SMTP_FROM = value;
  },
};

export function smtpFlags(): Record<"SMTP_HOST" | "SMTP_PORT" | "SMTP_USER" | "SMTP_PASS" | "SMTP_FROM", boolean> {
  return {
    SMTP_HOST: Boolean(env.smtpHost),
    SMTP_PORT: Boolean(env.smtpPort),
    SMTP_USER: Boolean(env.smtpUser),
    SMTP_PASS: Boolean(env.smtpPass),
    SMTP_FROM: Boolean(env.smtpFrom),
  };
}
