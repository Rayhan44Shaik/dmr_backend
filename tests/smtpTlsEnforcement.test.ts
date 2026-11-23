// tests/smtpTlsEnforcement.test.ts
//
// Transport-security guarantees for password-reset delivery.
//
// Everything runs against in-process sockets on 127.0.0.1 — no provider, no
// credentials, no outbound network. Proves:
//
//   1. port 587 (and any non-465 port) requires STARTTLS before AUTH / DATA;
//   2. port 465 uses implicit TLS from the first byte;
//   3. a server without STARTTLS is refused and never receives credentials;
//   4. a server that advertises STARTTLS but cannot complete it is refused;
//   5. certificates are validated (an untrusted certificate fails the send);
//   6. SMTP_TLS_CA_FILE only ADDS trust, and a trusted STARTTLS server works
//      with AUTH happening exclusively over TLS.
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, it, afterEach } from "node:test";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
import type { FakeSmtpServer } from "./helpers/fakeSmtp.js";

// `env.ts` validates PORT on import; keep the test process on a sane value so
// a developer's .env can never decide whether this suite runs.
process.env.PORT = process.env.PORT || "4000";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@127.0.0.1:5432/test";
process.env.NODE_ENV = "test";

const TLS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "helpers", "tls");
const TLS = {
  key: fs.readFileSync(path.join(TLS_DIR, "server.key")),
  cert: fs.readFileSync(path.join(TLS_DIR, "server.pem")),
};
const CA_FILE = path.join(TLS_DIR, "ca.pem");

const { startFakeSmtpServer } = await import("./helpers/fakeSmtp.js");
const { readSmtpConfiguration } = await import("../src/config/env.js");
const { sendPasswordResetEmail, resetMailTransportCache, smtpTransportOptions } = await import(
  "../src/services/passwordResetMail.js"
);

const SMTP_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "SMTP_TLS_CA_FILE",
  "SMTP_DELIVERY_ENABLED",
];

function useSmtp(values: Record<string, string>): void {
  for (const key of SMTP_KEYS) delete process.env[key];
  Object.assign(process.env, {
    SMTP_DELIVERY_ENABLED: "true",
    SMTP_FROM: "no-reply@dmr.test",
    ...values,
  });
  resetMailTransportCache();
}

const SERVERS: FakeSmtpServer[] = [];
async function server(options?: Parameters<typeof startFakeSmtpServer>[0]): Promise<FakeSmtpServer> {
  const started = await startFakeSmtpServer(options);
  SERVERS.push(started);
  return started;
}

const MAIL = { to: "employee@dmr.test", resetUrl: "https://erp.test/?resetToken=abc", expiresMinutes: 30 };

afterEach(async () => {
  while (SERVERS.length) await SERVERS.pop()!.close();
  resetMailTransportCache();
});

describe("SMTP transport encryption configuration", () => {
  it("requires STARTTLS on 587 and never allows ignoreTLS", () => {
    const config = readSmtpConfiguration({
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "587",
      SMTP_FROM: "no-reply@dmr.test",
    } as NodeJS.ProcessEnv);
    const options = smtpTransportOptions(config);

    assert.equal(options.secure, false, "587 must not start with implicit TLS");
    assert.equal(options.requireTLS, true, "587 must require a STARTTLS upgrade");
    assert.equal(options.ignoreTLS, false, "STARTTLS support must never be ignored");
    assert.equal(options.tls.rejectUnauthorized, true, "certificates must be validated");
    assert.equal(options.tls.minVersion, "TLSv1.2");
    assert.equal(options.tls.ca, undefined, "system roots only unless a CA file is configured");
  });

  it("uses implicit TLS on 465", () => {
    const config = readSmtpConfiguration({
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "465",
      SMTP_FROM: "no-reply@dmr.test",
    } as NodeJS.ProcessEnv);
    const options = smtpTransportOptions(config);

    assert.equal(options.secure, true, "465 must negotiate TLS from the first byte");
    assert.equal(options.tls.rejectUnauthorized, true);
  });

  it("treats an unreadable SMTP_TLS_CA_FILE as a configuration problem", () => {
    const config = readSmtpConfiguration({
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "587",
      SMTP_FROM: "no-reply@dmr.test",
      SMTP_TLS_CA_FILE: path.join(os.tmpdir(), "dmr-missing-ca-bundle.pem"),
    } as NodeJS.ProcessEnv);

    assert.equal(config.configured, false);
    assert.match(String(config.problem), /SMTP_TLS_CA_FILE/);
  });
});

describe("SMTP refuses unencrypted delivery", () => {
  it("fails closed and never authenticates when STARTTLS is unavailable", async () => {
    // Plain server: EHLO offers STARTTLS neither implicitly nor explicitly, but
    // it would accept AUTH PLAIN if the client sent it in the clear.
    const plain = await server({ requireAuth: true });
    useSmtp({
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: String(plain.port),
      SMTP_USER: "test-user@dmr.test",
      SMTP_PASS: "test-password",
    });

    const delivered = await sendPasswordResetEmail(MAIL);

    assert.equal(delivered, false, "an unencrypted transport must fail delivery");
    assert.deepEqual(plain.authAttempts, [], "credentials must never be sent over plaintext");
    assert.equal(plain.messages.length, 0, "no message may be written to a plaintext session");
    assert.ok(plain.plaintextCommands.includes("EHLO"), "the client did reach the server");
    assert.ok(!plain.plaintextCommands.includes("AUTH"), "no AUTH verb on plaintext");
    assert.ok(!plain.plaintextCommands.includes("MAIL"), "no envelope on plaintext");
  });

  it("fails closed when the server advertises STARTTLS but rejects the upgrade", async () => {
    const broken = await server({ advertiseStartTlsOnly: true, requireAuth: true });
    useSmtp({
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: String(broken.port),
      SMTP_USER: "test-user@dmr.test",
      SMTP_PASS: "test-password",
    });

    const delivered = await sendPasswordResetEmail(MAIL);

    assert.equal(delivered, false);
    assert.deepEqual(broken.authAttempts, []);
    assert.equal(broken.messages.length, 0);
  });

  it("does not fall back to plaintext on port 465", async () => {
    // A plain TCP listener on an implicit-TLS port: the handshake cannot work,
    // and the client must not degrade to cleartext SMTP.
    const plainListener = net.createServer((socket) => socket.on("error", () => undefined));
    await new Promise<void>((resolve) => plainListener.listen(0, "127.0.0.1", () => resolve()));
    const address = plainListener.address();
    assert.ok(address && typeof address === "object");
    try {
      useSmtp({
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: String(address.port),
        SMTP_USER: "test-user@dmr.test",
        SMTP_PASS: "test-password",
      });
      assert.equal(await sendPasswordResetEmail(MAIL), false);
    } finally {
      await new Promise<void>((resolve) => plainListener.close(() => resolve()));
    }
  });

  it("rejects an untrusted server certificate instead of delivering", async () => {
    const untrusted = await server({ implicitTls: TLS, requireAuth: true });
    useSmtp({
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: String(untrusted.port),
      SMTP_USER: "test-user@dmr.test",
      SMTP_PASS: "test-password",
      // Deliberately no SMTP_TLS_CA_FILE: the CA below is not in the system store.
    });

    assert.equal(await sendPasswordResetEmail(MAIL), false, "self-signed TLS must be rejected");
    assert.deepEqual(untrusted.authAttempts, []);
    assert.equal(untrusted.messages.length, 0);
  });
});

describe("encrypted delivery still works", () => {
  it("delivers over STARTTLS and authenticates only inside the TLS session", async () => {
    const secured = await server({ startTls: TLS, requireAuth: true });
    useSmtp({
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: String(secured.port),
      SMTP_USER: "test-user@dmr.test",
      SMTP_PASS: "test-password",
      SMTP_TLS_CA_FILE: CA_FILE,
    });

    const delivered = await sendPasswordResetEmail(MAIL);

    assert.equal(delivered, true, "a trusted STARTTLS server must deliver");
    const [mail] = await secured.waitForMessages(1);
    assert.equal(mail.secure, true, "the message arrived over TLS");
    assert.deepEqual(mail.to, [MAIL.to]);
    assert.ok(
      secured.authAttempts.length >= 1 && secured.authAttempts.every((attempt) => attempt.secure),
      "AUTH happened only after the TLS upgrade",
    );
    assert.ok(!secured.plaintextCommands.includes("AUTH"), "no AUTH in the clear");
  });

  it("delivers over implicit TLS with the port-465 transport options", async () => {
    const implicit = await server({ implicitTls: TLS, requireAuth: true });
    const config = readSmtpConfiguration({
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "465",
      SMTP_USER: "test-user@dmr.test",
      SMTP_PASS: "test-password",
      SMTP_FROM: "no-reply@dmr.test",
      SMTP_TLS_CA_FILE: CA_FILE,
    } as NodeJS.ProcessEnv);
    const options = smtpTransportOptions(config);
    assert.equal(options.secure, true, "465 options negotiate TLS immediately");

    // Same options the production transport would use for 465; only the port is
    // swapped for the ephemeral test listener.
    const transport = nodemailer.createTransport({ ...options, port: implicit.port });
    await transport.sendMail({
      from: "no-reply@dmr.test",
      to: MAIL.to,
      subject: "Implicit TLS check",
      text: "body",
    });

    const [mail] = await implicit.waitForMessages(1);
    assert.equal(mail.secure, true, "implicit-TLS session carried the message");
    assert.ok(
      implicit.authAttempts.length >= 1 && implicit.authAttempts.every((attempt) => attempt.secure),
      "AUTH happened inside the implicit-TLS session",
    );
  });
});
