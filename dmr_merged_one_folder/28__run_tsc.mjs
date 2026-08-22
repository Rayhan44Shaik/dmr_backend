import { execSync } from "child_process";
import fs from "fs";
try {
  const out = execSync("npx tsc --noEmit", { cwd: process.cwd(), encoding: "utf8", timeout: 180000 });
  console.log("TSC EXIT: 0 (passed)");
  console.log("OUTPUT BYTES:", Buffer.byteLength(out));
  fs.writeFileSync("_tsc_out.txt", out || "(empty)");
} catch (e) {
  const out = String(e.stdout ?? "");
  const err = String(e.stderr ?? "");
  console.log("TSC EXIT: nonzero");
  console.log("STDOUT BYTES:", Buffer.byteLength(out));
  console.log("STDERR BYTES:", Buffer.byteLength(err));
  fs.writeFileSync("_tsc_out.txt", out || err || "(none)");
  console.log("FIRST 200 CHARS OF OUTPUT:", (out || err).slice(0, 200).replace(/\r?\n/g, " | "));
}
// count errors
const raw = fs.existsSync("_tsc_out.txt") ? fs.readFileSync("_tsc_out.txt", "utf8") : "";
const errLines = raw.split(/\r?\n/).filter((l) => l.includes("error TS"));
console.log("ERROR LINES:", errLines.length);
const files = {};
for (const l of errLines) {
  const m = l.match(/^([^(\s]+)/);
  if (m) files[m[1]] = (files[m[1]] ?? 0) + 1;
}
console.log("ERRORS BY FILE:", JSON.stringify(files));
if (errLines.length > 0) console.log("SAMPLE ERRORS:\n" + errLines.slice(0, 15).join("\n"));