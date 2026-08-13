import fs from "fs";
const s = fs.readFileSync("src/services/tripsService.ts", "utf8");
const lines = s.split(/\r?\n/);

console.log("grep 'body.tripNo' count:", s.split("body.tripNo").length - 1);
console.log("grep 'generateTripNo(' count:", s.split("generateTripNo(").length - 1);
console.log("grep 'async function generateTripNo' count:", s.split("async function generateTripNo").length - 1);
console.log("grep 'INSERT INTO trips (' count:", s.split("INSERT INTO trips (").length - 1);

// locate the createDraft INSERT region and save() create INSERT region
const idxCreateDraft = s.indexOf("createDraft:");
const idxSaveAsync = s.indexOf("save: async");
console.log("--- createDraft section (createDraft: + ~45 lines) ---");
const cdLines = s.slice(idxCreateDraft).split("\n").slice(0, 45);
cdLines.forEach((l, i) => console.log(String(i + 1).padStart(3) + ": " + l.replace(/\s+$/, "")));

console.log("--- save: async create-branch (save: async + ~80 lines) ---");
const svLines = s.slice(idxSaveAsync).split("\n").slice(0, 80);
svLines.forEach((l, i) => console.log(String(i + 1).padStart(3) + ": " + l.replace(/\s+$/, "")));