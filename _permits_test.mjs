// LIVE end-to-end verification of Fleet → Permits (vehicle permit documents)
// against real PostgreSQL. Backend must be running on :4000 (tsx watch).
// Covers upsert (one-per-type), optional scans, validation, remove, list, summary.
import pg from "pg";

const API = "http://localhost:4000/api";
const pool = new pg.Pool({
  connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries",
});
const db = (sql, params = []) => pool.query(sql, params);

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${extra}`); }
};

// ---- File fixtures (in-memory, never written to disk) ----
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
]);
const JPG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
const PDF = Buffer.from("%PDF-1.4\n% dummy pdf body\n%%EOF\n");
const TXT = Buffer.from("this is definitely not a supported image/pdf file");
const BIG = Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)]); // 10 MB + PNG magic

const jsonApi = async (method, path, body) => {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
};

const putPermit = async (vehicleId, docType, body) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(body)) {
    if (v == null || v === "") continue;
    form.append(k, String(v));
  }
  const res = await fetch(API + `/fleet/permits/${vehicleId}/${docType}`, { method: "PUT", body: form });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
};

const putPermitWithFile = async (vehicleId, docType, body, file) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(body)) {
    if (v == null || v === "") continue;
    form.append(k, String(v));
  }
  form.append("document", new Blob([file.buffer], { type: file.mime }), file.name);
  const res = await fetch(API + `/fleet/permits/${vehicleId}/${docType}`, { method: "PUT", body: form });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
};

const stamp = Date.now().toString().slice(-6);
const VEH_NO = `PRMT-${stamp}`;
let vehId = null;

try {
  // ---- Fixtures: one dedicated vehicle ----
  const vMax = (await db(`SELECT COALESCE(MAX(vehicle_no),0)::int m FROM vehicles`)).rows[0].m;
  const veh = await db(
    `INSERT INTO vehicles (vehicle_no, vehicle_number, vehicle_type, status, no_of_boxes, bird_capacity, capacity_kg)
     VALUES ($1,$2,'Truck','Active',85,1000,5000) RETURNING id, vehicle_number`,
    [vMax + 1, VEH_NO]
  );
  vehId = veh.rows[0].id;
  console.log(`fixtures vehId=${vehId} veh=${VEH_NO}`);

  const BASE = {
    documentNumber: "INS-2026-001",
    validFrom: "2026-01-01",
    expiryDate: "2026-12-31",
    remarks: "permit-e2e",
    createdBy: "permit-test",
  };

  const countRows = async () =>
    (await db(`SELECT COUNT(*)::int c FROM vehicle_permit_documents WHERE vehicle_id = $1`, [vehId])).rows[0].c;

  // ============ 1. Create without a file (optional uploads) ============
  console.log("\n=== 1. Upsert create without scan ===");
  const t1 = await putPermit(vehId, "insurance", BASE);
  check("1.1 200 created", t1.status === 200, `got ${t1.status} ${JSON.stringify(t1.data)}`);
  check("1.2 record shape", t1.data?.id && t1.data.docType === "insurance", JSON.stringify(t1.data));
  check("1.3 expiryDate echoed", t1.data?.expiryDate === "2026-12-31", `got ${t1.data?.expiryDate}`);
  check("1.4 vehicleNo from master", t1.data?.vehicleNo === VEH_NO, `got ${t1.data?.vehicleNo}`);
  check("1.5 hasDocument false (no scan)", t1.data?.hasDocument === false, JSON.stringify(t1.data));
  check("1.6 one row in DB", (await countRows()) === 1);
  const insId = t1.data?.id;

  // ============ 2. Same type again → same row, updated ============
  console.log("\n=== 2. Upsert same type updates in place ===");
  const t2 = await putPermit(vehId, "insurance", { ...BASE, expiryDate: "2027-06-30" });
  check("2.1 200 updated", t2.status === 200, `got ${t2.status}`);
  check("2.2 same id (one per type)", t2.data?.id === insId, `expected ${insId} got ${t2.data?.id}`);
  check("2.3 expiryDate updated", t2.data?.expiryDate === "2027-06-30", `got ${t2.data?.expiryDate}`);
  check("2.4 still one row in DB", (await countRows()) === 1);

  // ============ 3. Create with an optional PNG scan (multipart) ============
  console.log("\n=== 3. Upsert with scan ===");
  const t3 = await putPermitWithFile(vehId, "permit", { ...BASE, expiryDate: "2026-09-30" }, { name: "permit.png", mime: "image/png", buffer: PNG });
  check("3.1 200 created", t3.status === 200, `got ${t3.status} ${JSON.stringify(t3.data)}`);
  check("3.2 hasDocument true", t3.data?.hasDocument === true, JSON.stringify(t3.data));
  check("3.3 file meta present", t3.data?.fileName === "permit.png" && t3.data?.mimeType === "image/png" && typeof t3.data?.fileSize === "number", JSON.stringify(t3.data));
  check("3.4 two rows in DB", (await countRows()) === 2);

  // ============ 4. Document binary endpoint ============
  console.log("\n=== 4. Scan binary endpoint ===");
  const t4 = await fetch(API + `/fleet/permits/${vehId}/permit/document`);
  const t4buf = Buffer.from(await t4.arrayBuffer());
  check("4.1 200 + content-type", t4.status === 200 && t4.headers.get("content-type") === "image/png", `status=${t4.status} ct=${t4.headers.get("content-type")}`);
  check("4.2 bytes match", t4buf.equals(PNG));
  check("4.3 content-disposition inline", String(t4.headers.get("content-disposition")).startsWith("inline"));

  // ============ 5. Replace scan on update ============
  console.log("\n=== 5. Replacing scan via update ===");
  const t5 = await putPermitWithFile(vehId, "permit", { expiryDate: "2026-09-30" }, { name: "permit.pdf", mime: "application/pdf", buffer: PDF });
  check("5.1 200 updated", t5.status === 200, `got ${t5.status}`);
  check("5.2 same id", t5.data?.id === t3.data?.id, `expected ${t3.data?.id} got ${t5.data?.id}`);
  check("5.3 mime updated to pdf", t5.data?.mimeType === "application/pdf" && t5.data?.fileName === "permit.pdf", JSON.stringify({ m: t5.data?.mimeType, f: t5.data?.fileName }));
  const t5b = await fetch(API + `/fleet/permits/${vehId}/permit/document`);
  check("5.4 binary now PDF", t5b.status === 200 && Buffer.from(await t5b.arrayBuffer()).equals(PDF));

  // ============ 6. removeDocument clears the scan ============
  console.log("\n=== 6. removeDocument clears scan ===");
  const t6 = await putPermit(vehId, "permit", { expiryDate: "2026-09-30", removeDocument: "true" });
  check("6.1 200", t6.status === 200, `got ${t6.status}`);
  check("6.2 hasDocument false after removal", t6.data?.hasDocument === false, JSON.stringify(t6.data));
  const t6b = await fetch(API + `/fleet/permits/${vehId}/permit/document`);
  check("6.3 binary endpoint now 404", t6b.status === 404, `got ${t6b.status}`);
  check("6.4 record still exists", (await db(`SELECT COUNT(*)::int c FROM vehicle_permit_documents WHERE vehicle_id=$1 AND doc_type='permit'`, [vehId])).rows[0].c === 1);

  // ============ 7. All five types can coexist ============
  console.log("\n=== 7. Five types on one vehicle ===");
  for (const [type, no] of [["fitness", "FIT-01"], ["puc", "PUC-01"], ["rc", "RC-01"]] ) {
    const r = await putPermit(vehId, type, { documentNumber: no, expiryDate: "2027-01-31" });
    check(`7.${type} created`, r.status === 200 && r.data?.docType === type, `got ${r.status} ${JSON.stringify(r.data)}`);
  }
  check("7.5 five rows total", (await countRows()) === 5, `got ${await countRows()}`);

  // ============ 8. Validation: invalid docType ============
  console.log("\n=== 8. Invalid docType rejected ===");
  const t8 = await putPermit(vehId, "road-tax", { expiryDate: "2026-12-31" });
  check("8.1 400", t8.status === 400, `got ${t8.status} ${JSON.stringify(t8.data)}`);
  check("8.2 clear message", String(t8.data?.error).includes("Invalid document type"), JSON.stringify(t8.data));
  check("8.3 no row created", (await countRows()) === 5);

  // ============ 9. Validation: invalid vehicle ============
  console.log("\n=== 9. Invalid vehicle rejected ===");
  const t9 = await putPermit(999999, "permit", { expiryDate: "2026-12-31" });
  check("9.1 4xx", t9.status >= 400 && t9.status < 500, `got ${t9.status} ${JSON.stringify(t9.data)}`);
  const t9rows = (await db(`SELECT COUNT(*)::int c FROM vehicle_permit_documents WHERE vehicle_id = 999999`)).rows[0].c;
  check("9.2 no rows", t9rows === 0, `got ${t9rows}`);

  // ============ 10. Validation: expiryDate required ============
  console.log("\n=== 10. Missing expiryDate rejected ===");
  const t10 = await putPermit(vehId, "fitness", { documentNumber: "FIT-02" });
  check("10.1 4xx", t10.status >= 400 && t10.status < 500, `got ${t10.status} ${JSON.stringify(t10.data)}`);
  check("10.2 expiryDate field error", Boolean(t10.data?.details?.fieldErrors?.expiryDate), JSON.stringify(t10.data));

  // ============ 11. Unsupported file rejected ============
  console.log("\n=== 11. Unsupported file type rejected ===");
  const t11 = await putPermitWithFile(vehId, "puc", { expiryDate: "2027-01-31" }, { name: "note.txt", mime: "text/plain", buffer: TXT });
  check("11.1 400", t11.status === 400, `got ${t11.status} ${JSON.stringify(t11.data)}`);
  check("11.2 message", String(t11.data?.error).includes("Only PNG, JPG/JPEG, and PDF"), JSON.stringify(t11.data));

  // ============ 12. Oversized file rejected ============
  console.log("\n=== 12. File > 10 MB rejected ===");
  const t12 = await putPermitWithFile(vehId, "puc", { expiryDate: "2027-01-31" }, { name: "huge.png", mime: "image/png", buffer: BIG });
  check("12.1 400", t12.status === 400, `got ${t12.status} ${JSON.stringify(t12.data)}`);
  check("12.2 message", String(t12.data?.error).includes("10 MB"), JSON.stringify(t12.data));

  // ============ 13. List returns everything with vehicle numbers ============
  console.log("\n=== 13. List all ===");
  const t13 = await jsonApi("GET", "/fleet/permits");
  check("13.1 200", t13.status === 200, `got ${t13.status}`);
  const mine = Array.isArray(t13.data) ? t13.data.filter((r) => r.vehicleId === vehId) : [];
  check("13.2 five records for fixture vehicle", mine.length === 5, `got ${mine.length}`);
  check("13.3 vehicleNo resolved", mine.every((r) => r.vehicleNo === VEH_NO), JSON.stringify(mine.map((r) => r.vehicleNo)));
  check("13.4 no binary in list", !JSON.stringify(mine).includes("base64"), "");
  check("13.5 insurance expiry reflects latest update", mine.find((r) => r.docType === "insurance")?.expiryDate === "2027-06-30", JSON.stringify(mine));

  // ============ 14. Summary counts ============
  console.log("\n=== 14. Summary ===");
  const t14 = await jsonApi("GET", "/fleet/permits/summary");
  check("14.1 200", t14.status === 200, `got ${t14.status}`);
  const s = t14.data?.byType ?? {};
  check("14.2 total matches fixture count", t14.data?.total >= 5, `got ${t14.data?.total}`);
  check("14.3 per-type buckets present", Object.keys(s).length === 5, JSON.stringify(Object.keys(s)));
  check("14.4 insurance safe (2027 expiry)", s.insurance?.safe >= 1, JSON.stringify(s.insurance));
  check("14.5 permit record counted", (s.permit?.total ?? 0) >= 1, JSON.stringify(s.permit));

  // ============ 15. Delete removes the record ============
  console.log("\n=== 15. Delete ===");
  const t15 = await jsonApi("DELETE", `/fleet/permits/${vehId}/rc`);
  check("15.1 delete 200", t15.status === 200 && t15.data?.docType === "rc", `got ${t15.status} ${JSON.stringify(t15.data)}`);
  check("15.2 four rows remain", (await countRows()) === 4);
  const t15b = await jsonApi("DELETE", `/fleet/permits/${vehId}/rc`);
  check("15.3 deleting again → 404", t15b.status === 404, `got ${t15b.status}`);

  // ============ 16. GET binary for missing record → 404 ============
  console.log("\n=== 16. Missing binary 404 ===");
  const t16 = await fetch(API + `/fleet/permits/${vehId}/fitness/document`);
  check("16.1 404 (no scan on fitness)", t16.status === 404, `got ${t16.status}`);

  console.log(`\n======================================`);
  console.log(`PERMIT TESTS RESULT: ${pass} passed, ${fail} failed`);
  console.log(`======================================`);
} catch (err) {
  console.error("TEST RUNNER ERROR:", err);
} finally {
  try {
    if (vehId != null) await db(`DELETE FROM vehicles WHERE id = $1`, [vehId]);
    await pool.end();
  } catch (e) {
    console.error("Cleanup error:", e.message);
  }
  if (fail > 0) process.exit(1);
}
