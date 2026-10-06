/**
 * Password hashing contract (no DB needed).
 *
 * Proves: scrypt parameters meet policy (N=32768), roundtrip verifies,
 * wrong/tampered/malformed inputs fail closed, and the ≥12-char minimum is
 * enforced at the hash boundary (defense in depth behind route validation).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { hashPassword, verifyPassword } = await import("../src/utils/passwordHash.js");

describe("password hashing", () => {
  it("roundtrips a valid password and encodes N=32768 parameters", async () => {
    const stored = await hashPassword("Correct-horse-123!");
    assert.ok(stored.startsWith("scrypt$32768$8$1$"), "parameters pinned in output");
    assert.equal(await verifyPassword("Correct-horse-123!", stored), true);
  });

  it("fails closed on wrong, tampered, and malformed inputs", async () => {
    const stored = await hashPassword("Another-valid-123!");
    assert.equal(await verifyPassword("wrong-password-123!", stored), false);
    // Tamper a content byte mid-hash (not padding, which base64 ignores).
    const parts = stored.split("$");
    const hash64 = parts[5] ?? "";
    const flip = hash64[5] === "A" ? "B" : "A";
    const tampered = [...parts.slice(0, 5), hash64.slice(0, 5) + flip + hash64.slice(6)].join("$");
    assert.notEqual(tampered, stored);
    assert.equal(await verifyPassword("Another-valid-123!", tampered), false);
    assert.equal(await verifyPassword("x", "not-a-hash"), false);
    assert.equal(await verifyPassword("x", "bcrypt$10$salt$hash"), false);
  });

  it("enforces the 12-character minimum at the hash boundary", async () => {
    await assert.rejects(hashPassword("short"), /12 and 1024/);
    await assert.rejects(hashPassword("x".repeat(1025)), /12 and 1024/);
  });
});
