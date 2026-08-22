import fs from "fs";
const s = fs.readFileSync("src/services/tripsService.ts", "utf8");
const lines = s.split(/\r?\n/);
console.log("LINES:", lines.length);
const keys = ["This block inserts two trips", "tripNoCandidates", "savingsAccount", "generateTripNoPrefix", "mapTripBase", "rowsToTrips", "async function generateTripNo", "export const tripsService", "// comment", "const existing = await client.query", "✅ createDraft inserted trip", "await pool.end()"];
for (const k of keys) {
  const c = s.split(k).length - 1;
  if (c > 0) console.log(k, "=>", c);
}
console.log("--- lines 859-869 ---");
for (let i = 858; i < 870; i++) console.log((i + 1) + ": " + lines[i]);
console.log("--- line 301 ---");
console.log("302: " + lines[301]);