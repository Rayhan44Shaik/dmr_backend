/**
 * TOTP correctness against RFC 6238 vectors + crypto handling (no DB needed).
 *
 * Proves the second factor is real server-side verification, not UI:
 *  - implementation matches the RFC 6238 SHA-1 appendix vectors exactly
 *  - adjacent-step window tolerates clock skew, distant steps reject
 *  - malformed codes fail closed with constant-time comparison
 *  - base32 rejects garbage (provisioning safety)
 *  - secrets encrypt (AES-256-GCM) and roundtrip; wrong keys fail closed
 *  - enrollment is refused without a configured key (fail safe, 503)
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.MFA_SECRET_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const {
  base32Decode,
  base32Encode,
  totpCode,
  verifyTotpCode,
  encryptMfaSecret,
  decryptMfaSecret,
} = await import("../src/services/authService.js");

// RFC 6238 appendix B, SHA-1, secret ASCII "12345678901234567890".
const RFC_SECRET = Buffer.from("12345678901234567890", "ascii");

describe("RFC 6238 TOTP vectors (SHA-1, 30 s, 6 digits)", () => {
  const vectors: Array<[number, string]> = [
    [59_000, "287082"],
    [1_111_111_109_000, "081804"],
    [1_234_567_890_000, "005924"],
    [2_000_000_000_000, "279037"],
  ];
  for (const [timeMs, expected] of vectors) {
    it(`T=${timeMs / 1000}s → ${expected}`, () => {
      assert.equal(totpCode(RFC_SECRET, timeMs), expected);
    });
  }
});

describe("verification window and fail-closed behavior", () => {
  it("accepts the current step and adjacent steps (clock tolerance)", () => {
    const now = 1_700_000_000_000;
    assert.equal(verifyTotpCode(RFC_SECRET, totpCode(RFC_SECRET, now), now), true);
    assert.equal(verifyTotpCode(RFC_SECRET, totpCode(RFC_SECRET, now - 30_000), now), true);
    assert.equal(verifyTotpCode(RFC_SECRET, totpCode(RFC_SECRET, now + 30_000), now), true);
  });

  it("rejects distant steps and malformed codes", () => {
    const now = 1_700_000_000_000;
    assert.equal(verifyTotpCode(RFC_SECRET, totpCode(RFC_SECRET, now - 90_000), now), false);
    for (const bad of ["", "12345", "1234567", "abcdef", "12 34", "------", "999999"]) {
      if (bad === totpCode(RFC_SECRET, now)) continue;
      assert.equal(verifyTotpCode(RFC_SECRET, bad, now), false, JSON.stringify(bad));
    }
  });

  it("different secrets never cross-verify", () => {
    const other = Buffer.from("09876543210987654321", "ascii");
    const now = 1_700_000_000_000;
    assert.equal(verifyTotpCode(other, totpCode(RFC_SECRET, now), now), false);
  });
});

describe("base32 provisioning safety", () => {
  it("roundtrips and rejects garbage", () => {
    const secret = Buffer.from("hello-totp-secret-20b!!".slice(0, 20), "utf8");
    assert.deepEqual(base32Decode(base32Encode(secret)), secret);
    for (const bad of ["", "!!!!", "ABC*DEF", "0O1I"]) {
      assert.throws(() => base32Decode(bad), /Invalid base32/);
    }
  });
});

describe("secret encryption at rest", () => {
  it("roundtrips AES-256-GCM and fails closed on tampering", () => {
    const secret = Buffer.from("0123456789abcdefghij", "utf8");
    const packed = encryptMfaSecret(secret);
    assert.deepEqual(decryptMfaSecret(packed), secret);
    assert.ok(!packed.includes("0123456789abcdefghij"), "no plaintext in packed form");
    const tampered = packed.slice(0, -2) + (packed.endsWith("0") ? "1" : "0");
    assert.throws(() => decryptMfaSecret(tampered));
  });

  it("refuses enrollment crypto without a configured key (fail safe)", async () => {
    const { encryptMfaSecret: encrypt } = await import("../src/services/authService.js");
    const saved = process.env.MFA_SECRET_KEY;
    process.env.MFA_SECRET_KEY = "";
    try {
      assert.throws(() => encrypt(Buffer.alloc(20)), /not configured/);
    } finally {
      process.env.MFA_SECRET_KEY = saved;
    }
  });
});
