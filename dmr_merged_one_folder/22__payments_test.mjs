// =============================================================================
// LIVE end-to-end verification of the Accounts → Payments backend
// (Accounts Paid Payments). Backend must be running on :4000 (tsx watch).
//
// Covers: CRUD, soft delete, hidden deleted rows, validation (amount NaN/
// Infinity/negative/zero, enums, required fields, malformed ids, bad query
// params), search, date/type/mode/status filters, pagination, payment-number
// format/uniqueness/never-reused, concurrency, DB-level uniqueness, and
// transaction-rollback counter consistency.
//
// Test payments use isolated 2015 dates (no real business data), a dedicated
// created_by marker, and are deleted (plus their counter rows) on completion
// so re-runs stay deterministic. Production counters are never reset by this
// test — it only touches its own fixture dates.
// =============================================================================
import pg from "pg";

const API = "http://localhost:4000/api";
const pool = new pg.Pool({
  connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries",
});
const db = (sql, params = []) => pool.query(sql, params);

let pass = 0,
  fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}  ${extra}`);
  }
};

async function jsonApi(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

/** Send a raw JSON string (needed to smuggle Infinity via 1e400). */
async function rawJson(method, path, raw) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: raw,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

const postPayment = (body) => jsonApi("POST", "/accounts/payments", body);
const getPayment = (id) => jsonApi("GET", `/accounts/payments/${id}`);
const putPayment = (id, body) => jsonApi("PUT", `/accounts/payments/${id}`, body);
const delPayment = (id) => jsonApi("DELETE", `/accounts/payments/${id}`);
const listPayments = (qs = "") => jsonApi("GET", `/accounts/payments${qs}`);

// ---- isolated fixture dates (2015 — never collides with real business data) ----
const SEQ_DATE = "2015-01-05"; // sequential numbering / uniqueness / never-reused
const FILTER_D1 = "2015-01-06"; // search + date-filter + pagination scope
const FILTER_D2 = "2015-01-07"; // type / mode / status filter targets
const RACE_DATE = "2015-01-08"; // concurrency race
const ROLLBACK_DATE = "2015-01-09"; // transaction-rollback counter test
const TEST_DATES = [SEQ_DATE, FILTER_D1, FILTER_D2, RACE_DATE, ROLLBACK_DATE];

const stamp = Date.now().toString().slice(-6);
const fmtNo = /^PAY-\d{8}-\d{3}$/;

const base = (date, suffix, overrides = {}) => ({
  paymentDate: date,
  paymentType: "Office Expense",
  paidTo: `TEST PAY ${suffix}`,
  amount: 1000,
  paymentMode: "Cash",
  referenceNo: `REF-${suffix}`,
  remarks: `payments-test-${stamp}-${suffix}`,
  status: "Approved",
  createdBy: "payments-test",
  ...overrides,
});

const createdIds = [];

try {
  // ---- Reset fixture dates (stale rows from a crashed run) ----
  await db(
    `DELETE FROM payments WHERE payment_date = ANY($1::date[]) AND created_by = 'payments-test'`,
    [TEST_DATES]
  );
  await db(`DELETE FROM payment_number_counters WHERE counter_date = ANY($1::date[])`, [TEST_DATES]);

  // ============ 1. Create payment ============
  console.log("\n=== 1. Create payment ===");
  const c1 = await postPayment(base(SEQ_DATE, "c1"));
  if (c1.status === 201) createdIds.push(c1.data.id);
  check("1.1 create returns 201", c1.status === 201, `got ${c1.status} ${JSON.stringify(c1.data)}`);
  check("1.2 paymentNo PAY-20150105-001", c1.data?.paymentNo === "PAY-20150105-001", `got ${c1.data?.paymentNo}`);
  check("1.3 paymentNo matches PAY-YYYYMMDD-NNN", fmtNo.test(c1.data?.paymentNo ?? ""), c1.data?.paymentNo);
  check("1.4 fields echoed", c1.data?.paymentDate === SEQ_DATE && c1.data?.paymentType === "Office Expense" && c1.data?.paidTo?.startsWith("TEST PAY") && c1.data?.amount === 1000 && c1.data?.paymentMode === "Cash" && c1.data?.referenceNo?.startsWith("REF-"), JSON.stringify(c1.data));
  check("1.5 status defaults/echoed", c1.data?.status === "Approved", c1.data?.status);
  check("1.6 createdBy captured", c1.data?.createdBy === "payments-test", c1.data?.createdBy);
  check("1.7 mode/reference aliases present", c1.data?.mode === c1.data?.paymentMode && c1.data?.reference === c1.data?.referenceNo, JSON.stringify({ mode: c1.data?.mode, reference: c1.data?.reference }));
  check("1.8 attachments empty (frontend contract)", Array.isArray(c1.data?.attachments) && c1.data.attachments.length === 0);
  check("1.9 deleted=false by default", c1.data?.deleted === false);
  check("1.10 timestamps present", !!c1.data?.createdAt && !!c1.data?.updatedAt);

  // ============ 2. Read payment ============
  console.log("\n=== 2. Read payment ===");
  const r1 = await getPayment(c1.data?.id);
  check("2.1 get returns 200", r1.status === 200, `got ${r1.status}`);
  check("2.2 same paymentNo", r1.data?.paymentNo === c1.data?.paymentNo);
  check("2.3 same amount", r1.data?.amount === c1.data?.amount);
  check("2.4 id matches", r1.data?.id === c1.data?.id);

  // ============ 3. List payments ============
  console.log("\n=== 3. List payments ===");
  const list1 = await listPayments();
  check("3.1 list returns 200 + array", list1.status === 200 && Array.isArray(list1.data), `got ${list1.status}`);
  check("3.2 list contains created payment", Array.isArray(list1.data) && list1.data.some((p) => p.id === c1.data?.id));

  // ============ 4. Update payment ============
  console.log("\n=== 4. Update payment ===");
  // updated_at is returned with second granularity (Date.toString()); sleep so
  // the update lands in a different second than the create.
  await new Promise((r) => setTimeout(r, 1100));
  const u1 = await putPayment(c1.data?.id, { paidTo: "Updated Payee", amount: 1500, remarks: "updated remarks" });
  check("4.1 update returns 200", u1.status === 200, `got ${u1.status} ${JSON.stringify(u1.data)}`);
  check("4.2 paidTo updated", u1.data?.paidTo === "Updated Payee", u1.data?.paidTo);
  check("4.3 amount updated", u1.data?.amount === 1500, String(u1.data?.amount));
  check("4.4 remarks updated", u1.data?.remarks === "updated remarks");
  check("4.5 paymentNo NOT changed", u1.data?.paymentNo === "PAY-20150105-001", u1.data?.paymentNo);
  check("4.6 createdAt preserved (audit)", u1.data?.createdAt === c1.data?.createdAt, `${u1.data?.createdAt} vs ${c1.data?.createdAt}`);
  check("4.7 updatedAt refreshed", u1.data?.updatedAt !== c1.data?.updatedAt, `${u1.data?.updatedAt} vs ${c1.data?.updatedAt}`);

  console.log("\n=== 4b. paymentNo cannot be changed / regenerated ===");
  const u2 = await putPayment(c1.data?.id, { paymentNo: "PAY-99999999-999", paidTo: "Hacker Payee" });
  check("4b.1 client-supplied paymentNo ignored", u2.status === 200 && u2.data?.paymentNo === "PAY-20150105-001", `${u2.status} ${u2.data?.paymentNo}`);
  check("4b.2 fake number never persisted", (await db(`SELECT COUNT(*)::int c FROM payments WHERE payment_no = 'PAY-99999999-999'`)).rows[0].c === 0);

  // ============ 5. Soft delete payment ============
  console.log("\n=== 5. Soft delete payment ===");
  const fd = await postPayment(base(FILTER_D2, "fd"));
  if (fd.status === 201) createdIds.push(fd.data.id);
  const del1 = await delPayment(fd.data?.id);
  check("5.1 delete returns 200", del1.status === 200, `got ${del1.status}`);
  check("5.2 deleted=true", del1.data?.deleted === true, JSON.stringify(del1.data));
  check("5.3 deletedAt set", !!del1.data?.deletedAt, del1.data?.deletedAt);
  check("5.4 paymentNo preserved after delete", del1.data?.paymentNo === fd.data?.paymentNo, del1.data?.paymentNo);

  // ============ 6. Deleted payment hidden from normal list ============
  console.log("\n=== 6. Deleted payment hidden ===");
  const gDel = await getPayment(fd.data?.id);
  check("6.1 get deleted → 404", gDel.status === 404, `got ${gDel.status}`);
  const listNoDeleted = await listPayments();
  check("6.2 normal list excludes deleted", Array.isArray(listNoDeleted.data) && !listNoDeleted.data.some((p) => p.id === fd.data?.id));
  const listIncDel = await listPayments("?includeDeleted=true");
  check("6.3 includeDeleted=true exposes it", Array.isArray(listIncDel.data) && listIncDel.data.some((p) => p.id === fd.data?.id));
  const repDel = await delPayment(fd.data?.id);
  check("6.4 repeated delete → clean 4xx", repDel.status === 404, `got ${repDel.status}`);
  const updDel = await putPayment(fd.data?.id, { remarks: "nope" });
  check("6.5 update deleted → 404", updDel.status === 404, `got ${updDel.status}`);

  // ============ 7. Invalid amount rejected ============
  console.log("\n=== 7. Invalid amount rejected ===");
  const amt0 = await postPayment(base(SEQ_DATE, "amt0", { amount: 0 }));
  check("7.1 amount 0 rejected", amt0.status === 400, `got ${amt0.status}`);
  const amtNeg = await postPayment(base(SEQ_DATE, "amtneg", { amount: -100 }));
  check("7.2 amount negative rejected", amtNeg.status === 400, `got ${amtNeg.status}`);
  const amtStr = await postPayment(base(SEQ_DATE, "amtstr", { amount: "abc" }));
  check("7.3 amount string rejected", amtStr.status === 400, `got ${amtStr.status}`);
  const amtInf = await rawJson("POST", "/accounts/payments", `{"paymentDate":"2015-01-05","paymentType":"Office Expense","paidTo":"Inf Test","amount":1e400,"paymentMode":"Cash"}`);
  check("7.4 amount Infinity rejected", amtInf.status === 400, `got ${amtInf.status} ${JSON.stringify(amtInf.data)}`);
  const amtNan = await postPayment(base(SEQ_DATE, "amtnan", { amount: "NaN" }));
  check("7.5 amount NaN (string) rejected", amtNan.status === 400, `got ${amtNan.status}`);
  const amtMissing = await postPayment({ paymentDate: SEQ_DATE, paymentType: "Office Expense", paidTo: "X", paymentMode: "Cash" });
  check("7.6 amount missing rejected", amtMissing.status === 400, `got ${amtMissing.status}`);

  // ============ 8. Invalid payment type rejected ============
  console.log("\n=== 8. Invalid payment type rejected ===");
  const badType = await postPayment(base(SEQ_DATE, "bt", { paymentType: "Bogus Type" }));
  check("8.1 invalid payment type rejected", badType.status === 400, `got ${badType.status}`);
  const typeSpace = await postPayment(base(FILTER_D2, "ts", { paymentType: " Office Expense " }));
  check("8.2 payment type trimmed (valid)", typeSpace.status === 201, `got ${typeSpace.status} ${JSON.stringify(typeSpace.data)}`);
  if (typeSpace.status === 201) createdIds.push(typeSpace.data.id);

  // ============ 9. Invalid mode rejected ============
  console.log("\n=== 9. Invalid mode rejected ===");
  const badMode = await postPayment(base(SEQ_DATE, "bm", { paymentMode: "Bitcoin" }));
  check("9.1 invalid mode rejected", badMode.status === 400, `got ${badMode.status}`);

  // ============ 10. Missing required fields rejected ============
  console.log("\n=== 10. Missing required fields rejected ===");
  const emptyBody = await postPayment({});
  check("10.1 empty body rejected", emptyBody.status === 400, `got ${emptyBody.status}`);
  const noDate = await postPayment({ paymentType: "Office Expense", paidTo: "X", amount: 100, paymentMode: "Cash" });
  check("10.2 missing paymentDate rejected", noDate.status === 400, `got ${noDate.status}`);
  const noType = await postPayment({ paymentDate: SEQ_DATE, paidTo: "X", amount: 100, paymentMode: "Cash" });
  check("10.3 missing paymentType rejected", noType.status === 400, `got ${noType.status}`);
  const noTo = await postPayment({ paymentDate: SEQ_DATE, paymentType: "Office Expense", amount: 100, paymentMode: "Cash" });
  check("10.4 missing paidTo rejected", noTo.status === 400, `got ${noTo.status}`);
  const noMode = await postPayment({ paymentDate: SEQ_DATE, paymentType: "Office Expense", paidTo: "X", amount: 100 });
  check("10.5 missing paymentMode rejected", noMode.status === 400, `got ${noMode.status}`);
  const badDate = await postPayment(base(SEQ_DATE, "bd", { paymentDate: "2026-13-45" }));
  check("10.6 invalid date rejected", badDate.status === 400, `got ${badDate.status}`);
  const badDate2 = await postPayment(base(SEQ_DATE, "bd2", { paymentDate: "not-a-date" }));
  check("10.7 malformed date rejected", badDate2.status === 400, `got ${badDate2.status}`);

  // ============ 21. Repeated create receives different sequential numbers ============
  console.log("\n=== 21. Repeated create — different numbers ===");
  const s1 = await postPayment(base(SEQ_DATE, "s1"));
  const s2 = await postPayment(base(SEQ_DATE, "s2"));
  const s3 = await postPayment(base(SEQ_DATE, "s3"));
  if (s1.status === 201) createdIds.push(s1.data.id);
  if (s2.status === 201) createdIds.push(s2.data.id);
  if (s3.status === 201) createdIds.push(s3.data.id);
  check("21.1 s1 = -002", s1.data?.paymentNo === "PAY-20150105-002", s1.data?.paymentNo);
  check("21.2 s2 = -003", s2.data?.paymentNo === "PAY-20150105-003", s2.data?.paymentNo);
  check("21.3 s3 = -004", s3.data?.paymentNo === "PAY-20150105-004", s3.data?.paymentNo);
  check("21.4 all distinct", new Set([s1.data?.paymentNo, s2.data?.paymentNo, s3.data?.paymentNo]).size === 3);

  // ============ 20. Cancelled number never reused ============
  console.log("\n=== 20. Cancelled number never reused ===");
  const cancelled = await postPayment(base(SEQ_DATE, "canc", { status: "Cancelled" }));
  if (cancelled.status === 201) createdIds.push(cancelled.data.id);
  check("20.1 cancelled = -005", cancelled.data?.paymentNo === "PAY-20150105-005", cancelled.data?.paymentNo);
  check("20.2 status Cancelled", cancelled.data?.status === "Cancelled");
  const afterCancel = await postPayment(base(SEQ_DATE, "ac"));
  if (afterCancel.status === 201) createdIds.push(afterCancel.data.id);
  check("20.3 cancelled number never reused (-006)", afterCancel.data?.paymentNo === "PAY-20150105-006", afterCancel.data?.paymentNo);

  // ============ 19. Deleted number never reused ============
  console.log("\n=== 19. Deleted number never reused ===");
  const toDelete = await postPayment(base(SEQ_DATE, "del"));
  if (toDelete.status === 201) createdIds.push(toDelete.data.id);
  check("19.1 toDelete = -007", toDelete.data?.paymentNo === "PAY-20150105-007", toDelete.data?.paymentNo);
  const ddel = await delPayment(toDelete.data?.id);
  check("19.2 soft delete ok", ddel.status === 200);
  const afterDelete = await postPayment(base(SEQ_DATE, "ad"));
  if (afterDelete.status === 201) createdIds.push(afterDelete.data.id);
  check("19.3 deleted number never reused (-008)", afterDelete.data?.paymentNo === "PAY-20150105-008", afterDelete.data?.paymentNo);
  const stillThere = (await db(`SELECT COUNT(*)::int c FROM payments WHERE payment_no = 'PAY-20150105-007' AND deleted = TRUE`)).rows[0].c;
  check("19.4 deleted -007 still occupies its row", stillThere === 1, `got ${stillThere}`);

  // ============ 17. Payment number format ============
  console.log("\n=== 17. Payment number format ===");
  const allNos = (await db(`SELECT payment_no FROM payments WHERE id = ANY($1::int[])`, [createdIds])).rows.map((r) => r.payment_no);
  check("17.1 every persisted number matches format", allNos.every((n) => fmtNo.test(n)), JSON.stringify(allNos));

  // ============ 18. Payment number uniqueness ============
  console.log("\n=== 18. Payment number uniqueness ===");
  check("18.1 all persisted numbers distinct", new Set(allNos).size === allNos.length, JSON.stringify(allNos));

  // ============ 11. Search ============
  console.log("\n=== 11. Search ===");
  const se1 = await postPayment(base(FILTER_D1, "se1", { paidTo: "Alpha Poultry Farm", referenceNo: "REF-ALPHA-77", remarks: "weekly settlement alpha" }));
  const se2 = await postPayment(base(FILTER_D1, "se2", { paidTo: "Beta Traders", referenceNo: "REF-BETA-88", remarks: "monthly bill beta" }));
  if (se1.status === 201) createdIds.push(se1.data.id);
  if (se2.status === 201) createdIds.push(se2.data.id);
  const sPaidTo = await listPayments(`?search=${encodeURIComponent("alpha")}`);
  check("11.1 search paidTo", Array.isArray(sPaidTo.data) && sPaidTo.data.some((p) => p.id === se1.data?.id), JSON.stringify(sPaidTo.data?.map?.(() => "")));
  const sRef = await listPayments(`?search=${encodeURIComponent("REF-BETA-88")}`);
  check("11.2 search reference", Array.isArray(sRef.data) && sRef.data.some((p) => p.id === se2.data?.id));
  const sRemark = await listPayments(`?search=${encodeURIComponent("weekly settlement")}`);
  check("11.3 search remarks", Array.isArray(sRemark.data) && sRemark.data.some((p) => p.id === se1.data?.id));
  const sNo = await listPayments(`?search=${encodeURIComponent(se1.data?.paymentNo ?? "")}`);
  check("11.4 search paymentNo", Array.isArray(sNo.data) && sNo.data.some((p) => p.id === se1.data?.id));

  // ============ 12. Date filtering ============
  console.log("\n=== 12. Date filtering ===");
  const dateRange = await listPayments(`?fromDate=${FILTER_D1}&toDate=${FILTER_D1}`);
  check("12.1 from/to single day", Array.isArray(dateRange.data) && dateRange.data.every((p) => p.paymentDate === FILTER_D1) && dateRange.data.some((p) => p.id === se1.data?.id) && dateRange.data.some((p) => p.id === se2.data?.id), JSON.stringify(dateRange.data?.map?.((p) => p.paymentDate)));
  const fromOnly = await listPayments(`?fromDate=${FILTER_D2}`);
  check("12.2 fromDate only (excludes earlier)", Array.isArray(fromOnly.data) && fromOnly.data.every((p) => p.paymentDate >= FILTER_D2));
  const toOnly = await listPayments(`?toDate=${FILTER_D1}`);
  check("12.3 toDate only (excludes later)", Array.isArray(toOnly.data) && toOnly.data.every((p) => p.paymentDate <= FILTER_D1));

  // ============ 13/14/15. Type / mode / status filtering ============
  console.log("\n=== 13/14/15. Type / mode / status filtering ===");
  const tf = await postPayment(base(FILTER_D2, "tf", { paymentType: "FASTag Recharge", paymentMode: "UPI", status: "Paid" }));
  if (tf.status === 201) createdIds.push(tf.data.id);
  const fType = await listPayments(`?paymentType=${encodeURIComponent("FASTag Recharge")}`);
  check("13.1 type filter", Array.isArray(fType.data) && fType.data.some((p) => p.id === tf.data?.id) && fType.data.every((p) => p.paymentType === "FASTag Recharge"));
  const fMode = await listPayments(`?mode=${encodeURIComponent("UPI")}`);
  check("14.1 mode filter", Array.isArray(fMode.data) && fMode.data.some((p) => p.id === tf.data?.id) && fMode.data.every((p) => p.paymentMode === "UPI"));
  const fStatus = await listPayments(`?status=${encodeURIComponent("Paid")}`);
  check("15.1 status filter", Array.isArray(fStatus.data) && fStatus.data.some((p) => p.id === tf.data?.id) && fStatus.data.every((p) => p.status === "Paid"));

  // ============ 16. Pagination ============
  console.log("\n=== 16. Pagination ===");
  const pag1 = await listPayments(`?fromDate=${SEQ_DATE}&toDate=${SEQ_DATE}&page=1&limit=2`);
  check("16.1 paginated shape {data, meta}", pag1.status === 200 && Array.isArray(pag1.data?.data) && !!pag1.data?.meta, JSON.stringify(pag1.data));
  check("16.2 meta.total correct", pag1.data?.meta?.total === 7, `total=${pag1.data?.meta?.total} (expect 7: -001..-006 + -008 visible, -007 deleted hidden)`);
  check("16.3 page1 returns 2 rows", pag1.data?.data?.length === 2);
  check("16.4 totalPages = 4", pag1.data?.meta?.totalPages === 4);
  const pag2 = await listPayments(`?fromDate=${SEQ_DATE}&toDate=${SEQ_DATE}&page=3&limit=2`);
  check("16.5 page3 returns 2 rows", pag2.data?.data?.length === 2);
  const pag3 = await listPayments(`?fromDate=${SEQ_DATE}&toDate=${SEQ_DATE}&page=4&limit=2`);
  check("16.6 page4 returns 1 row", pag3.data?.data?.length === 1);

  // ============ 22. Concurrency — 8 simultaneous creates, same date ============
  console.log(`\n=== 22. Concurrency — 8 simultaneous creates on ${RACE_DATE} ===`);
  const race = async (i) => postPayment(base(RACE_DATE, `race${i}`, { remarks: `payments-test-${stamp}-race-${i}` }));
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => race(i)));
  const created = results.filter((r) => r.status === 201);
  created.forEach((r) => createdIds.push(r.data.id));
  check("22.1 all 8 concurrent creates succeeded", created.length === 8, `${created.length}/8 ${JSON.stringify(results.map((r) => r.status))}`);
  const raceNos = created.map((r) => r.data.paymentNo);
  check("22.2 no duplicate numbers", new Set(raceNos).size === 8, JSON.stringify(raceNos));
  const expected = Array.from({ length: 8 }, (_, i) => `PAY-20150108-${String(i + 1).padStart(3, "0")}`);
  check("22.3 exactly PAY-20150108-001..008", JSON.stringify([...raceNos].sort()) === JSON.stringify([...expected].sort()), JSON.stringify(raceNos));
  const raceCounter = (await db(`SELECT last_sequence FROM payment_number_counters WHERE counter_date = $1::date`, [RACE_DATE])).rows[0]?.last_sequence;
  check("22.4 counter matches issued max (8)", Number(raceCounter) === 8, `counter=${raceCounter}`);

  // ============ 23. DB uniqueness protection ============
  console.log("\n=== 23. DB uniqueness protection ===");
  const dupNo = `PAY-UNIQ-${stamp}-1`;
  await db(
    `INSERT INTO payments (payment_no, payment_date, payment_type, paid_to, amount, payment_mode, status, created_by)
     VALUES ($1,'2015-01-05','Office Expense','DUP',100,'Cash','Draft','payments-test')`,
    [dupNo]
  );
  let dupErr = null;
  try {
    await db(
      `INSERT INTO payments (payment_no, payment_date, payment_type, paid_to, amount, payment_mode, status, created_by)
       VALUES ($1,'2015-01-05','Office Expense','DUP',100,'Cash','Draft','payments-test')`,
      [dupNo]
    );
  } catch (e) {
    dupErr = e;
  }
  check("23.1 duplicate payment_no violates unique index (23505)", !!dupErr && dupErr.code === "23505", dupErr ? `code=${dupErr.code}` : "no error thrown");
  const uniqIndex = (await db(
    `SELECT COUNT(*)::int c FROM pg_indexes
     WHERE tablename='payments' AND indexname='idx_payments_payment_no' AND indexdef LIKE '%UNIQUE%'`
  )).rows[0].c;
  check("23.2 explicit unique index on payment_no present", uniqIndex === 1, `got ${uniqIndex}`);
  await db(`DELETE FROM payments WHERE payment_no = $1`, [dupNo]);

  // ============ 24. Transaction rollback leaves consistent counter ============
  console.log("\n=== 24. Transaction rollback leaves consistent counter ===");
  const rbNo = `PAY-${ROLLBACK_DATE.replace(/-/g, "")}-001`;
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    const counter = await tx.query(
      `INSERT INTO payment_number_counters (counter_date, last_sequence)
       VALUES ($1::date, 1)
       ON CONFLICT (counter_date) DO UPDATE SET last_sequence = payment_number_counters.last_sequence + 1
       RETURNING last_sequence`,
      [ROLLBACK_DATE]
    );
    const seq = Number(counter.rows[0].last_sequence);
    check("24.1 counter incremented inside tx", seq === 1, `seq=${seq}`);
    await tx.query(
      `INSERT INTO payments (payment_no, payment_date, payment_type, paid_to, amount, payment_mode, status, created_by)
       VALUES ($1,$2,'Office Expense','RB',100,'Cash','Draft','payments-test')`,
      [rbNo, ROLLBACK_DATE]
    );
    try {
      // Second insert with the SAME payment_no forces a 23505 inside the tx.
      await tx.query(
        `INSERT INTO payments (payment_no, payment_date, payment_type, paid_to, amount, payment_mode, status, created_by)
         VALUES ($1,$2,'Office Expense','RB',100,'Cash','Draft','payments-test')`,
        [rbNo, ROLLBACK_DATE]
      );
      check("24.2 duplicate inside tx errored", false, "no error");
    } catch (e) {
      check("24.2 duplicate inside tx errored (23505)", e.code === "23505", `code=${e.code}`);
    }
    await tx.query("ROLLBACK");
  } finally {
    tx.release();
  }
  const rbRows = (await db(`SELECT COUNT(*)::int c FROM payments WHERE payment_no = $1`, [rbNo])).rows[0].c;
  check("24.3 rolled-back payment not persisted", rbRows === 0, `rows=${rbRows}`);
  const rbCounter = (await db(`SELECT COUNT(*)::int c FROM payment_number_counters WHERE counter_date = $1::date`, [ROLLBACK_DATE])).rows[0].c;
  check("24.4 counter rolled back too (no dangling state)", rbCounter === 0, `counterRows=${rbCounter}`);

  // Also verify a successful create does leave the counter exactly consistent.
  const okCreate = await postPayment(base(ROLLBACK_DATE, "ok"));
  if (okCreate.status === 201) createdIds.push(okCreate.data.id);
  const okCounter = (await db(`SELECT last_sequence FROM payment_number_counters WHERE counter_date = $1::date`, [ROLLBACK_DATE])).rows[0]?.last_sequence;
  check("24.5 successful create leaves counter == 1", Number(okCounter) === 1, `counter=${okCounter}`);
  check("24.6 successful create number -001", okCreate.data?.paymentNo === rbNo, okCreate.data?.paymentNo);

  // ============ Malformed ids / bad query params ============
  console.log("\n=== Malformed ids / bad query params ===");
  check("M1. non-numeric id → 400", (await getPayment("abc")).status === 400);
  check("M2. id 0 → 400", (await getPayment("0")).status === 400);
  check("M3. id -5 → 400", (await getPayment("-5")).status === 400);
  check("M4. huge id → 404", (await getPayment("999999999")).status === 404);
  check("M5. bad fromDate → 400", (await listPayments("?fromDate=2026-13-45")).status === 400);
  check("M6. bad page → 400", (await listPayments("?page=abc")).status === 400);
  check("M7. bad status param → 400", (await listPayments("?status=Bogus")).status === 400);
  check("M8. bad mode param → 400", (await listPayments("?mode=Bogus")).status === 400);
  check("M9. bad type param → 400", (await listPayments("?paymentType=Bogus")).status === 400);

  console.log(`\n======================================`);
  console.log(`PAYMENTS TEST RESULT: ${pass} passed, ${fail} failed`);
  console.log(`======================================`);
} catch (err) {
  console.error("TEST RUNNER ERROR:", err);
} finally {
  try {
    if (createdIds.length) {
      await db(`DELETE FROM payments WHERE id = ANY($1::int[])`, [createdIds]);
    }
    await db(
      `DELETE FROM payments WHERE payment_date = ANY($1::date[]) AND created_by = 'payments-test'`,
      [TEST_DATES]
    );
    await db(`DELETE FROM payment_number_counters WHERE counter_date = ANY($1::date[])`, [TEST_DATES]);
    await pool.end();
  } catch (e) {
    console.error("Cleanup error:", e.message);
  }
  if (fail > 0) process.exit(1);
}