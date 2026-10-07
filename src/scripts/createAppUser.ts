import { pool } from "../config/db.js";
import { hashPassword } from "../utils/passwordHash.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8").trimEnd();
}

async function run() {
  const args = process.argv.slice(2);
  const update = args.includes("--update");
  const positional = args.filter((arg) => arg !== "--update");
  const [username, displayName, role, employeeArg] = positional;

  if (!username || !displayName || !["OWNER", "FULL_ACCESS", "SUPERVISOR"].includes(role ?? "")) {
    throw new Error(
      "Usage: npm run account:create -- [--update] <username> <display-name> <OWNER|FULL_ACCESS|SUPERVISOR> [employee-id] (password via stdin)"
    );
  }

  const employeeId = employeeArg ? Number(employeeArg) : null;
  if (role === "SUPERVISOR" && (!Number.isSafeInteger(employeeId) || Number(employeeId) <= 0)) {
    throw new Error("SUPERVISOR accounts require an employee id.");
  }
  if (role !== "SUPERVISOR" && employeeId != null) {
    throw new Error(`${role} accounts must not be linked to an employee id.`);
  }

  if (role === "SUPERVISOR") {
    const employee = await pool.query(
      `SELECT id, employee_name, status::text AS status
       FROM employees
       WHERE id = $1`,
      [employeeId]
    );
    if (!employee.rowCount) throw new Error(`Employee id ${employeeId} was not found.`);
    if (String(employee.rows[0].status).toLowerCase() !== "active") {
      throw new Error(`Employee id ${employeeId} is not Active.`);
    }
  }

  const passwordHash = await hashPassword(await readStdin());
  const existing = await pool.query(
    `SELECT id, role FROM application_users WHERE LOWER(username) = LOWER($1)`,
    [username.trim()]
  );

  if (existing.rowCount && !update) {
    throw new Error(
      `Application account '${username.trim()}' already exists. Re-run with --update to refresh credentials.`
    );
  }

  if (existing.rowCount) {
    await pool.query(
      `UPDATE application_users
       SET display_name = $2,
           password_hash = $3,
           role = $4,
           employee_id = $5,
           active = TRUE,
           updated_at = NOW()
       WHERE id = $1`,
      [existing.rows[0].id, displayName.trim(), passwordHash, role, employeeId]
    );
    console.log(`Updated application account ${username.trim()} (${role}).`);
    return;
  }

  await pool.query(
    `INSERT INTO application_users (username, display_name, password_hash, role, employee_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [username.trim(), displayName.trim(), passwordHash, role, employeeId]
  );
  console.log(`Created application account ${username.trim()} (${role}).`);
}

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Account creation failed");
    process.exitCode = 1;
  })
  .finally(() => pool.end());
