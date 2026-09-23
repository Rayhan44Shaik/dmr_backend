import fs from "node:fs";

const t = fs.readFileSync(process.argv[2] || "fuel-cert-fullsuite.txt", "utf8");
const L = t.split(/\r?\n/);
const counts = L.filter((l) => /pass \d+|fail \d+|cancelled \d+/.test(l)).slice(-6);
console.log("COUNTS:" + JSON.stringify(counts));
let inf = false;
for (let i = 0; i < L.length; i++) {
  if (L[i].includes("failing tests")) { inf = true; continue; }
  if (inf && /^test at /.test(L[i].trim())) {
    console.log(L[i].trim());
    console.log("   TITLE:" + (L[i + 1] || "").trim().slice(0, 100));
    const errLine = L.slice(i + 1, i + 6).find((l) => /AssertionError|Error:/.test(l));
    console.log("   ERR:" + (errLine || "").trim().slice(0, 220));
  }
}
