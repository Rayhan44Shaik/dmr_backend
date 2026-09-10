// LIVE end-to-end verification of Fleet maintenance bill / spare-part documents
// against real PostgreSQL. Backend must be running on :4000 (tsx watch).
// Covers TESTS 1-17 from the task plus the document endpoints.
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

// ---- Test file fixtures (in-memory, never written to disk) ----
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

const multipart = async (method, path, fields, files) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v == null || v === "") continue;
    if (k === "maintenanceType" || k === "parts" || k === "removeDocumentIds") {
      form.append(k, JSON.stringify(v));
    } else {
      form.append(k, String(v));
    }
  }
  for (const f of files) {
    form.append("documents", new Blob([f.buffer], { type: f.mime }), f.name);
  }
  const res = await fetch(API + path, { method, body: form });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
};

const stamp = Date.now().toString().slice(-6);
const TEST_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const createdMaintIds = [];
let vehId = null, drvId = null;

try {
  // ---- Fixtures ----
  const vMax = (await db(`SELECT COALESCE(MAX(vehicle_no),0)::int m FROM vehicles`)).rows[0].m;
  const eMax = (await db(`SELECT COALESCE(MAX(employee_no),0)::int m FROM employees`)).rows[0].m;
  const veh = await db(
    `INSERT INTO vehicles (vehicle_no, vehicle_number, vehicle_type, status, no_of_boxes, bird_capacity, capacity_kg)
     VALUES ($1,$2,'Truck','Active',85,1000,5000) RETURNING id, vehicle_number`,
    [vMax + 1, `DOCFIX-${stamp}`]
  );
  vehId = veh.rows[0].id;
  const vehNumber = veh.rows[0].vehicle_number;
  const drv = await db(
    `INSERT INTO employees (employee_no, employee_name, department, role, phone_number, email, status)
     VALUES ($1,$2,'Driver','Driver',$3,$4,'Active') RETURNING id, employee_name`,
    [eMax + 1, `DOCDrv${stamp}`, `9197${stamp}${Math.floor(100 + Math.random() * 900)}`, `docdrv${stamp}@fix.local`]
  );
  drvId = drv.rows[0].id;
  const drvName = drv.rows[0].employee_name;
  console.log(`fixtures vehId=${vehId} veh=${vehNumber} drvId=${drvId}`);

  const baseFields = {
    date: TEST_DATE,
    vehicleId: vehId,
    driverId: drvId,
    currentKM: 45230,
    nextServiceKM: 50000,
    maintenanceType: ["Engine Oil Change", "Oil Filter Replacement"],
    serviceType: "Oil Change",
    garage: "Doc Test Garage",
    mechanic: "Raju",
    parts: [
      { name: "Engine Oil", specification: "15W-40 5L", quantity: 2, rate: 1450 },
      { name: "Oil Filter", specification: "", quantity: 1, rate: 350, amount: 350 },
    ],
    remarks: "documents-e2e-test",
    createdBy: "doc-test",
  };

  const countMaintenance = async () =>
    (await db(`SELECT COUNT(*)::int c FROM fleet_maintenance WHERE vehicle_id = $1 AND maintenance_date = $2`, [vehId, TEST_DATE])).rows[0].c;
  const countDocs = async (id) =>
    (await db(`SELECT COUNT(*)::int c FROM fleet_maintenance_documents WHERE maintenance_id = $1`, [id])).rows[0].c;

  // ============ TEST 1: create without document → rejected ============
  console.log("\n=== TEST 1: Create maintenance without document ===");
  const before1 = await countMaintenance();
  const t1 = await multipart("POST", "/fleet/maintenance", baseFields, []);
  check("T1 400 rejected", t1.status === 400, `got ${t1.status} ${JSON.stringify(t1.data)}`);
  check("T1 error message", String(t1.data?.error).includes("Maintenance bill / spare-part document is required"), JSON.stringify(t1.data));
  check("T1 no maintenance row", (await countMaintenance()) === before1);

  // ============ TEST 2: create with one PNG ============
  console.log("\n=== TEST 2: Create maintenance with one PNG ===");
  const t2 = await multipart("POST", "/fleet/maintenance", baseFields, [
    { name: "bill.png", mime: "image/png", buffer: PNG },
  ]);
  check("T2 201 created", t2.status === 201, `got ${t2.status} ${JSON.stringify(t2.data?.error ?? t2.data)}`);
  if (t2.status === 201) createdMaintIds.push(t2.data.id);
  check("T2 maintenance row exists", (await db(`SELECT 1 FROM fleet_maintenance WHERE id = $1`, [t2.data?.id])).rowCount === 1);
  check("T2 document row exists", (await countDocs(t2.data?.id)) === 1);
  check("T2 doc metadata shape", Array.isArray(t2.data?.documents) && t2.data.documents[0]?.fileName === "bill.png" && t2.data.documents[0]?.mimeType === "image/png", JSON.stringify(t2.data?.documents));
  const t2Doc = t2.data?.documents?.[0];

  // ============ TEST 2b: create with one JPG ============
  console.log("\n=== TEST 2b: Create maintenance with one JPG ===");
  const t2b = await multipart("POST", "/fleet/maintenance", baseFields, [
    { name: "bill.jpg", mime: "image/jpeg", buffer: JPG },
  ]);
  check("T2b 201 created", t2b.status === 201, `got ${t2b.status} ${JSON.stringify(t2b.data?.error ?? t2b.data)}`);
  if (t2b.status === 201) createdMaintIds.push(t2b.data.id);
  check("T2b document row exists", (await countDocs(t2b.data?.id)) === 1);
  check("T2b jpeg metadata", Array.isArray(t2b.data?.documents) && t2b.data.documents[0]?.mimeType === "image/jpeg", JSON.stringify(t2b.data?.documents));

  // ============ TEST 2c: create with one PDF ============
  console.log("\n=== TEST 2c: Create maintenance with one PDF ===");
  const t2c = await multipart("POST", "/fleet/maintenance", baseFields, [
    { name: "bill.pdf", mime: "application/pdf", buffer: PDF },
  ]);
  check("T2c 201 created", t2c.status === 201, `got ${t2c.status} ${JSON.stringify(t2c.data?.error ?? t2c.data)}`);
  if (t2c.status === 201) createdMaintIds.push(t2c.data.id);
  check("T2c document row exists", (await countDocs(t2c.data?.id)) === 1);
  check("T2c pdf metadata", Array.isArray(t2c.data?.documents) && t2c.data.documents[0]?.mimeType === "application/pdf", JSON.stringify(t2c.data?.documents));

  // ============ TEST 3: create with PNG + PNG + PDF ============
  console.log("\n=== TEST 3: Create maintenance with PNG, PNG, PDF ===");
  const t3 = await multipart("POST", "/fleet/maintenance", baseFields, [
    { name: "a.png", mime: "image/png", buffer: PNG },
    { name: "b.png", mime: "image/png", buffer: PNG },
    { name: "bill.pdf", mime: "application/pdf", buffer: PDF },
  ]);
  check("T3 201 created", t3.status === 201, `got ${t3.status} ${JSON.stringify(t3.data?.error ?? t3.data)}`);
  if (t3.status === 201) createdMaintIds.push(t3.data.id);
  check("T3 three document rows", (await countDocs(t3.data?.id)) === 3, `got ${await countDocs(t3.data?.id)}`);
  const t3Mimes = (t3.data?.documents ?? []).map((d) => d.mimeType);
  check("T3 mime types match uploads", t3Mimes.filter((m) => m === "image/png").length === 2 && t3Mimes.filter((m) => m === "application/pdf").length === 1, JSON.stringify(t3Mimes));
  const pdfDoc = (t3.data?.documents ?? []).find((d) => d.mimeType === "application/pdf");

  // ============ TEST 4: unsupported file → rejected ============
  console.log("\n=== TEST 4: Unsupported file type ===");
  const before4 = await countMaintenance();
  const t4 = await multipart("POST", "/fleet/maintenance", baseFields, [
    { name: "notes.txt", mime: "text/plain", buffer: TXT },
  ]);
  check("T4 400 rejected", t4.status === 400, `got ${t4.status} ${JSON.stringify(t4.data)}`);
  check("T4 error message", String(t4.data?.error).includes("Only PNG, JPG/JPEG, and PDF files are supported."), JSON.stringify(t4.data));
  check("T4 no maintenance row", (await countMaintenance()) === before4);

  // ============ TEST 5: file > 10 MB → rejected ============
  console.log("\n=== TEST 5: File larger than 10 MB ===");
  const before5 = await countMaintenance();
  const t5 = await multipart("POST", "/fleet/maintenance", baseFields, [
    { name: "huge.png", mime: "image/png", buffer: BIG },
  ]);
  check("T5 400 rejected", t5.status === 400, `got ${t5.status} ${JSON.stringify(t5.data)}`);
  check("T5 error message", String(t5.data?.error).includes("File size cannot exceed 10 MB."), JSON.stringify(t5.data));
  check("T5 no maintenance row", (await countMaintenance()) === before5);

  // ============ TEST 6: more than 10 files → rejected ============
  console.log("\n=== TEST 6: More than 10 files ===");
  const before6 = await countMaintenance();
  const eleven = Array.from({ length: 11 }, (_, i) => ({ name: `f${i}.png`, mime: "image/png", buffer: PNG }));
  const t6 = await multipart("POST", "/fleet/maintenance", baseFields, eleven);
  check("T6 400 rejected", t6.status === 400, `got ${t6.status} ${JSON.stringify(t6.data)}`);
  check("T6 error message", String(t6.data?.error).includes("Maximum 10 documents are allowed."), JSON.stringify(t6.data));
  check("T6 no maintenance row", (await countMaintenance()) === before6);

  // ============ TEST 7: History list returns document metadata (no binary) ============
  console.log("\n=== TEST 7: History list contains document metadata ===");
  const t7 = await jsonApi("GET", `/fleet/maintenance?vehicleId=${vehId}`);
  check("T7 list 200", t7.status === 200);
  const t7row = Array.isArray(t7.data) ? t7.data.find((r) => r.id === t2.data?.id) : null;
  check("T7 entry has documents array", Array.isArray(t7row?.documents) && t7row.documents.length === 1, JSON.stringify(t7row?.documents));
  const docMeta = t7row?.documents?.[0];
  check("T7 metadata fields present", docMeta?.id && docMeta?.fileName === "bill.png" && docMeta?.mimeType === "image/png" && typeof docMeta?.fileSize === "number", JSON.stringify(docMeta));
  const rawList = JSON.stringify(t7row?.documents);
  check("T7 no binary/base64 in list", !rawList.includes("data:image") && !rawList.includes("base64") && !rawList.includes("iVBOR"), "");
  check("T7 doc count known", t7row.documents.length === 1);
  // dedicated endpoint
  const t7b = await jsonApi("GET", `/fleet/maintenance/${t2.data?.id}/documents`);
  check("T7b documents endpoint returns metadata", Array.isArray(t7b.data) && t7b.data.length === 1 && t7b.data[0].fileName === "bill.png", JSON.stringify(t7b.data));

  // ============ TEST 9: click image → opens with correct content-type ============
  console.log("\n=== TEST 9: Image binary endpoint ===");
  const t9 = await fetch(API + `/fleet/maintenance/${t2.data?.id}/documents/${t2Doc?.id}`);
  const t9buf = Buffer.from(await t9.arrayBuffer());
  check("T9 image 200 + content-type", t9.status === 200 && t9.headers.get("content-type") === "image/png", `status=${t9.status} ct=${t9.headers.get("content-type")}`);
  check("T9 image bytes match", t9buf.equals(PNG));
  check("T9 content-disposition inline", String(t9.headers.get("content-disposition")).startsWith("inline"));

  // ============ TEST 10: click PDF → opens with correct content-type ============
  console.log("\n=== TEST 10: PDF binary endpoint ===");
  const t10 = await fetch(API + `/fleet/maintenance/${t3.data?.id}/documents/${pdfDoc?.id}`);
  const t10buf = Buffer.from(await t10.arrayBuffer());
  check("T10 pdf 200 + content-type", t10.status === 200 && t10.headers.get("content-type") === "application/pdf", `status=${t10.status} ct=${t10.headers.get("content-type")}`);
  check("T10 pdf bytes match", t10buf.equals(PDF));

  // ============ TEST 11: edit maintenance → existing docs remain ============
  console.log("\n=== TEST 11: Update maintenance keeps existing documents ===");
  const t11 = await jsonApi("PUT", `/fleet/maintenance/${t2.data?.id}`, {
    currentKM: 45230,
    serviceType: "Oil Change + Brake Service",
    parts: [{ name: "Brake Pads", specification: "Front", quantity: 1, rate: 1800 }],
    remarks: "updated",
  });
  check("T11 200 updated", t11.status === 200, `got ${t11.status} ${JSON.stringify(t11.data?.error ?? t11.data)}`);
  check("T11 currentKM applied", t11.data?.currentKM === 45230);
  check("T11 existing docs remain", Array.isArray(t11.data?.documents) && t11.data.documents.length === 1 && t11.data.documents[0].id === t2Doc?.id, JSON.stringify(t11.data?.documents));
  check("T11 doc row still in DB", (await countDocs(t2.data?.id)) === 1);

  // ============ TEST 12: add another document during edit ============
  console.log("\n=== TEST 12: Add document during update — old + new remain ===");
  const t12 = await multipart("PUT", `/fleet/maintenance/${t2.data?.id}`, { remarks: "added a jpg" }, [
    { name: "spare-parts-1.jpg", mime: "image/jpeg", buffer: JPG },
  ]);
  check("T12 200 updated", t12.status === 200, `got ${t12.status} ${JSON.stringify(t12.data?.error ?? t12.data)}`);
  check("T12 old + new docs remain", Array.isArray(t12.data?.documents) && t12.data.documents.length === 2 && t12.data.documents.some((d) => d.id === t2Doc?.id), JSON.stringify(t12.data?.documents));
  check("T12 two doc rows in DB", (await countDocs(t2.data?.id)) === 2);
  const jpgDoc = (t12.data?.documents ?? []).find((d) => d.mimeType === "image/jpeg");
  check("T12 new jpg present", Boolean(jpgDoc));

  // ============ TEST 13: delete one document ============
  console.log("\n=== TEST 13: Delete/remove one document ===");
  const t13 = await jsonApi("DELETE", `/fleet/maintenance/${t2.data?.id}/documents/${jpgDoc?.id}`);
  check("T13 delete 200", t13.status === 200, `got ${t13.status} ${JSON.stringify(t13.data)}`);
  const t13List = await jsonApi("GET", `/fleet/maintenance/${t2.data?.id}/documents`);
  check("T13 only selected document removed", Array.isArray(t13List.data) && t13List.data.length === 1 && t13List.data[0].id === t2Doc?.id, JSON.stringify(t13List.data));
  check("T13 one doc row in DB", (await countDocs(t2.data?.id)) === 1);

  // ============ TEST 13b: cannot remove the last document ============
  console.log("\n=== TEST 13b: Cannot remove the last remaining document ===");
  const t13b = await jsonApi("DELETE", `/fleet/maintenance/${t2.data?.id}/documents/${t2Doc?.id}`);
  check("T13b 400 rejected", t13b.status === 400, `got ${t13b.status} ${JSON.stringify(t13b.data)}`);
  check("T13b error message", String(t13b.data?.error).includes("At least one document must remain"), JSON.stringify(t13b.data));
  check("T13b last document still present", (await countDocs(t2.data?.id)) === 1);

  // ============ TEST 14: approve → documents remain accessible ============
  console.log("\n=== TEST 14: Approve keeps documents accessible ===");
  const t14 = await jsonApi("POST", `/fleet/maintenance/${t2.data?.id}/approve`, { approvedBy: "tester" });
  check("T14 approve 200", t14.status === 200 && t14.data?.status === "Approved", `got ${t14.status}`);
  const t14Docs = await jsonApi("GET", `/fleet/maintenance/${t2.data?.id}/documents`);
  check("T14 documents accessible after approval", Array.isArray(t14Docs.data) && t14Docs.data.length === 1);

  // ============ TEST 15: reject → documents remain accessible ============
  console.log("\n=== TEST 15: Reject keeps documents accessible ===");
  const t15 = await jsonApi("POST", `/fleet/maintenance/${t3.data?.id}/reject`, { reason: "not required", rejectedBy: "tester" });
  check("T15 reject 200", t15.status === 200 && t15.data?.status === "Rejected", `got ${t15.status}`);
  const t15Docs = await jsonApi("GET", `/fleet/maintenance/${t3.data?.id}/documents`);
  check("T15 documents accessible after rejection", Array.isArray(t15Docs.data) && t15Docs.data.length === 3);

  // ============ TEST 16: failed document upload rolls back everything ============
  console.log("\n=== TEST 16: Failed document upload during create rolls back ===");
  const before16 = await countMaintenance();
  const docCountAll = async () =>
    (await db(`SELECT COUNT(*)::int c FROM fleet_maintenance_documents d JOIN fleet_maintenance fm ON fm.id = d.maintenance_id WHERE fm.vehicle_id = $1 AND fm.maintenance_date = $2`, [vehId, TEST_DATE])).rows[0].c;
  const before16Docs = await docCountAll();
  const longName = "x".repeat(300) + ".png";
  const t16 = await multipart("POST", "/fleet/maintenance", baseFields, [
    { name: "ok.png", mime: "image/png", buffer: PNG },
    { name: longName, mime: "image/png", buffer: PNG },
  ]);
  check("T16 rejected (4xx)", t16.status >= 400 && t16.status < 500, `got ${t16.status} ${JSON.stringify(t16.data)}`);
  check("T16 no maintenance row", (await countMaintenance()) === before16);
  check("T16 no new document rows", (await docCountAll()) === before16Docs, `before=${before16Docs} after=${await docCountAll()}`);

  // ============ TEST 17: soft-delete → hidden by default, documents remain ============
  console.log("\n=== TEST 17: Soft delete keeps documents associated ===");
  const t17 = await jsonApi("DELETE", `/fleet/maintenance/${t3.data?.id}`, { reason: "wrong entry" });
  check("T17 soft delete 200", t17.status === 200 && t17.data?.deleted === true, `got ${t17.status}`);
  const t17List = await jsonApi("GET", `/fleet/maintenance?vehicleId=${vehId}`);
  check("T17 hidden by default", Array.isArray(t17List.data) && !t17List.data.some((r) => r.id === t3.data?.id));
  const t17WithDel = await jsonApi("GET", `/fleet/maintenance?vehicleId=${vehId}&includeDeleted=true`);
  check("T17 visible with includeDeleted", Array.isArray(t17WithDel.data) && t17WithDel.data.some((r) => r.id === t3.data?.id));
  const t17Docs = await jsonApi("GET", `/fleet/maintenance/${t3.data?.id}/documents`);
  check("T17 documents remain associated", Array.isArray(t17Docs.data) && t17Docs.data.length === 3);
  const t17Pdf = await fetch(API + `/fleet/maintenance/${t3.data?.id}/documents/${pdfDoc?.id}`);
  check("T17 document binary still retrievable", t17Pdf.status === 200 && t17Pdf.headers.get("content-type") === "application/pdf");

  console.log(`\n======================================`);
  console.log(`DOCUMENT TESTS RESULT: ${pass} passed, ${fail} failed`);
  console.log(`======================================`);
} catch (err) {
  console.error("TEST RUNNER ERROR:", err);
} finally {
  try {
    if (createdMaintIds.length) {
      await db(`DELETE FROM fleet_maintenance_documents WHERE maintenance_id = ANY($1)`, [createdMaintIds]);
      await db(`DELETE FROM fleet_maintenance WHERE id = ANY($1)`, [createdMaintIds]);
    }
    if (vehId != null) await db(`DELETE FROM vehicles WHERE id = $1`, [vehId]);
    if (drvId != null) await db(`DELETE FROM employees WHERE id = $1`, [drvId]);
    await pool.end();
  } catch (e) {
    console.error("Cleanup error:", e.message);
  }
  if (fail > 0) process.exit(1);
}
