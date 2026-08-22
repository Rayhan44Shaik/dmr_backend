import { startTestDb, applySchema } from "./helpers/testDb.js";
const testDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");
const { staffService } = await import("../src/services/staffService.js");
try {
  const e = await mastersService.upsertEmployee({ employeeName: "Diag X", department: "Operations", role: "Worker", phoneNumber: "9800112233", salary: 15000, status: "Active" });
  const empId = e.id as number;
  const l = await staffService.createLeave({ employeeId: empId, type: "Casual", fromDate: "2026-08-20", toDate: "2026-08-22", reason: "x" });
  console.log("created id:", l.id, "days:", l.days);
  const u = await staffService.updateLeaveStatus(l.id, "Approved", { approvedBy: "Admin" });
  console.log("updated:", u.status, "id:", u.id, "empNo:", u.employeeNo, "dept:", u.department);
} catch (err) {
  console.error("DIAG ERROR:", err);
}
await pool.end();
await testDb.close();
