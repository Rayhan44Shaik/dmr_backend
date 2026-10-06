/**
 * Local-only credentials file sync for development operators.
 * Never used as the source of truth — PostgreSQL password_hash is.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const LOCAL_CREDENTIALS_PATH = path.resolve(__dirname, "../../.auth-local.credentials.json");

type CredentialsFile = {
  createdAt?: string;
  updatedAt?: string;
  note?: string;
  accounts?: Array<Record<string, unknown>>;
};

/**
 * Updates (or appends) the plaintext password for `username` in the local
 * gitignored credentials file so operators can see the current password after
 * a UI or CLI change. No-op when the file is absent.
 *
 * SECURITY: plaintext credentials must never be persisted in production —
 * the sync only runs outside NODE_ENV=production.
 */
export function syncLocalCredentialsPassword(
  username: string,
  password: string,
  extras: { role?: string; employeeId?: number | null; employeeName?: string } = {},
): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (!existsSync(LOCAL_CREDENTIALS_PATH)) return false;
  let raw: CredentialsFile = {};
  try {
    raw = JSON.parse(readFileSync(LOCAL_CREDENTIALS_PATH, "utf8")) as CredentialsFile;
  } catch {
    raw = {};
  }
  const accounts = Array.isArray(raw.accounts) ? [...raw.accounts] : [];
  const key = username.trim().toLowerCase();
  let found = false;
  const next = accounts.map((account) => {
    if (String(account.username ?? "").toLowerCase() !== key) return account;
    found = true;
    return {
      ...account,
      password,
      ...(extras.role ? { role: extras.role } : {}),
      ...(extras.employeeId !== undefined ? { employeeId: extras.employeeId } : {}),
      ...(extras.employeeName ? { employeeName: extras.employeeName } : {}),
    };
  });
  if (!found) {
    next.push({
      username: username.trim(),
      role: extras.role ?? "OWNER",
      password,
      ...(extras.employeeId != null ? { employeeId: extras.employeeId } : {}),
      ...(extras.employeeName ? { employeeName: extras.employeeName } : {}),
    });
  }
  writeFileSync(
    LOCAL_CREDENTIALS_PATH,
    `${JSON.stringify(
      {
        ...raw,
        updatedAt: new Date().toISOString(),
        note: "LOCAL ONLY — do not commit. Passwords are hashed in PostgreSQL.",
        accounts: next,
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  return true;
}
