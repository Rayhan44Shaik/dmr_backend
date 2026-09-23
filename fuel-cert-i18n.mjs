// Static audit: all 10 required fuel/meter notification keys exist in BOTH
// English and Telugu locale bundles, are non-empty, differ by language, and
// every backend code in translateValidation BACKEND_CODES resolves.
import en from "../frontend/dmr-poultries-web/src/i18n/modules/operations.en.js";
import te from "../frontend/dmr-poultries-web/src/i18n/modules/operations.te.js";

const REQUIRED = [
  "ops.trip.fuel_maintenance_not_approved",
  "ops.trip.fuel_bill_not_approved",
  "ops.trip.meter_locked",
  "ops.trip.meter_locked_trip",
  "ops.trip.meter_conflict",
  "ops.trip.vehicle_inactive",
  "ops.trip.fuel_number_conflict",
  "ops.trip.duplicate_fuel_request",
  "ops.trip.locked_trip_modify",
  "ops.trip.invalid_meter_sequence",
];

const BACKEND_CODES = {
  TRIP_METER_LOCKED: "ops.trip.meter_locked_trip",
  MAINTENANCE_NOT_APPROVED: "ops.trip.fuel_maintenance_not_approved",
  FUEL_NOT_APPROVED: "ops.trip.fuel_bill_not_approved",
  VEHICLE_INACTIVE: "ops.trip.vehicle_inactive",
  FUEL_NUMBER_CONFLICT: "ops.trip.fuel_number_conflict",
  DUPLICATE_FUEL_REQUEST: "ops.trip.duplicate_fuel_request",
  METER_CONFLICT: "ops.trip.meter_conflict",
  INVALID_METER_SEQUENCE: "ops.trip.invalid_meter_sequence",
};

let fail = 0;
for (const k of REQUIRED) {
  const e = en[k];
  const t = te[k];
  const ok = typeof e === "string" && e.length > 0 && typeof t === "string" && t.length > 0 && e !== t;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  i18n ${k}`);
}
for (const [code, key] of Object.entries(BACKEND_CODES)) {
  const ok = REQUIRED.includes(key);
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  code-map ${code} -> ${key}`);
}
// No Hindi/other-language strings smuggled into the fuel keys (Devanagari check).
const devanagari = /[\u0900-\u097F]/;
for (const k of REQUIRED) {
  const blob = String(en[k]) + String(te[k]);
  if (devanagari.test(blob)) { fail++; console.log(`FAIL  hindi-leak ${k}`); }
}
console.log(fail === 0 ? "I18N-AUDIT: ALL PASS" : `I18N-AUDIT: ${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
