const API = "http://localhost:4000/api";
(async () => {
  const r = await fetch(API + "/fleet/maintenance?status=Approved&latestApproved=true");
  const data = await r.json();
  console.log("status:", r.status);
  console.log(JSON.stringify(Array.isArray(data) ? data : data.error, null, 2));
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
