import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
import { hashPassword } from "../utils/passwordHash.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "../..");
dotenv.config({ path: path.join(backendRoot, ".env") });

const protectedUrl = new URL(process.env.DATABASE_URL ?? "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries");
const e2eUrl = new URL(process.env.E2E_DATABASE_URL ?? protectedUrl.toString());
if (!process.env.E2E_DATABASE_URL) e2eUrl.pathname = "/dmr_poultries_e2e";
const databaseName = decodeURIComponent(e2eUrl.pathname.slice(1));
const protectedName = decodeURIComponent(protectedUrl.pathname.slice(1));

if (e2eUrl.toString() === protectedUrl.toString() || databaseName === protectedName || databaseName === "dmr_poultries" || !/_e2e$/i.test(databaseName)) {
  throw new Error(`REFUSING E2E setup for protected/non-E2E database "${databaseName}". The name must end in _e2e and differ from "${protectedName}".`);
}

const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
const localEnvPath = path.join(backendRoot, ".env.e2e.local");
const existing = fs.existsSync(localEnvPath) ? dotenv.parse(fs.readFileSync(localEnvPath)) : {};
const secret = (name: string) => existing[name] || crypto.randomBytes(24).toString("base64url");
const credentials = {
  E2E_OWNER_USERNAME: existing.E2E_OWNER_USERNAME || "owner-e2e",
  E2E_OWNER_PASSWORD: secret("E2E_OWNER_PASSWORD"),
  E2E_SUPERVISOR_A_USERNAME: existing.E2E_SUPERVISOR_A_USERNAME || "supervisor-a-e2e",
  E2E_SUPERVISOR_A_PASSWORD: secret("E2E_SUPERVISOR_A_PASSWORD"),
  E2E_SUPERVISOR_B_USERNAME: existing.E2E_SUPERVISOR_B_USERNAME || "supervisor-b-e2e",
  E2E_SUPERVISOR_B_PASSWORD: secret("E2E_SUPERVISOR_B_PASSWORD"),
  E2E_SENIOR_USERNAME: existing.E2E_SENIOR_USERNAME || "senior-account-e2e",
  E2E_SENIOR_PASSWORD: secret("E2E_SENIOR_PASSWORD"),
};

async function main() {
  const adminUrl = new URL(e2eUrl); adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    if (process.argv.includes("--reset")) {
      await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()`, [databaseName]);
      await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
    }
    const found = await admin.query(`SELECT 1 FROM pg_database WHERE datname=$1`, [databaseName]);
    if (!found.rowCount) await admin.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  } finally { await admin.end(); }

  const db = new pg.Client({ connectionString: e2eUrl.toString() });
  await db.connect();
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (id SERIAL PRIMARY KEY,filename TEXT NOT NULL UNIQUE,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    for (const filename of fs.readdirSync(path.join(backendRoot, "sql")).filter((f) => f.endsWith(".sql")).sort()) {
      const done = await db.query(`SELECT 1 FROM schema_migrations WHERE filename=$1`, [filename]);
      if (done.rowCount) continue;
      await db.query("BEGIN");
      try {
        await db.query(fs.readFileSync(path.join(backendRoot, "sql", filename), "utf8"));
        await db.query(`INSERT INTO schema_migrations(filename) VALUES($1)`, [filename]);
        await db.query("COMMIT");
      } catch (error) { await db.query("ROLLBACK"); throw error; }
    }

    const employeeRows = [
      [990001,"E2E Supervisor A","Operations","Supervisor"], [990002,"E2E Supervisor B","Operations","Supervisor"],
      [990003,"E2E Driver One","Operations","Driver"], [990004,"E2E Helper One","Operations","Helper"],
      [990005,"E2E Loader One","Operations","Loader"], [990006,"E2E Driver Two","Operations","Driver"],
      [990007,"E2E Helper Two","Operations","Helper"], [990008,"E2E Loader Two","Operations","Loader"],
    ];
    for (const row of employeeRows) await db.query(`INSERT INTO employees(employee_no,employee_name,department,role,phone_number,status) VALUES($1,$2,$3,$4,$5,'Active') ON CONFLICT(employee_no) DO UPDATE SET employee_name=EXCLUDED.employee_name,status='Active'`, [...row, `9000${row[0]}`.slice(-10)]);
    const employees = await db.query(`SELECT id,employee_no FROM employees WHERE employee_no BETWEEN 990001 AND 990008`);
    const employeeId = (no: number) => Number(employees.rows.find((r) => r.employee_no === no)!.id);
    await db.query(`INSERT INTO vehicles(vehicle_no,vehicle_number,vehicle_type,no_of_boxes,bird_capacity,capacity_kg,status) VALUES(990001,'E2E-TRUCK-01','Truck',10,300,1000,'Active'),(990003,'E2E-TRUCK-03','Truck',10,300,1000,'Active') ON CONFLICT(vehicle_no) DO NOTHING`);
    await db.query(`INSERT INTO farms(farm_no,farm_name,owner_name,supervisor_name,phone_number,village,address,capacity,status) VALUES(990001,'E2E Source Farm','E2E Owner','E2E Supervisor','9000000001','E2E Village','E2E Farm Gate Road',10000,'Active') ON CONFLICT(farm_no) DO NOTHING`);
    await db.query(`INSERT INTO bird_types(bird_type_no,bird_type,average_weight,description,status) VALUES(990001,'E2E Broiler',2,'E2E fixture','Active') ON CONFLICT(bird_type_no) DO NOTHING`);
    for (let i=0;i<5;i++) await db.query(`INSERT INTO shops(shop_no,shop_name,owner_name,phone_number,village,address,status) VALUES($1,$2,'E2E Owner',$3,'E2E Village','E2E Address','Active') ON CONFLICT(shop_no) DO NOTHING`, [990001+i,["E2E Shop Alpha","E2E Shop Bravo","E2E Shop Charlie","E2E Shop Delta","E2E Shop Echo"][i],`900000001${i}`]);

    const accounts: Array<[string,string,string,string,number|null]> = [
      [credentials.E2E_OWNER_USERNAME,"Owner E2E",credentials.E2E_OWNER_PASSWORD,"OWNER",null],
      [credentials.E2E_SUPERVISOR_A_USERNAME,"E2E Supervisor A",credentials.E2E_SUPERVISOR_A_PASSWORD,"SUPERVISOR",employeeId(990001)],
      [credentials.E2E_SUPERVISOR_B_USERNAME,"E2E Supervisor B",credentials.E2E_SUPERVISOR_B_PASSWORD,"SUPERVISOR",employeeId(990002)],
      [credentials.E2E_SENIOR_USERNAME,"Full Access E2E",credentials.E2E_SENIOR_PASSWORD,"FULL_ACCESS",null],
    ];
    for (const [username,name,password,role,empId] of accounts) await db.query(`INSERT INTO application_users(username,display_name,password_hash,role,employee_id,active) VALUES($1,$2,$3,$4,$5,TRUE) ON CONFLICT((LOWER(username))) DO UPDATE SET display_name=EXCLUDED.display_name,password_hash=EXCLUDED.password_hash,role=EXCLUDED.role,employee_id=EXCLUDED.employee_id,active=TRUE`, [username,name,await hashPassword(password),role,empId]);
    await db.query(`INSERT INTO trips(trip_no,trip_date,status,supervisor_id,supervisor_name) VALUES('E2E-SUPERVISOR-B-TRIP',CURRENT_DATE,'Draft',$1,'E2E Supervisor B') ON CONFLICT(trip_no) DO NOTHING`, [employeeId(990002)]);

    const verify = await db.query(`SELECT to_regclass('public.application_users') users,to_regclass('public.application_sessions') sessions,EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='trips' AND column_name='created_by_user_id') audit`);
    if (!verify.rows[0].users || !verify.rows[0].sessions || !verify.rows[0].audit) throw new Error("E2E identity schema verification failed");
  } finally { await db.end(); }

  const values = { E2E_DATABASE_URL: e2eUrl.toString(), ...credentials };
  fs.writeFileSync(localEnvPath, Object.entries(values).map(([k,v]) => `${k}=${v}`).join("\n")+"\n", { mode: 0o600 });
  console.log(`E2E database ready: ${databaseName}; migrations and fixtures verified. Credentials saved to ignored backend/.env.e2e.local.`);
}
main().catch((error)=>{ console.error(error instanceof Error ? error.message : error); process.exitCode=1; });
