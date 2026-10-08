import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { isPgError } from "../utils/pgErrors.js";
import { verifyPassword, hashPassword } from "../utils/passwordHash.js";
import { syncLocalCredentialsPassword } from "../utils/localCredentials.js";
import type { AppRole } from "../security/rbac.js";

export type { AppRole } from "../security/rbac.js";
export type AuthUser = { id: number; username: string; displayName: string; role: AppRole; employeeId: number | null; mustChangePassword: boolean };
export type AuthSession = { user: AuthUser; expiresAt: string };
/** Absolute session lifetime (server time). */
export const SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000;
/** Genuine-inactivity timeout enforced on the SERVER (server time). */
export const SESSION_IDLE_MS = 10 * 60 * 1000;
const SESSION_MS = SESSION_ABSOLUTE_MS;

const TOTP_STEP_MS = 30_000;
const TOTP_DIGITS = 6;
const TOTP_WINDOW_STEPS = 1;
const MFA_TICKET_MS = 5 * 60 * 1000;
const MFA_ISSUER = "DMR Poultries ERP";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789";

/** RFC 4648 base32 decode (accepts unpadded input, rejects garbage). */
export function base32Decode(input: string): Buffer {
  const clean = input.trim().replace(/=+$/, "").toUpperCase();
  if (!clean || /[^A-Z2-7]/.test(clean)) throw new Error("Invalid base32");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function base32Encode(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** RFC 6238 TOTP (SHA-1, 30 s step, 6 digits). Pure and unit-tested. */
export function totpCode(secret: Buffer, timeMs = Date.now()): string {
  const counter = Math.floor(timeMs / TOTP_STEP_MS);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(code % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/** Accept codes from adjacent steps (clock tolerance); constant-time compare. */
export function verifyTotpCode(secret: Buffer, code: string, timeMs = Date.now()): boolean {
  const normalized = String(code ?? "").replace(/[\s-]/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  for (let step = -TOTP_WINDOW_STEPS; step <= TOTP_WINDOW_STEPS; step++) {
    const candidate = Buffer.from(totpCode(secret, timeMs + step * TOTP_STEP_MS), "utf8");
    const actual = Buffer.from(normalized, "utf8");
    if (candidate.length === actual.length && timingSafeEqual(candidate, actual)) return true;
  }
  return false;
}

function mfaEncryptionKey(): Buffer {
  const raw = (process.env.MFA_SECRET_KEY ?? "").trim();
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  throw new AppError(503, "Two-factor authentication is not configured");
}

export function encryptMfaSecret(secret: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", mfaEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}:${cipher.getAuthTag().toString("hex")}`;
}

export function decryptMfaSecret(packed: string): Buffer {
  const [ivHex, dataHex, tagHex] = String(packed ?? "").split(":");
  try {
    const decipher = createDecipheriv("aes-256-gcm", mfaEncryptionKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  } catch {
    throw new AppError(401, "Two-factor verification failed");
  }
}

const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function newRecoveryCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (const byte of bytes) code += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

const normalizeRecoveryCode = (code: string) =>
  String(code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Pure idle check (testable): true when the session must be treated as expired. */
export function isSessionIdleExpired(lastActivityAt: Date | string | null | undefined, nowMs = Date.now()): boolean {
  if (!lastActivityAt) return false;
  const at = new Date(lastActivityAt).getTime();
  if (!Number.isFinite(at)) return false;
  // A client clock can never extend a session: only server-measured elapsed
  // time counts, and future timestamps are treated as "just now".
  const elapsed = nowMs - at;
  if (elapsed < 0) return false;
  return elapsed > SESSION_IDLE_MS;
}

export type AuditMeta = { ip?: string | null; requestId?: string | null; userAgent?: string | null };

function auditEvent(
  event: string,
  userId: number | null,
  username: string | null,
  meta?: AuditMeta,
): void {
  try {
    void query(
      `INSERT INTO auth_audit_logs (user_id, username, event, ip, request_id, result, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, username, event, meta?.ip ?? null, meta?.requestId ?? null,
       event === "login_failure" ? "FAILURE" : "SUCCESS", meta?.userAgent ?? null],
    ).catch(() => undefined);
  } catch {
    // Audit must never break authentication (e.g. table not yet migrated).
  }
}

// Fallback login throttle when the shared store is unreachable: identical
// window/allowance semantics, process-local. The database table is primary so
// multi-instance deployments share one allowance.
const memoryThrottle = new Map<string, { count: number; resetAt: number }>();
const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
const THROTTLE_ATTEMPTS = 10;

async function dbThrottleCheck(key: string): Promise<"ok" | "limited" | "unavailable"> {
  try {
    const found = await query(`SELECT count, reset_at FROM login_rate_limits WHERE key=$1`, [key]);
    const row = found.rows[0] as { count: number; reset_at: string | Date } | undefined;
    if (row && new Date(row.reset_at).getTime() > Date.now() && Number(row.count) >= THROTTLE_ATTEMPTS) {
      return "limited";
    }
    return "ok";
  } catch {
    return "unavailable";
  }
}

async function dbThrottleRecord(key: string): Promise<void> {
  try {
    await query(
      `INSERT INTO login_rate_limits (key, count, reset_at) VALUES ($1, 1, NOW() + INTERVAL '15 minutes')
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN login_rate_limits.reset_at <= NOW() THEN 1 ELSE login_rate_limits.count + 1 END,
         reset_at = CASE WHEN login_rate_limits.reset_at <= NOW() THEN NOW() + INTERVAL '15 minutes' ELSE login_rate_limits.reset_at END`,
      [key],
    );
  } catch {
    // Fallback below covers store outages.
  }
}

async function dbThrottleClear(key: string): Promise<void> {
  try {
    await query(`DELETE FROM login_rate_limits WHERE key=$1`, [key]);
  } catch {
    // Best-effort.
  }
}
// Valid, deliberately unusable hash keeps unknown-user and wrong-password work
// comparable without creating a credential or disclosing which usernames exist.
const INVALID_PASSWORD_HASH = "scrypt$32768$8$1$YZz0J53a6Wqhsqla6GvL9A==$U6zddAOO1AMsXdqsZKU9ZsoSVLiLn6JAr79uWXt25QRAM4fZsiGtV5Uw+wNzSb35F5mKjILuqDxj9XKo5np7Jw==";
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const mapUser = (row: Record<string, unknown>): AuthUser => ({
  id: Number(row.id), username: String(row.username), displayName: String(row.display_name),
  role: row.role as AppRole, employeeId: row.employee_id == null ? null : Number(row.employee_id),
  mustChangePassword: Boolean(row.must_change_password),
});

const AUTH_RELATIONS = /\b(?:application_users|application_sessions)\b/i;

function rethrowAuthStorageError(error: unknown): never {
  if (
    isPgError(error) &&
    error.code === "42P01" &&
    AUTH_RELATIONS.test(error.message ?? "")
  ) {
    throw new AppError(
      503,
      "Authentication is unavailable because application accounts are not configured for this database"
    );
  }
  throw error;
}

export const authService = {
  recordLoginFailure(username: string, meta?: AuditMeta) {
    auditEvent("login_failure", null, username.trim().toLowerCase(), meta);
  },
  async profile(userId: number) {
    const result = await query(
      `SELECT u.id,u.username,u.display_name,u.role,u.last_password_reset_at,
              e.employee_no,e.employee_name,e.phone_number,e.department,e.status AS employee_status
         FROM application_users u LEFT JOIN employees e ON e.id=u.employee_id WHERE u.id=$1`, [userId]);
    if (!result.rowCount) throw new AppError(404,"Profile was not found");
    const row=result.rows[0];
    return { id:Number(row.id),username:String(row.username),fullName:String(row.employee_name??row.display_name),
      role:String(row.role),employeeNumber:row.employee_no==null?null:String(row.employee_no),
      mobileNumber:String(row.phone_number??""),department:String(row.department??""),
      employeeStatus:row.employee_status??null,lastPasswordResetAt:row.last_password_reset_at??null };
  },
  async login(username: string, password: string, meta?: AuditMeta) {
    try {
      const found = await query(
        `SELECT u.*,e.status AS employee_status FROM application_users u LEFT JOIN employees e ON e.id=u.employee_id
         WHERE LOWER(u.username)=LOWER($1)`, [username.trim()]);
      const row = found.rows[0];
      const passwordMatches = await verifyPassword(password, row ? String(row.password_hash) : INVALID_PASSWORD_HASH);
      if (!row || !passwordMatches) {
        throw new AppError(401, "Invalid username or password");
      }
      if (row.employee_id != null && row.employee_status !== "Active") {
        throw new AppError(403, "Your employee profile is inactive. Contact the owner.", undefined, "EMPLOYEE_INACTIVE");
      }
      if (row.access_status === "PAUSED") {
        throw new AppError(403, "Your login access is paused. Contact the owner.", undefined, "ACCESS_PAUSED");
      }
      if (row.access_status === "REVOKED" || !row.active) {
        throw new AppError(403, "Your login access has been revoked. Contact the owner.", undefined, "ACCESS_REVOKED");
      }
      if (row.access_status !== "ACTIVE") {
        throw new AppError(403, "Login access has not been granted. Contact the owner.", undefined, "ACCESS_NOT_GRANTED");
      }
      if (row.role === "SUPERVISOR" && row.employee_id == null) {
        throw new AppError(403, "Supervisor account is not linked to an employee");
      }
      // Second factor gate: an active TOTP factor converts the login into a
      // short-lived single-use challenge ticket. No session exists until the
      // ticket is verified — the ticket authorizes exactly one verify call.
      const factor = await query(
        `SELECT user_id FROM mfa_factors WHERE user_id=$1 AND active=TRUE`,
        [row.id],
      ).catch(() => ({ rowCount: 0, rows: [] as never[] }));
      if (factor.rowCount) {
        const ticket = randomBytes(32).toString("base64url");
        try {
          await query(
            `INSERT INTO mfa_tickets (ticket_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
            [tokenHash(ticket), row.id, new Date(Date.now() + MFA_TICKET_MS)],
          );
        } catch (error) {
          rethrowAuthStorageError(error);
        }
        auditEvent("login", Number(row.id), String(row.username), meta);
        return { mfaRequired: true as const, mfaTicket: ticket, user: mapUser(row) };
      }
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + SESSION_MS);
      // Keep independent browser tabs/windows/devices signed in. Revoking all
      // existing sessions here made any second login invalidate the dashboard
      // token already in use, producing a fan-out of 401s from every mounted
      // API query. Explicit logout still revokes its token, and password
      // changes still revoke every session for the account.
      const previousSessionsEnded = 0;
      await withTransaction(async (client) => {
        // Bound table growth without touching any currently valid session.
        await client.query(
          `DELETE FROM application_sessions
           WHERE user_id = $1
             AND (expires_at <= NOW() OR revoked_at IS NOT NULL)`,
          [row.id],
        );
        await client.query(
          `INSERT INTO application_sessions (id,user_id,token_hash,expires_at,last_activity_at) VALUES ($1,$2,$3,$4,NOW())`,
          [randomUUID(), row.id, tokenHash(token), expiresAt],
        );
        await client.query(`UPDATE application_users SET last_login_at=NOW() WHERE id=$1`, [row.id]);
      });
      auditEvent("login", Number(row.id), String(row.username), meta);
      return {
        token,
        expiresAt: expiresAt.toISOString(),
        user: mapUser(row),
        previousSessionsEnded,
      };
    } catch (error) {
      rethrowAuthStorageError(error);
    }
  },
  async authenticate(token: string): Promise<AuthSession | null> {
    try {
      const result = await query(`SELECT u.*,s.expires_at AS session_expires_at,
        COALESCE(s.last_activity_at, s.last_seen_at, s.created_at) AS session_last_activity
        FROM application_sessions s JOIN application_users u ON u.id=s.user_id
        LEFT JOIN employees e ON e.id=u.employee_id
        WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>NOW()
          -- Paused employees keep already-signed-in sessions (owner intent:
          -- pause freezes NEW logins, revoke signs out). Only REVOKED/inactive
          -- users lose their session.
          AND u.active=TRUE AND u.access_status IN ('ACTIVE','PAUSED')
          AND (u.employee_id IS NULL OR e.status='Active')`, [tokenHash(token)]);
      if (!result.rowCount) return null;
      // Server-side idle enforcement (server time): ordinary reads, polling,
      // and health checks must NOT extend the session — only login and the
      // explicit POST /auth/activity endpoint advance last_activity_at.
      const lastActivity = result.rows[0].session_last_activity as string | Date | null;
      if (isSessionIdleExpired(lastActivity, Date.now())) {
        void query(`UPDATE application_sessions SET revoked_at=COALESCE(revoked_at,NOW()) WHERE token_hash=$1`, [tokenHash(token)]).catch(() => undefined);
        auditEvent("idle_expired", Number(result.rows[0].id), String(result.rows[0].username));
        return null;
      }
      // Observability only — throttled, and never used for expiry decisions.
      void query(`UPDATE application_sessions SET last_seen_at=NOW() WHERE token_hash=$1 AND last_seen_at < NOW()-INTERVAL '5 minutes'`, [tokenHash(token)]).catch(() => undefined);
      return { user: mapUser(result.rows[0]), expiresAt: new Date(result.rows[0].session_expires_at as string | Date).toISOString() };
    } catch (error) {
      rethrowAuthStorageError(error);
    }
  },
  /**
   * Shared login throttle (multi-instance safe, fail-open). Throws 429 when
   * the IP+account allowance is exhausted; records a failure otherwise.
   */
  async throttleConsume(key: string): Promise<void> {
    const state = await dbThrottleCheck(key);
    if (state === "limited") throw new AppError(429, "Too many login attempts; try again later");
    if (state === "unavailable") {
      const prior = memoryThrottle.get(key);
      if (prior && prior.resetAt > Date.now() && prior.count >= THROTTLE_ATTEMPTS) {
        throw new AppError(429, "Too many login attempts; try again later");
      }
    }
  },
  async throttleFailure(key: string): Promise<void> {
    await dbThrottleRecord(key);
    const current =
      memoryThrottle.get(key) && (memoryThrottle.get(key) as { resetAt: number }).resetAt > Date.now()
        ? (memoryThrottle.get(key) as { count: number; resetAt: number })
        : { count: 0, resetAt: Date.now() + THROTTLE_WINDOW_MS };
    memoryThrottle.set(key, { ...current, count: current.count + 1 });
  },
  async throttleClear(key: string): Promise<void> {
    await dbThrottleClear(key);
    memoryThrottle.delete(key);
  },
  /** Record genuine user activity (server time). Returns null when the session
   *  is unknown, revoked, absolutely expired, idle-expired, or disabled.
   *  Pings arriving within 5s of the previous one are acknowledged without a
   *  write (`throttled: true`) so endpoint spam cannot churn the database —
   *  and spam can never extend the absolute lifetime (expires_at is only
   *  ever read, never written here). Concurrent pings are safe: blind,
   *  idempotent writes with no read-modify-write cycle. */
  async touchActivity(token: string): Promise<{ expiresAt: string; version: number; throttled: boolean } | null> {
    try {
      const current = await query(
        `SELECT s.expires_at AS expires_at, s.version AS version,
           COALESCE(s.last_activity_at, s.last_seen_at, s.created_at) AS last_activity
         FROM application_sessions s JOIN application_users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW() AND u.active = TRUE`,
        [tokenHash(token)],
      );
      if (!current.rowCount) return null;
      const row = current.rows[0] as Record<string, unknown>;
      if (isSessionIdleExpired(row.last_activity as string | Date | null, Date.now())) {
        void query(`UPDATE application_sessions SET revoked_at=COALESCE(revoked_at,NOW()) WHERE token_hash=$1`, [tokenHash(token)]).catch(() => undefined);
        return null;
      }
      const expiresAt = new Date(row.expires_at as string | Date).toISOString();
      const version = Number(row.version ?? 1);
      const lastActivityMs = new Date(row.last_activity as string | Date).getTime();
      if (Number.isFinite(lastActivityMs) && Date.now() - lastActivityMs < 5000) {
        return { expiresAt, version, throttled: true };
      }
      await query(`UPDATE application_sessions SET last_activity_at=NOW() WHERE token_hash=$1`, [
        tokenHash(token),
      ]);
      return { expiresAt, version, throttled: false };
    } catch (error) {
      rethrowAuthStorageError(error);
    }
  },
  async logout(token: string, meta?: AuditMeta) {
    try {
      const found = await query(
        `UPDATE application_sessions SET revoked_at=COALESCE(revoked_at,NOW()) WHERE token_hash=$1
         RETURNING user_id`,
        [tokenHash(token)],
      );
      const userId = found.rows[0]?.user_id == null ? null : Number(found.rows[0].user_id);
      auditEvent("logout", userId, null, meta);
    } catch (error) {
      rethrowAuthStorageError(error);
    }
  },
  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
    meta?: AuditMeta,
    totpCode?: string,
  ) {
    try {
      const found = await query(
        `SELECT id, username, display_name, role, employee_id, password_hash
         FROM application_users WHERE id=$1 AND active=TRUE`,
        [userId],
      );
      const row = found.rows[0];
      if (!row) throw new AppError(401, "Authentication required");
      const matches = await verifyPassword(currentPassword, String(row.password_hash));
      if (!matches) throw new AppError(401, "Current password is incorrect");
      // Step-up: accounts with an active second factor must additionally
      // prove it to change the password (recovery codes are not accepted
      // here — only a live authenticator code).
      const factor = await query(`SELECT secret_enc FROM mfa_factors WHERE user_id=$1 AND active=TRUE`, [
        userId,
      ]).catch(() => ({ rowCount: 0, rows: [] as never[] }));
      if (factor.rowCount) {
        const secret = decryptMfaSecret(String((factor.rows[0] as Record<string, unknown>).secret_enc));
        if (!totpCode || !verifyTotpCode(secret, totpCode)) {
          throw new AppError(401, "Two-factor code required", undefined, "MFA_REQUIRED");
        }
      }
      if (currentPassword === newPassword) {
        throw new AppError(400, "New password must be different from the current password");
      }
      let passwordHash: string;
      try {
        passwordHash = await hashPassword(newPassword);
      } catch {
        throw new AppError(400, "Password must contain between 12 and 1024 characters");
      }
      await withTransaction(async (client) => {
        const updated = await client.query(
          `UPDATE application_users SET password_hash=$2, must_change_password=FALSE,
             reveal_password=NULL, last_password_reset_at=NOW(), updated_at=NOW()
           WHERE id=$1
           RETURNING id, password_hash`,
          [userId, passwordHash],
        );
        if (!updated.rowCount) {
          throw new AppError(500, "Password could not be updated");
        }
        // Confirm the NEW hash is what was stored (old password must fail).
        const stored = String(updated.rows[0].password_hash);
        const newOk = await verifyPassword(newPassword, stored);
        const oldStillWorks = await verifyPassword(currentPassword, stored);
        if (!newOk || oldStillWorks) {
          throw new AppError(500, "Password update verification failed");
        }
        // Password change ends every session — caller must sign in again.
        await client.query(
          `UPDATE application_sessions SET revoked_at=COALESCE(revoked_at,NOW())
           WHERE user_id=$1 AND revoked_at IS NULL`,
          [userId],
        );
        await client.query(
          `INSERT INTO access_security_events(user_id,actor_user_id,event,details)
           VALUES($1,$1,'PASSWORD_CHANGED',jsonb_build_object('sessionsInvalidated',true))`,
          [userId],
        );
      });
      auditEvent("password_change", userId, String(row.username), meta);
      // Keep the local operator credentials file in sync with the NEW password.
      syncLocalCredentialsPassword(String(row.username), newPassword, {
        role: String(row.role),
        employeeId: row.employee_id == null ? null : Number(row.employee_id),
        employeeName: String(row.display_name),
      });
    } catch (error) {
      rethrowAuthStorageError(error);
    }
  },
  /**
   * Forgot-password request. ALWAYS succeeds outwardly (generic response, no
   * account oracle): unknown usernames cost the same token-generation work
   * and return the same shape. The raw token is returned ONLY outside
   * production, for operator relay over an already-trusted channel until a
   * delivery integration exists; production callers receive `{}` and must
   * configure delivery before enabling self-service.
   */
  async requestPasswordReset(
    username: string,
    meta?: AuditMeta,
  ): Promise<{ resetToken?: string }> {
    try {
      const name = username.trim();
      // Constant-shape work regardless of account existence (anti-enumeration).
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      const found = await query(
        `SELECT id, username FROM application_users WHERE LOWER(username)=LOWER($1) AND active=TRUE`,
        [name],
      );
      const row = found.rows[0] as { id: number; username: string } | undefined;
      if (row) {
        await withTransaction(async (client) => {
          // One live token per account: prior unused tokens die on re-request
          // (prevents token accumulation + replay of older emails/links).
          await client.query(
            `UPDATE password_reset_tokens SET used_at=COALESCE(used_at,NOW())
             WHERE user_id=$1 AND used_at IS NULL`,
            [row.id],
          );
          await client.query(
            `INSERT INTO password_reset_tokens (id,user_id,token_hash,expires_at)
             VALUES ($1,$2,$3,$4)`,
            [randomUUID(), row.id, tokenHash(token), expiresAt],
          );
        });
        auditEvent("password_reset_request", Number(row.id), String(row.username), meta);
      } else {
        auditEvent("password_reset_request", null, null, meta);
      }
      if (env.nodeEnv === "production") return {};
      return row ? { resetToken: token } : {};
    } catch (error) {
      rethrowAuthStorageError(error);
    }
  },
  /**
   * Forgot-password completion. Generic 401 for unknown/expired/used tokens
   * (no oracle). On success: strong-password enforced, token single-used,
   * ALL sessions revoked, and the caller must sign in normally (no
   * auto-login).
   */
  async completePasswordReset(token: string, newPassword: string, meta?: AuditMeta): Promise<void> {
    try {
      const found = await query(
        `SELECT t.id AS token_id, t.used_at AS used_at, t.expires_at AS expires_at,
                u.id AS user_id, u.username AS username, u.display_name AS display_name,
                u.role AS role, u.employee_id AS employee_id
         FROM password_reset_tokens t JOIN application_users u ON u.id = t.user_id
         WHERE t.token_hash = $1 AND u.active = TRUE`,
        [tokenHash(token)],
      );
      const row = found.rows[0] as Record<string, unknown> | undefined;
      const live =
        row && !row.used_at && new Date(row.expires_at as string | Date).getTime() > Date.now();
      if (!live || !row) throw new AppError(401, "This reset link is invalid or has expired");
      let passwordHash: string;
      try {
        passwordHash = await hashPassword(newPassword);
      } catch {
        throw new AppError(400, "Password must contain between 12 and 1024 characters");
      }
      await withTransaction(async (client) => {
        const claimed = await client.query(
          `UPDATE password_reset_tokens SET used_at=NOW()
           WHERE id=$1 AND used_at IS NULL AND expires_at > NOW()`,
          [row.token_id],
        );
        if (!claimed.rowCount) throw new AppError(401, "This reset link is invalid or has expired");
        await client.query(`UPDATE application_users SET password_hash=$2, updated_at=NOW() WHERE id=$1`, [
          Number(row.user_id),
          passwordHash,
        ]);
        // Reset ends every session — the account must sign in again.
        const revoked = await client.query(
          `UPDATE application_sessions SET revoked_at=COALESCE(revoked_at,NOW())
           WHERE user_id=$1 AND revoked_at IS NULL RETURNING id`,
          [Number(row.user_id)],
        );
        await client.query(`INSERT INTO access_security_events(user_id,actor_user_id,event,details) VALUES($1,$1,'PASSWORD_RESET',jsonb_build_object('sessionsInvalidated',$2::int))`,[Number(row.user_id),revoked.rowCount??0]);
      });
      auditEvent("password_reset", Number(row.user_id), String(row.username), meta);
      syncLocalCredentialsPassword(String(row.username), newPassword, {
        role: String(row.role),
        employeeId: row.employee_id == null ? null : Number(row.employee_id),
        employeeName: String(row.display_name),
      });
    } catch (error) {
      rethrowAuthStorageError(error);
    }
  },
  /** Whether the account has an active second factor. */
  async mfaStatus(userId: number): Promise<{ enabled: boolean }> {
    try {
      const found = await query(`SELECT user_id FROM mfa_factors WHERE user_id=$1 AND active=TRUE`, [userId]);
      return { enabled: Boolean(found.rowCount) };
    } catch (error) {
      rethrowAuthStorageError(error);
    }
  },
  /**
   * Begin enrollment: generates a fresh secret, stores it ENCRYPTED and
   * inactive, and returns the provisioning material ONCE to the authenticated
   * owner. Re-enrollment replaces the pending secret; an ACTIVE factor must be
   * disabled first (409) so enrollment can never silently swap protection.
   */
  async mfaEnrollStart(userId: number, meta?: AuditMeta): Promise<{ secret: string; otpauthUrl: string }> {
    try {
      const user = await query(`SELECT id, username FROM application_users WHERE id=$1 AND active=TRUE`, [userId]);
      if (!user.rowCount) throw new AppError(401, "Authentication required");
      const existing = await query(`SELECT active FROM mfa_factors WHERE user_id=$1`, [userId]);
      if (existing.rows[0]?.active) {
        throw new AppError(409, "Two-factor authentication is already enabled");
      }
      const secret = randomBytes(20);
      const account = String(user.rows[0].username);
      await query(
        `INSERT INTO mfa_factors (user_id, secret_enc, active, label)
         VALUES ($1, $2, FALSE, $3)
         ON CONFLICT (user_id) DO UPDATE SET secret_enc=EXCLUDED.secret_enc, active=FALSE, confirmed_at=NULL`,
        [userId, encryptMfaSecret(secret), `DMR:${account}`],
      );
      const encoded = base32Encode(secret);
      const otpauthUrl =
        `otpauth://totp/${encodeURIComponent(MFA_ISSUER)}:${encodeURIComponent(account)}` +
        `?secret=${encoded}&issuer=${encodeURIComponent(MFA_ISSUER)}&algorithm=SHA1&digits=6&period=30`;
      auditEvent("mfa_enrolled", userId, account, meta);
      return { secret: encoded, otpauthUrl };
    } catch (error) {
      rethrowAuthStorageError(error);
    }
  },
  /**
   * Confirm enrollment with a live authenticator code. Activates the factor
   * and issues 10 single-use recovery codes (hashed at rest, shown once).
   */
  async mfaEnrollConfirm(userId: number, code: string, meta?: AuditMeta): Promise<{ recoveryCodes: string[] }> {
    try {
      const found = await query(
        `SELECT f.secret_enc AS secret_enc, u.username AS username
         FROM mfa_factors f JOIN application_users u ON u.id=f.user_id
         WHERE f.user_id=$1 AND u.active=TRUE`,
        [userId],
      );
      const row = found.rows[0] as Record<string, unknown> | undefined;
      if (!row) throw new AppError(401, "Authentication required");
      if (!verifyTotpCode(decryptMfaSecret(String(row.secret_enc)), code)) {
        throw new AppError(401, "Two-factor verification failed");
      }
      const codes = Array.from({ length: 10 }, () => newRecoveryCode());
      await withTransaction(async (client) => {
        await client.query(`UPDATE mfa_factors SET active=TRUE, confirmed_at=NOW() WHERE user_id=$1`, [userId]);
        await client.query(`DELETE FROM mfa_recovery_codes WHERE user_id=$1`, [userId]);
        for (const plain of codes) {
          await client.query(
            `INSERT INTO mfa_recovery_codes (id, user_id, code_hash) VALUES ($1, $2, $3)`,
            [randomUUID(), userId, tokenHash(normalizeRecoveryCode(plain))],
          );
        }
      });
      auditEvent("mfa_verified", userId, String(row.username), meta);
      return { recoveryCodes: codes };
    } catch (error) {
      rethrowAuthStorageError(error);
    }
  },
  /**
   * Consume a login challenge ticket with a TOTP code or an unused recovery
   * code. The ticket is single-use (claimed inside the session-creation
   * transaction), expires in 5 minutes, and is throttled — so an intercepted
   * code is useless without a fresh password login. Creates the real session.
   */
  async mfaVerifyTicket(ticket: string, code: string, meta?: AuditMeta) {
    const throttleKey = `mfa:${tokenHash(String(ticket ?? ""))}`;
    await authService.throttleConsume(throttleKey);
    try {
      const found = await query(
        `SELECT t.user_id AS user_id, t.used_at AS used_at, t.expires_at AS expires_at,
                u.username AS username, u.display_name AS display_name, u.role AS role,
                u.employee_id AS employee_id, u.active AS active,
                u.must_change_password AS must_change_password
         FROM mfa_tickets t JOIN application_users u ON u.id=t.user_id
         LEFT JOIN employees e ON e.id=u.employee_id
         WHERE t.ticket_hash=$1 AND u.access_status='ACTIVE'
           AND (u.employee_id IS NULL OR e.status='Active')`,
        [tokenHash(String(ticket ?? ""))],
      );
      const row = found.rows[0] as Record<string, unknown> | undefined;
      const live =
        row && !row.used_at && new Date(row.expires_at as string | Date).getTime() > Date.now() && row.active;
      if (!live || !row) throw new AppError(401, "Two-factor verification failed");
      const userId = Number(row.user_id);
      let secondFactorOk = false;
      let recoveryUsed: string | null = null;
      const factor = await query(`SELECT secret_enc FROM mfa_factors WHERE user_id=$1 AND active=TRUE`, [userId]);
      const secretRow = factor.rows[0] as Record<string, unknown> | undefined;
      if (secretRow && verifyTotpCode(decryptMfaSecret(String(secretRow.secret_enc)), code)) {
        secondFactorOk = true;
      } else {
        const normalized = normalizeRecoveryCode(code);
        if (normalized.length >= 8) {
          const codeRow = await query(
            `SELECT id FROM mfa_recovery_codes
             WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL`,
            [userId, tokenHash(normalized)],
          );
          if (codeRow.rowCount) {
            secondFactorOk = true;
            recoveryUsed = String((codeRow.rows[0] as Record<string, unknown>).id);
          }
        }
      }
      if (!secondFactorOk) {
        await authService.throttleFailure(throttleKey);
        throw new AppError(401, "Two-factor verification failed");
      }
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + SESSION_MS);
      await withTransaction(async (client) => {
        const claimed = await client.query(
          `UPDATE mfa_tickets SET used_at=NOW()
           WHERE ticket_hash=$1 AND used_at IS NULL AND expires_at > NOW()`,
          [tokenHash(String(ticket))],
        );
        if (!claimed.rowCount) throw new AppError(401, "Two-factor verification failed");
        if (recoveryUsed) {
          await client.query(`UPDATE mfa_recovery_codes SET used_at=NOW() WHERE id=$1 AND used_at IS NULL`, [
            recoveryUsed,
          ]);
        }
        await client.query(
          `INSERT INTO application_sessions (id,user_id,token_hash,expires_at,last_activity_at) VALUES ($1,$2,$3,$4,NOW())`,
          [randomUUID(), userId, tokenHash(token), expiresAt],
        );
        await client.query(`UPDATE application_users SET last_login_at=NOW() WHERE id=$1`, [userId]);
      });
      await authService.throttleClear(throttleKey);
      auditEvent("mfa_verified", userId, String(row.username), meta);
      auditEvent("login", userId, String(row.username), meta);
      return {
        user: {
          id: userId,
          username: String(row.username),
          displayName: String(row.display_name),
          role: row.role as AppRole,
          employeeId: row.employee_id == null ? null : Number(row.employee_id),
          mustChangePassword: Boolean(row.must_change_password),
        } satisfies AuthUser,
        token,
        expiresAt: expiresAt.toISOString(),
        previousSessionsEnded: 0,
      };
    } catch (error) {
      rethrowAuthStorageError(error);
    }
  },
  /**
   * Disable the factor (requires a live TOTP or unused recovery code — a bare
   * session is not enough to drop protection). Sessions are kept; the next
   * login simply stops challenging.
   */
  async mfaDisable(userId: number, code: string, meta?: AuditMeta): Promise<void> {
    try {
      const factor = await query(
        `SELECT f.secret_enc AS secret_enc, u.username AS username
         FROM mfa_factors f JOIN application_users u ON u.id=f.user_id
         WHERE f.user_id=$1 AND f.active=TRUE AND u.active=TRUE`,
        [userId],
      );
      const row = factor.rows[0] as Record<string, unknown> | undefined;
      if (!row) throw new AppError(404, "Two-factor authentication is not enabled");
      let ok = verifyTotpCode(decryptMfaSecret(String(row.secret_enc)), code);
      if (!ok) {
        const normalized = normalizeRecoveryCode(code);
        const codeRow =
          normalized.length >= 8
            ? await query(
                `SELECT id FROM mfa_recovery_codes WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL`,
                [userId, tokenHash(normalized)],
              )
            : { rowCount: 0, rows: [] as never[] };
        ok = Boolean(codeRow.rowCount);
      }
      if (!ok) throw new AppError(401, "Two-factor verification failed");
      await withTransaction(async (client) => {
        await client.query(`DELETE FROM mfa_recovery_codes WHERE user_id=$1`, [userId]);
        await client.query(`DELETE FROM mfa_factors WHERE user_id=$1`, [userId]);
        await client.query(`UPDATE mfa_tickets SET used_at=COALESCE(used_at,NOW()) WHERE user_id=$1 AND used_at IS NULL`, [
          userId,
        ]);
      });
      auditEvent("mfa_disabled", userId, String(row.username), meta);
    } catch (error) {
      rethrowAuthStorageError(error);
    }
  },
  /** OWNER-only recovery: revoke a user's factors, codes, and live tickets. */
  async mfaAdminReset(admin: AuthUser, targetUserId: number, meta?: AuditMeta): Promise<void> {
    if (admin.role !== "OWNER") throw new AppError(403, "Owner access is required");
    try {
      const target = await query(`SELECT id, username FROM application_users WHERE id=$1`, [targetUserId]);
      if (!target.rowCount) throw new AppError(404, "User not found");
      await withTransaction(async (client) => {
        await client.query(`DELETE FROM mfa_recovery_codes WHERE user_id=$1`, [targetUserId]);
        await client.query(`DELETE FROM mfa_factors WHERE user_id=$1`, [targetUserId]);
        await client.query(
          `UPDATE mfa_tickets SET used_at=COALESCE(used_at,NOW()) WHERE user_id=$1 AND used_at IS NULL`,
          [targetUserId],
        );
      });
      auditEvent("mfa_reset", targetUserId, String(target.rows[0].username), meta);
    } catch (error) {
      rethrowAuthStorageError(error);
    }
  },
};
