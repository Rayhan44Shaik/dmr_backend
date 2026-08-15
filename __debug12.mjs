import { startApp, postJson } from "./tests/helpers/app.js";
import { applySchema, startTestDb } from "./tests/helpers/testDb.js";
const testDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app = await startApp({ DATABASE_URL: testDb.url });
const r = await postJson(app.baseUrl, "/api/masters/farms", {
  farmName: `Farm 100`, ownerName: `Owner 100`, supervisorName: `Supervisor 100`,
  phoneNumber: `9777700100`, village: "Village", address: "Address", capacity: 20000, status: "Active",
});
console.log("FARM:", JSON.stringify(r));

const r2 = await postJson(app.baseUrl, "/api/masters/employees", {
  employeeName: `Employee 100`, department: "Fleet", role: "Driver",
  phoneNumber: `9888800100`, email: `emp100@example.com`, address: "Address",
  joiningDate: "2025-01-10", aadharNumber: `123456789100`, licenseNumber: `L100`,
  salary: 25000, status: "Active",
});
console.log("EMPLOYEE:", JSON.stringify(r2));

await app.close();
await testDb.close();
process.exit(0);
