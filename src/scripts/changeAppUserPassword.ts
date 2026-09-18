/**
 * Change an application user's password and sync the local credentials file.
 *
 * Usage:
 *   echo "NewSecurePass12!" | npm run account:password -- owner
 *   (password via stdin, ≥12 chars)
 *
 * Updates PostgreSQL application_users.password_hash and, when present,
 * backend/.auth-local.credentials.json for that username.
 */
import { pool } from "../config/db.js";
import { hashPassword, verifyPassword } from "../utils/passwordHash.js";
import { syncLocalCredentialsPassword } from "../utils/localCredentials.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8").trimEnd();
}

async function run() {
  const username = process.argv[2];
  if (!username) {
    throw new Error("Usage: npm run account:password -- <username> (new password via stdin)");
  }
  const password = await readStdin();
  const passwordHash = await hashPassword(password);

  const existing = await pool.query(
    `SELECT id, password_hash FROM application_users WHERE LOWER(username)=LOWER($1)`,
    [username.trim()],
  );
  if (!existing.rowCount) {
    throw new Error(`No application user named '${username.trim()}' was found.`);
  }
  if (await verifyPassword(password, String(existing.rows[0].password_hash))) {
    throw new Error("New password must be different from the current password.");
  }

  const updated = await pool.query(
    `UPDATE application_users
     SET password_hash = $2, updated_at = NOW(), active = TRUE
     WHERE id = $1
     RETURNING id, username, role, employee_id, display_name, password_hash`,
    [existing.rows[0].id, passwordHash],
  );

  const stored = String(updated.rows[0].password_hash);
  if (!(await verifyPassword(password, stored))) {
    throw new Error("Password update verification failed — new password does not match stored hash.");
  }

  await pool.query(
    `UPDATE application_sessions SET revoked_at = COALESCE(revoked_at, NOW())
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [updated.rows[0].id],
  );

  const synced = syncLocalCredentialsPassword(String(updated.rows[0].username), password, {
    role: String(updated.rows[0].role),
    employeeId: updated.rows[0].employee_id == null ? null : Number(updated.rows[0].employee_id),
    employeeName: String(updated.rows[0].display_name),
  });

  console.log(
    synced
      ? `Updated password for ${updated.rows[0].username} and synced .auth-local.credentials.json`
      : `Updated password for ${updated.rows[0].username} (no local credentials file to sync)`,
  );
}

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Password update failed");
    process.exitCode = 1;
  })
  .finally(() => pool.end());
