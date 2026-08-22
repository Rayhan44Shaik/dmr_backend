import { randomBytes, randomUUID } from "node:crypto";
import { query } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { mastersService } from "./mastersService.js";
import { hashPassword, hashToken, verifyPassword } from "../utils/passwordHash.js";

const SESSION_DAYS = 30;

export const MOBILE_DEV_USERNAME = process.env.MOBILE_DEV_USERNAME ?? "RuhullaShaik";
export const MOBILE_DEV_PASSWORD = process.env.MOBILE_DEV_PASSWORD ?? "Supervisor@123";

export type MobileSupervisorProfile = {
  accountId: string;
  employeeId: number;
  employeeName: string;
  username: string;
  role: string;
  department: string;
};

export type MobileAuthContext = {
  accountId: number;
  employeeId: number;
  username: string;
  tokenHash: string;
  profile: MobileSupervisorProfile;
};

function profileFromRow(row: Record<string, unknown>): MobileSupervisorProfile {
  return {
    accountId: String(row.account_id),
    employeeId: Number(row.employee_id),
    employeeName: String(row.employee_name),
    username: String(row.username),
    role: String(row.role ?? "Supervisor"),
    department: String(row.department ?? "Supervisor"),
  };
}

const ACCOUNT_SELECT = `
  SELECT
    a.id AS account_id,
    a.username,
    a.password_hash,
    a.status AS account_status,
    e.id AS employee_id,
    e.employee_name,
    e.role,
    e.department,
    e.status AS employee_status
  FROM mobile_supervisor_accounts a
  JOIN employees e ON e.id = a.employee_id
`;

export const mobileAuthService = {
  async ensureDevAccount() {
    const existing = await query(
      `${ACCOUNT_SELECT} WHERE LOWER(a.username) = LOWER($1)`,
      [MOBILE_DEV_USERNAME]
    );
    if (existing.rowCount) return profileFromRow(existing.rows[0]);

    let employee = (
      await query(
        `SELECT * FROM employees
         WHERE LOWER(employee_name) IN (LOWER($1), LOWER($2))
           AND LOWER(department) = 'supervisor'
         ORDER BY id LIMIT 1`,
        ["Ruhulla Shaik", MOBILE_DEV_USERNAME]
      )
    ).rows[0];

    if (!employee) {
      const created = await mastersService.upsertEmployee({
        employeeName: "Ruhulla Shaik",
        department: "Supervisor",
        role: "Supervisor",
        phoneNumber: "9848417474",
        salary: 0,
        status: "Active",
      });
      employee = { id: created.id, employee_name: created.employeeName, role: created.role, department: created.department };
    }

    const inserted = await query(
      `INSERT INTO mobile_supervisor_accounts (employee_id, username, password_hash, status)
       VALUES ($1, $2, $3, 'Active')
       ON CONFLICT (username) DO UPDATE SET updated_at = NOW()
       RETURNING id, username, employee_id`,
      [employee.id, MOBILE_DEV_USERNAME, hashPassword(MOBILE_DEV_PASSWORD)]
    );

    return {
      accountId: String(inserted.rows[0].id),
      employeeId: Number(employee.id),
      employeeName: String(employee.employee_name ?? "Ruhulla Shaik"),
      username: MOBILE_DEV_USERNAME,
      role: String(employee.role ?? "Supervisor"),
      department: String(employee.department ?? "Supervisor"),
    };
  },

  async login(username: string, password: string) {
    try {
      await this.ensureDevAccount();
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "42P01") {
        throw new AppError(
          503,
          "Mobile auth tables are missing. Run `npm run db:migrate` in the backend folder."
        );
      }
      throw error;
    }
    const name = username.trim();
    if (!name || !password) {
      throw new AppError(400, "Username and password are required.");
    }

    const found = await query(`${ACCOUNT_SELECT} WHERE LOWER(a.username) = LOWER($1)`, [name]);
    if (!found.rowCount) {
      throw new AppError(401, "Invalid supervisor username or password.");
    }
    const row = found.rows[0];
    if (String(row.account_status) !== "Active" || String(row.employee_status) !== "Active") {
      throw new AppError(403, "This supervisor account is not active.");
    }
    if (!verifyPassword(password, String(row.password_hash))) {
      throw new AppError(401, "Invalid supervisor username or password.");
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await query(
      `INSERT INTO mobile_supervisor_sessions (id, account_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [randomUUID(), row.account_id, hashToken(token), expiresAt.toISOString()]
    );

    return {
      token,
      expiresAt: expiresAt.toISOString(),
      supervisor: profileFromRow(row),
    };
  },

  async authenticate(bearer: string | undefined): Promise<MobileAuthContext> {
    if (!bearer?.startsWith("Bearer ")) {
      throw new AppError(401, "Your mobile session has expired.");
    }
    const token = bearer.slice("Bearer ".length).trim();
    if (!token) throw new AppError(401, "Your mobile session has expired.");

    const tokenHash = hashToken(token);
    const found = await query(
      `${ACCOUNT_SELECT}
       JOIN mobile_supervisor_sessions s ON s.account_id = a.id
       WHERE s.token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW()`,
      [tokenHash]
    );
    if (!found.rowCount) {
      throw new AppError(401, "Your mobile session has expired.");
    }
    const row = found.rows[0];
    if (String(row.account_status) !== "Active" || String(row.employee_status) !== "Active") {
      throw new AppError(403, "This supervisor account is not active.");
    }
    return {
      accountId: Number(row.account_id),
      employeeId: Number(row.employee_id),
      username: String(row.username),
      tokenHash,
      profile: profileFromRow(row),
    };
  },

  async logout(tokenHash: string) {
    await query(
      `UPDATE mobile_supervisor_sessions SET revoked_at = NOW()
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash]
    );
  },

  async me(auth: MobileAuthContext) {
    const session = await query(
      `SELECT expires_at FROM mobile_supervisor_sessions
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [auth.tokenHash]
    );
    return {
      supervisor: auth.profile,
      expiresAt: session.rows[0]
        ? new Date(session.rows[0].expires_at).toISOString()
        : new Date().toISOString(),
    };
  },
};
