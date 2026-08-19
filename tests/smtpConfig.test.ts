/**
 * SMTP configuration loading — no real credentials, no live Gmail send.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { env, smtpFlags } from "../src/config/env.js";
import {
  SMTP_NOT_CONFIGURED_MESSAGE,
  SMTP_SEND_FAILED_MESSAGE,
  containsSmtpSecret,
  isSmtpConfigured,
  logSmtpStartupStatus,
  missingSmtpKeys,
  toSafeSmtpUserMessage,
} from "../src/services/smtpService.js";

function snapshotSmtp() {
  return {
    host: env.smtpHost,
    port: env.smtpPort,
    user: env.smtpUser,
    pass: env.smtpPass,
    from: env.smtpFrom,
  };
}

function restoreSmtp(prev: ReturnType<typeof snapshotSmtp>) {
  env.smtpHost = prev.host;
  env.smtpPort = prev.port;
  env.smtpUser = prev.user;
  env.smtpPass = prev.pass;
  env.smtpFrom = prev.from;
}

describe("smtp configuration", () => {
  it("treats Gmail host/user/pass as configured and defaults FROM to USER", () => {
    const prev = snapshotSmtp();
    try {
      env.smtpHost = "smtp.gmail.com";
      env.smtpPort = 587;
      env.smtpUser = "shop@example.com";
      env.smtpPass = "xxxx-app-password";
      env.smtpFrom = "";
      assert.equal(isSmtpConfigured(), true);
      assert.deepEqual(missingSmtpKeys(), []);
      assert.equal(env.smtpPort, 587);
      assert.equal(env.smtpFrom, "shop@example.com");
      const flags = smtpFlags();
      assert.equal(flags.SMTP_HOST, true);
      assert.equal(flags.SMTP_PORT, true);
      assert.equal(flags.SMTP_USER, true);
      assert.equal(flags.SMTP_PASS, true);
      assert.equal(flags.SMTP_FROM, true);
    } finally {
      restoreSmtp(prev);
    }
  });

  it("is not configured when user or pass is missing", () => {
    const prev = snapshotSmtp();
    try {
      env.smtpHost = "smtp.gmail.com";
      env.smtpPort = 587;
      env.smtpUser = "";
      env.smtpPass = "";
      env.smtpFrom = "";
      assert.equal(isSmtpConfigured(), false);
      assert.ok(missingSmtpKeys().includes("SMTP_USER"));
      assert.ok(missingSmtpKeys().includes("SMTP_PASS"));
    } finally {
      restoreSmtp(prev);
    }
  });

  it("logs configuration flags without credential values", () => {
    const prev = snapshotSmtp();
    const lines: string[] = [];
    const origLog = console.log;
    const origWarn = console.warn;
    console.log = (msg?: unknown) => {
      lines.push(String(msg ?? ""));
    };
    console.warn = (msg?: unknown) => {
      lines.push(String(msg ?? ""));
    };
    try {
      env.smtpHost = "smtp.gmail.com";
      env.smtpUser = "real-user@example.com";
      env.smtpPass = "hunter2-secret";
      logSmtpStartupStatus();
      const joined = lines.join("\n");
      assert.match(joined, /SMTP_HOST configured: true/);
      assert.match(joined, /SMTP_USER configured: true/);
      assert.match(joined, /SMTP_PASS configured: true/);
      assert.ok(!joined.includes("hunter2-secret"));
      assert.ok(!joined.includes("real-user@example.com"));
      assert.ok(!containsSmtpSecret(SMTP_NOT_CONFIGURED_MESSAGE));
    } finally {
      console.log = origLog;
      console.warn = origWarn;
      restoreSmtp(prev);
    }
  });

  it("maps Gmail auth failures to a safe send error", () => {
    const prev = snapshotSmtp();
    try {
      env.smtpHost = "smtp.gmail.com";
      env.smtpUser = "shop@example.com";
      env.smtpPass = "xxxx-app-password";
      const err = Object.assign(new Error("Invalid login"), { code: "EAUTH" });
      const message = toSafeSmtpUserMessage(err);
      assert.equal(message, SMTP_SEND_FAILED_MESSAGE);
      assert.ok(!message.includes("EAUTH"));
      assert.ok(!message.includes(env.smtpPass));
    } finally {
      restoreSmtp(prev);
    }
  });
});
