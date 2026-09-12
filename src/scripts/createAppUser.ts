import { pool } from "../config/db.js";
import { hashPassword } from "../utils/passwordHash.js";
async function readStdin(): Promise<string> { const chunks: Buffer[]=[]; for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks).toString("utf8").trimEnd(); }
async function run() {
  const [username, displayName, role, employeeArg] = process.argv.slice(2);
  if (!username || !displayName || !["OWNER","SENIOR_ACCOUNT","SUPERVISOR"].includes(role ?? "")) throw new Error("Usage: npm run account:create -- <username> <display-name> <OWNER|SENIOR_ACCOUNT|SUPERVISOR> [employee-id] (password via stdin)");
  const employeeId=employeeArg?Number(employeeArg):null;
  if (role === "SUPERVISOR" && (!Number.isSafeInteger(employeeId)||Number(employeeId)<=0)) throw new Error("SUPERVISOR accounts require an employee id.");
  const passwordHash=await hashPassword(await readStdin());
  await pool.query(`INSERT INTO application_users (username,display_name,password_hash,role,employee_id) VALUES ($1,$2,$3,$4,$5)`,[username.trim(),displayName.trim(),passwordHash,role,employeeId]);
  console.log(`Created application account ${username.trim()} (${role}).`);
}
run().catch((error)=>{console.error(error instanceof Error?error.message:"Account creation failed");process.exitCode=1;}).finally(()=>pool.end());
