/**
 * Password-reset email delivery, HTTP level against the real server.
 *
 * Every case runs against a LOCAL SMTP test double (`helpers/fakeSmtp.ts`):
 * nodemailer speaks real SMTP to an in-process socket, no provider is
 * contacted, and no message leaves the machine.
 *
 * Proves:
 *  - an existing account gets a single-use link at its registered address;
 *  - an unknown account gets the byte-identical response and no mail;
 *  - only a SHA-256 hash of the token is stored;
 *  - a delivered token resets the password, revokes sessions, and is consumed;
 *  - expired, consumed, and unknown tokens are rejected identically;
 *  - the per-account allowance returns 429;
 *  - missing SMTP configuration and an unreachable SMTP host never change the
 *    outward response and never surface provider detail;
 *  - production responses carry no token or link while still delivering mail.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";
import { startApp, type TestApp } from "./helpers/app.js";
import {
  decodeMailBody,
  resetTokenFromMail,
  startFakeSmtpServer,
  type FakeSmtpServer,
} from "./helpers/fakeSmtp.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();

// Deliveries run over a real TLS handshake: the local server offers STARTTLS
// with the test certificate, and SMTP_TLS_CA_FILE adds that test CA to the
// trust store (production keeps only the system roots).
const TLS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "helpers", "tls");
const smtp: FakeSmtpServer = await startFakeSmtpServer({
  startTls: {
    key: fs.readFileSync(path.join(TLS_DIR, "server.key")),
    cert: fs.readFileSync(path.join(TLS_DIR, "server.pem")),
  },
});
const PUBLIC_URL = "https://erp.example.test";
const PROXY_SECRET = `test-proxy-${"p".repeat(32)}-A1`;

const mailEnv = {
  DATABASE_URL: testDb.url,
  NODE_ENV: "development",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: String(smtp.port),
  SMTP_USER: "",
  SMTP_PASS: "",
  SMTP_FROM: "no-reply@dmr.test",
  SMTP_TLS_CA_FILE: path.join(TLS_DIR, "ca.pem"),
  APP_PUBLIC_URL: PUBLIC_URL,
  // Development servers stay silent unless delivery is explicitly enabled.
  SMTP_DELIVERY_ENABLED: "true",
};

const app: TestApp = await startApp(mailEnv);

const { pool } = await import("../src/config/db.js");
const { hashPassword } = await import("../src/utils/passwordHash.js");
const { describeSmtpFailure } = await import("../src/services/passwordResetMail.js");
const { isSmtpDeliveryEnabled } = await import("../src/config/env.js");

const PASS_OWNER = "Mail-owner-pass-123!";
const PASS_OWNER_NEW = "Mail-owner-pass-456!";
const PASS_EXPIRED = "Mail-expired-pass-123!";
const PASS_THROTTLE = "Mail-throttle-pass-123!";
const PASS_NOADDR = "Mail-noaddr-pass-123!";

type Seeded = { userId: number; employeeId: number };

let employeeSeq = 9300;
async function seedUser(username: string, password: string, email: string): Promise<Seeded> {
  employeeSeq += 1;
  const employee = await pool.query(
    `INSERT INTO employees (employee_no, employee_name, department, status, phone_number, email)
     VALUES ($1,$2,'Operations','Active',$3,$4) RETURNING id`,
    [employeeSeq, `Mail ${username}`, String(9400000000 + employeeSeq), email],
  );
  const user = await pool.query(
    `INSERT INTO application_users (username, display_name, password_hash, role, employee_id, access_status, active)
     VALUES ($1,$2,$3,'COLLECTION',$4,'ACTIVE',TRUE) RETURNING id`,
    [username, `Mail ${username}`, await hashPassword(password), employee.rows[0].id],
  );
  return { userId: Number(user.rows[0].id), employeeId: Number(employee.rows[0].id) };
}

async function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
  baseUrl = app.baseUrl,
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { _raw: text };
  }
  return { status: response.status, body: json, headers: response.headers };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Ask for a reset and return the token carried by the delivered email. */
async function requestAndReadToken(username: string): Promise<string> {
  const before = smtp.messages.length;
  const response = await post("/api/auth/forgot-password", { username });
  assert.equal(response.status, 200);
  const messages = await smtp.waitForMessages(before + 1);
  return resetTokenFromMail(messages[before]);
}

let owner: Seeded;
let expired: Seeded;
let throttleUser: Seeded;
let noAddress: Seeded;
let configFaultUser: Seeded;
let devGuardUser: Seeded;
let genericMessage = "";
let ownerToken = "";

before(async () => {
  owner = await seedUser("mail-owner", PASS_OWNER, "reset.mail@dmr.test");
  expired = await seedUser("mail-expired", PASS_EXPIRED, "expired.mail@dmr.test");
  throttleUser = await seedUser("mail-throttle", PASS_THROTTLE, "throttle.mail@dmr.test");
  noAddress = await seedUser("mail-noaddr", PASS_NOADDR, "");
  configFaultUser = await seedUser("mail-config", "Mail-config-pass-123!", "config.mail@dmr.test");
  devGuardUser = await seedUser("mail-devguard", "Mail-devguard-pass-123!", "devguard.mail@dmr.test");
  assert.ok(throttleUser.userId && noAddress.userId && configFaultUser.userId && devGuardUser.userId);
});

after(async () => {
  await app.close();
  await smtp.close();
  await testDb.close();
  await pool.end();
});

describe("reset link delivery", () => {
  it("emails a reset link to the account's registered address", async () => {
    const before = smtp.messages.length;
    const response = await post("/api/auth/forgot-password", { username: "mail-owner" });
    assert.equal(response.status, 200);
    genericMessage = String(response.body.message ?? "");
    assert.ok(genericMessage.length > 0);
    // The link is never part of the API response.
    assert.ok(!("resetUrl" in response.body), "no reset URL in the response");
    assert.ok(!JSON.stringify(response.body).includes("resetToken="), "no reset link in the response");

    const messages = await smtp.waitForMessages(before + 1);
    const mail = messages[before];
    assert.deepEqual(mail.to, ["reset.mail@dmr.test"]);
    assert.match(mail.data, /Subject: Reset your DMR Poultries ERP password/i);
    assert.ok(decodeMailBody(mail).includes(`${PUBLIC_URL}/?resetToken=`), "email carries the reset link");
    ownerToken = resetTokenFromMail(mail);
    // Outside production the token is still returned for operator relay — the
    // emailed token and the issued token are the same value.
    assert.equal(response.body.resetToken, ownerToken);
  });

  it("stores only a SHA-256 hash of the token", async () => {
    const stored = await pool.query(
      `SELECT token_hash FROM password_reset_tokens
        WHERE user_id=$1 AND used_at IS NULL ORDER BY created_at DESC LIMIT 1`,
      [owner.userId],
    );
    assert.ok(stored.rowCount);
    const storedHash = String(stored.rows[0].token_hash);
    assert.notEqual(storedHash, ownerToken, "the raw token is never persisted");
    assert.equal(storedHash, createHash("sha256").update(ownerToken).digest("hex"));
  });

  it("gives an unknown account the identical response and sends nothing", async () => {
    const before = smtp.messages.length;
    const unknown = await post("/api/auth/forgot-password", { username: "no-such-account-zzz" });
    assert.equal(unknown.status, 200);
    assert.equal(unknown.body.message, genericMessage, "same message for unknown accounts");
    assert.deepEqual(Object.keys(unknown.body).sort(), ["message"], "no extra fields");
    await sleep(200);
    assert.equal(smtp.messages.length, before, "no mail for a non-existent account");
  });

  it("skips delivery when the account has no deliverable address", async () => {
    const before = smtp.messages.length;
    const response = await post("/api/auth/forgot-password", { username: "mail-noaddr" });
    assert.equal(response.status, 200);
    assert.equal(response.body.message, genericMessage);
    await sleep(200);
    assert.equal(smtp.messages.length, before, "no mail without an address");
  });

  it("resets the password with the emailed token and revokes sessions", async () => {
    const login = await post("/api/auth/login", { username: "mail-owner", password: PASS_OWNER });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
    assert.ok(cookie);

    const done = await post("/api/auth/reset-password", {
      token: ownerToken,
      newPassword: PASS_OWNER_NEW,
    });
    assert.equal(done.status, 200);
    assert.equal(done.body.token, undefined, "reset never returns a session token");

    assert.equal(
      (await post("/api/auth/login", { username: "mail-owner", password: PASS_OWNER })).status,
      401,
    );
    assert.equal(
      (await post("/api/auth/login", { username: "mail-owner", password: PASS_OWNER_NEW })).status,
      200,
    );
    const me = await fetch(`${app.baseUrl}/api/auth/me`, { headers: { cookie } });
    assert.equal(me.status, 401, "sessions opened before the reset are revoked");
  });

  it("rejects replay of a consumed token", async () => {
    const token = await requestAndReadToken("mail-owner");
    const first = await post("/api/auth/reset-password", {
      token,
      newPassword: "Mail-owner-third-123!",
    });
    assert.equal(first.status, 200);
    const replay = await post("/api/auth/reset-password", {
      token,
      newPassword: "Mail-owner-fourth-123!",
    });
    assert.equal(replay.status, 401);
  });
});

describe("token validity window", () => {
  it("rejects an expired token", async () => {
    const token = await requestAndReadToken("mail-expired");
    await pool.query(
      `UPDATE password_reset_tokens SET expires_at = NOW() - INTERVAL '1 minute'
        WHERE user_id=$1 AND used_at IS NULL`,
      [expired.userId],
    );
    const response = await post("/api/auth/reset-password", {
      token,
      newPassword: "Mail-expired-new-123!",
    });
    assert.equal(response.status, 401);
    // The password is untouched by a failed attempt.
    assert.equal(
      (await post("/api/auth/login", { username: "mail-expired", password: PASS_EXPIRED })).status,
      200,
    );
  });

  it("answers invalid and expired tokens identically", async () => {
    const invalid = await post("/api/auth/reset-password", {
      token: "not-a-real-token",
      newPassword: "Mail-expired-new-123!",
    });
    const token = await requestAndReadToken("mail-expired");
    await pool.query(
      `UPDATE password_reset_tokens SET expires_at = NOW() - INTERVAL '1 minute'
        WHERE user_id=$1 AND used_at IS NULL`,
      [expired.userId],
    );
    const expiredResponse = await post("/api/auth/reset-password", {
      token,
      newPassword: "Mail-expired-new-123!",
    });
    assert.equal(invalid.status, 401);
    assert.equal(expiredResponse.status, 401);
    assert.equal(invalid.body.message, expiredResponse.body.message);
  });

  it("issues a fresh token that supersedes the previous one", async () => {
    const first = await requestAndReadToken("mail-expired");
    await requestAndReadToken("mail-expired");
    const stale = await post("/api/auth/reset-password", {
      token: first,
      newPassword: "Mail-expired-new-123!",
    });
    assert.equal(stale.status, 401, "re-requesting invalidates the older link");
  });
});

describe("abuse protection and configuration faults", () => {
  it("throttles repeated requests for one account", async () => {
    let limited = 0;
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const response = await post("/api/auth/forgot-password", { username: "mail-throttle" });
      if (response.status === 429) limited += 1;
      else assert.equal(response.status, 200);
    }
    assert.ok(limited >= 1, "repeated reset requests are throttled");
  });

  it("keeps the response generic when SMTP is not configured", async () => {
    const noConfigApp = await startApp({
      ...mailEnv,
      SMTP_HOST: "",
      SMTP_PORT: "",
      SMTP_USER: "",
      SMTP_PASS: "",
      SMTP_FROM: "",
    });
    try {
      const before = smtp.messages.length;
      const response = await post(
        "/api/auth/forgot-password",
        { username: "mail-config" },
        {},
        noConfigApp.baseUrl,
      );
      assert.equal(response.status, 200, "an unconfigured transport is not an API error");
      assert.equal(response.body.message, genericMessage);
      assert.ok(!JSON.stringify(response.body).includes("SMTP"), "no configuration detail leaks");
      await sleep(250);
      assert.equal(smtp.messages.length, before, "nothing is delivered without configuration");
    } finally {
      await noConfigApp.close();
    }
  });

  it("does not email real users from a development server without opt-in", async () => {
    const devApp = await startApp({ ...mailEnv, SMTP_DELIVERY_ENABLED: "" });
    try {
      const before = smtp.messages.length;
      const response = await post(
        "/api/auth/forgot-password",
        { username: "mail-devguard" },
        {},
        devApp.baseUrl,
      );
      assert.equal(response.status, 200);
      assert.equal(response.body.message, genericMessage);
      await sleep(400);
      assert.equal(smtp.messages.length, before, "development must not deliver by default");
    } finally {
      await devApp.close();
    }
  });

  it("keeps the response generic when the SMTP host is unreachable", async () => {
    const brokenSmtpApp = await startApp({ ...mailEnv, SMTP_PORT: "1" });
    try {
      const response = await post(
        "/api/auth/forgot-password",
        { username: "mail-config" },
        {},
        brokenSmtpApp.baseUrl,
      );
      assert.equal(response.status, 200, "a delivery failure is never an API error");
      assert.equal(response.body.message, genericMessage);
      const serialized = JSON.stringify(response.body);
      for (const leak of ["SMTP", "ECONNREFUSED", "resetToken="]) {
        assert.ok(!serialized.includes(leak), `response must not contain ${leak}`);
      }
      // Let the fire-and-forget failure land, then prove the API is healthy.
      await sleep(500);
      const health = await fetch(`${brokenSmtpApp.baseUrl}/api/health`);
      assert.equal(health.status, 200);
    } finally {
      await brokenSmtpApp.close();
    }
  });
});

describe("production responses", () => {
  it("delivers mail but never returns the token or link", async () => {
    const productionApp = await startApp({
      ...mailEnv,
      NODE_ENV: "production",
      TRUSTED_PROXY_SECRET: PROXY_SECRET,
      MFA_SECRET_KEY: "0123456789abcdef".repeat(4),
    });
    try {
      const before = smtp.messages.length;
      const response = await post(
        "/api/auth/forgot-password",
        { username: "mail-owner" },
        { "x-dmr-proxy-secret": PROXY_SECRET },
        productionApp.baseUrl,
      );
      assert.equal(response.status, 200);
      assert.ok(!("resetToken" in response.body), "production never returns the token");
      assert.ok(!JSON.stringify(response.body).includes("resetToken="), "production never returns the link");

      const messages = await smtp.waitForMessages(before + 1);
      assert.ok(resetTokenFromMail(messages[before]).length > 20, "the link is still delivered by email");
    } finally {
      await productionApp.close();
    }
  });
});

describe("diagnostics never carry secrets", () => {
  it("reduces provider errors to a static code", () => {
    const credentialsInMessage = Object.assign(
      new Error("Invalid login for SMTP_USER=someone SMTP_PASS=secret and resetToken=abc"),
      { code: "EAUTH" },
    );
    const described = describeSmtpFailure(credentialsInMessage);
    assert.equal(described, "SMTP_SEND_FAILED:EAUTH");
    for (const leak of ["someone", "secret", "resetToken", "SMTP_USER"]) {
      assert.ok(!described.includes(leak));
    }
    assert.equal(describeSmtpFailure(new Error("connect ECONNREFUSED smtp.internal")), "SMTP_SEND_FAILED");
    assert.equal(describeSmtpFailure("boom"), "SMTP_SEND_FAILED");
  });

  it("enables real delivery only in production or by explicit opt-in", () => {
    assert.equal(isSmtpDeliveryEnabled({ NODE_ENV: "development" }), false);
    assert.equal(isSmtpDeliveryEnabled({ NODE_ENV: "development", SMTP_DELIVERY_ENABLED: "true" }), true);
    assert.equal(isSmtpDeliveryEnabled({ NODE_ENV: "production" }), true);
  });
});
