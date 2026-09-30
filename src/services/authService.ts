import { createHash, randomBytes, randomUUID } from "node:crypto";
import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { isPgError } from "../utils/pgErrors.js";
import { verifyPassword, hashPassword } from "../utils/passwordHash.js";
import { syncLocalCredentialsPassword } from "../utils/localCredentials.js";

export type AppRole = "OWNER" | "SENIOR_ACCOUNT" | "SUPERVISOR";
export type AuthUser = { id: number; username: string; displayName: string; role: AppRole; employeeId: number | null };
export type AuthSession = { user: AuthUser; expiresAt: string };
const SESSION_MS = 8 * 60 * 60 * 1000;
// Valid, deliberately unusable hash keeps unknown-user and wrong-password work
// comparable without creating a credential or disclosing which usernames exist.
const INVALID_PASSWORD_HASH = "scrypt$32768$8$1$YZz0J53a6Wqhsqla6GvL9A==$U6zddAOO1AMsXdqsZKU9ZsoSVLiLn6JAr79uWXt25QRAM4fZsiGtV5Uw+wNzSb35F5mKjILuqDxj9XKo5np7Jw==";
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const mapUser = (row: Record<string, unknown>): AuthUser => ({
  id: Number(row.id), username: String(row.username), displayName: String(row.display_name),
  role: row.role as AppRole, employeeId: row.employee_id == null ? null : Number(row.employee_id),
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
  async login(username: string, password: string) {
    try {
      const found = await query(`SELECT * FROM application_users WHERE LOWER(username)=LOWER($1) AND active=TRUE`, [username.trim()]);
      const row = found.rows[0];
      const passwordMatches = await verifyPassword(password, row ? String(row.password_hash) : INVALID_PASSWORD_HASH);
      if (!row || !passwordMatches) {
        throw new AppError(401, "Invalid username or password");
      }
      if (row.role === "SUPERVISOR" && row.employee_id == null) {
        throw new AppError(403, "Supervisor account is not linked to an employee");
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
          `INSERT INTO application_sessions (id,user_id,token_hash,expires_at) VALUES ($1,$2,$3,$4)`,
          [randomUUID(), row.id, tokenHash(token), expiresAt],
        );
        await client.query(`UPDATE application_users SET last_login_at=NOW() WHERE id=$1`, [row.id]);
      });
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
      const result = await query(`SELECT u.*,s.expires_at AS session_expires_at FROM application_sessions s JOIN application_users u ON u.id=s.user_id
        WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>NOW() AND u.active=TRUE`, [tokenHash(token)]);
      if (!result.rowCount) return null;
      void query(`UPDATE application_sessions SET last_seen_at=NOW() WHERE token_hash=$1 AND last_seen_at < NOW()-INTERVAL '5 minutes'`, [tokenHash(token)]).catch(() => undefined);
      return { user: mapUser(result.rows[0]), expiresAt: new Date(result.rows[0].session_expires_at as string | Date).toISOString() };
    } catch (error) {
      rethrowAuthStorageError(error);
    }
  },
  async logout(token: string) {
    try {
      await query(`UPDATE application_sessions SET revoked_at=COALESCE(revoked_at,NOW()) WHERE token_hash=$1`, [tokenHash(token)]);
    } catch (error) {
      rethrowAuthStorageError(error);
    }
  },
  async changePassword(userId: number, currentPassword: string, newPassword: string) {
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
          `UPDATE application_users SET password_hash=$2, updated_at=NOW() WHERE id=$1
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
      });
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
};
