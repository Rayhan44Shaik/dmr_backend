import fs from "node:fs";

// Temporarily removes the two `excludeTripId: tripId,` lines in the diesel
// upsert/update paths so the 5 unrelated failures can be baselined WITHOUT
// the fuel fix. Restore with: Copy-Item backup over the file (see cert log).
const FILE = "src/services/tripsService.ts";
const MARK = "          excludeTripId: tripId,";

const lines = fs.readFileSync(FILE, "utf8").split("\n");
const idx = [];
lines.forEach((l, i) => { if (l === MARK) idx.push(i); });
const targets = idx.filter((i) => lines[i].startsWith("          ") && !lines[i].startsWith("           "));
if (targets.length !== 2) throw new Error("expected 2 diesel sites, found " + targets.length);
targets.sort((a, b) => b - a).forEach((i) => lines.splice(i, 1));
fs.writeFileSync(FILE, lines.join("\n"));
console.log("STRIPPED 2 lines; remaining=" + (lines.join("\n").match(/excludeTripId: tripId/g) || []).length);
