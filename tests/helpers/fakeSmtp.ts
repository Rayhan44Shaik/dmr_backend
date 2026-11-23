/**
 * Minimal local SMTP server used as a test double.
 *
 * The password-reset mail path is exercised end to end (nodemailer speaks real
 * SMTP to this socket) without contacting any provider: no credentials, no
 * outbound network, no real recipient. Messages are captured in memory and
 * never written to disk.
 *
 * The server can model the transport-security cases that matter for delivery:
 *  - plaintext only (no STARTTLS advertised)      -> must be refused
 *  - STARTTLS advertised but broken               -> must be refused
 *  - working STARTTLS with a test certificate     -> must be accepted
 *  - implicit TLS from the first byte (465 style) -> must be accepted
 * It records every AUTH attempt together with whether that connection was
 * already encrypted, so a test can prove credentials never cross plaintext.
 */
import net from "node:net";
import tls from "node:tls";

export type CapturedMail = {
  from: string;
  to: string[];
  /** Raw DATA payload (headers + body). */
  data: string;
  /** True when the message arrived over a TLS connection. */
  secure: boolean;
};

export type AuthAttempt = {
  mechanism: string;
  /** True when the AUTH command arrived over a TLS connection. */
  secure: boolean;
};

export type FakeSmtpOptions = {
  /** Advertise STARTTLS and upgrade the socket when the client asks. */
  startTls?: { key: string | Buffer; cert: string | Buffer };
  /** TLS from the first byte, like port 465. */
  implicitTls?: { key: string | Buffer; cert: string | Buffer };
  /** Advertise STARTTLS in EHLO but reject the command (broken relay). */
  advertiseStartTlsOnly?: boolean;
  /** Advertise and accept AUTH PLAIN. */
  requireAuth?: boolean;
};

export type FakeSmtpServer = {
  port: number;
  messages: CapturedMail[];
  authAttempts: AuthAttempt[];
  /** Commands received on plaintext connections (for refusal assertions). */
  plaintextCommands: string[];
  /** Resolve once at least `count` messages arrived, or throw on timeout. */
  waitForMessages: (count: number, timeoutMs?: number) => Promise<CapturedMail[]>;
  waitForPlaintextCommand: (command: string, timeoutMs?: number) => Promise<string>;
  close: () => Promise<void>;
};

const ADDRESS = /<?([^\s<>]+@[^\s<>]+)>?/;

function addressOf(line: string): string {
  const match = ADDRESS.exec(line);
  return match ? match[1] : "";
}

export async function startFakeSmtpServer(options: FakeSmtpOptions = {}): Promise<FakeSmtpServer> {
  const messages: CapturedMail[] = [];
  const authAttempts: AuthAttempt[] = [];
  const plaintextCommands: string[] = [];
  const sockets = new Set<net.Socket>();

  // TLSSocket wrapping needs a SecureContext; key/cert are not read from the
  // socket options themselves.
  const startTlsContext = options.startTls
    ? tls.createSecureContext({ key: options.startTls.key, cert: options.startTls.cert })
    : null;

  const banner = "220 fake-smtp ready\r\n";
  const ehloResponse = (): string => {
    const lines = ["250-fake-smtp"];
    if (options.startTls || options.advertiseStartTlsOnly) lines.push("250-STARTTLS");
    if (options.requireAuth) lines.push("250-AUTH PLAIN");
    lines.push("250 OK");
    return `${lines.join("\r\n")}\r\n`;
  };

  const handleConnection = (initial: net.Socket, initiallySecure: boolean): void => {
    let socket: net.Socket = initial;
    let secure = initiallySecure;
    let buffer = "";
    let inData = false;
    let from = "";
    let to: string[] = [];

    sockets.add(initial);
    initial.on("close", () => sockets.delete(initial));
    initial.on("error", () => sockets.delete(initial));

    // No setEncoding(): the socket must stay in binary mode so it can be
    // wrapped by TLSSocket during a STARTTLS upgrade. Chunks are decoded in
    // onData instead.
    const attach = (target: net.Socket): void => {
      target.on("data", onData);
      target.on("close", () => sockets.delete(target));
      target.on("error", () => sockets.delete(target));
    };

    const handleLine = (line: string): boolean => {
      const command = line.split(/\s+/)[0]?.toUpperCase() ?? "";
      if (!secure) plaintextCommands.push(command);

      if (command === "EHLO" || command === "HELO") {
        socket.write(ehloResponse());
        return true;
      }
      if (command === "MAIL") {
        from = addressOf(line);
        socket.write("250 OK\r\n");
        return true;
      }
      if (command === "RCPT") {
        const address = addressOf(line);
        if (address) to.push(address);
        socket.write("250 OK\r\n");
        return true;
      }
      if (command === "DATA") {
        inData = true;
        socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
        return true;
      }
      if (command === "STARTTLS") {
        if (secure || !startTlsContext) {
          socket.write("502 Command not implemented\r\n");
          return true;
        }
        socket.write("220 Ready to start TLS\r\n");
        // The upgrade consumes the raw byte stream from here on, so the
        // plaintext parser must detach before wrapping the socket.
        socket.removeAllListeners("data");
        const secured = new tls.TLSSocket(socket, {
          isServer: true,
          secureContext: startTlsContext,
        });
        secured.on("error", () => socket.destroy());
        socket = secured;
        secure = true;
        buffer = "";
        attach(secured);
        return true;
      }
      if (command === "AUTH") {
        const mechanism = line.split(/\s+/)[1]?.toUpperCase() || "UNKNOWN";
        authAttempts.push({ mechanism, secure });
        if (!options.requireAuth) {
          socket.write("502 Command not implemented\r\n");
          return true;
        }
        socket.write("235 2.7.0 Authentication successful\r\n");
        return true;
      }
      if (command === "QUIT") {
        socket.write("221 Bye\r\n");
        socket.end();
        return false;
      }
      socket.write("250 OK\r\n");
      return true;
    };

    const onData = (chunk: Buffer | string): void => {
      buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      for (;;) {
        if (inData) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end === -1) return; // wait for the terminator (may span chunks)
          messages.push({ from, to: [...to], data: buffer.slice(0, end), secure });
          buffer = buffer.slice(end + 5);
          inData = false;
          from = "";
          to = [];
          socket.write("250 OK\r\n");
          continue;
        }
        const newline = buffer.indexOf("\r\n");
        if (newline === -1) return;
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 2);
        if (!handleLine(line)) return;
      }
    };

    attach(socket);
    // Both listeners greet after the transport is ready: a plain socket is
    // ready immediately, a TLS socket once its handshake finished (which is
    // when the tls.createServer callback fires).
    socket.write(banner);
  };

  const server = options.implicitTls
    ? tls.createServer(
        { key: options.implicitTls.key, cert: options.implicitTls.cert },
        (socket) => {
          sockets.add(socket);
          handleConnection(socket, true);
          socket.on("error", () => sockets.delete(socket));
        },
      )
    : net.createServer((socket) => handleConnection(socket, false));

  if (options.implicitTls) {
    // TLS handshakes fail for untrusted certificates; never let that crash a test.
    server.on("tlsClientError", () => undefined);
  }

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("fake SMTP server failed to bind");
  }

  const waitFor = async <T>(read: () => T[], count: number, timeoutMs: number, label: string): Promise<T[]> => {
    const deadline = Date.now() + timeoutMs;
    while (read().length < count) {
      if (Date.now() > deadline) {
        throw new Error(`fake SMTP: expected ${count} ${label}, received ${read().length}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return read();
  };

  return {
    port: address.port,
    messages,
    authAttempts,
    plaintextCommands,
    waitForMessages: (count, timeoutMs = 5_000) =>
      waitFor(() => messages, count, timeoutMs, "message(s)"),
    waitForPlaintextCommand: async (command, timeoutMs = 5_000) => {
      const wanted = command.toUpperCase();
      const deadline = Date.now() + timeoutMs;
      while (!plaintextCommands.includes(wanted)) {
        if (Date.now() > deadline) return "";
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return wanted;
    },
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/**
 * Decoded message body. nodemailer picks a Content-Transfer-Encoding for the
 * payload (quoted-printable or base64), so a raw substring match would miss a
 * long link split across encoded lines.
 */
export function decodeMailBody(mail: CapturedMail): string {
  const split = mail.data.indexOf("\r\n\r\n");
  const headers = split === -1 ? mail.data : mail.data.slice(0, split);
  const body = split === -1 ? "" : mail.data.slice(split + 4);
  if (/content-transfer-encoding:\s*base64/i.test(headers)) {
    return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
  }
  if (/content-transfer-encoding:\s*quoted-printable/i.test(headers)) {
    return body
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  }
  return body;
}

/** Extract the first `resetToken` value from a captured message. */
export function resetTokenFromMail(mail: CapturedMail): string {
  const match = /resetToken=([A-Za-z0-9_-]{16,})/.exec(decodeMailBody(mail));
  if (!match) throw new Error("fake SMTP: captured message carries no reset link");
  return match[1];
}
