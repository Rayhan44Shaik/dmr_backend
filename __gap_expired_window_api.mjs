const base = "http://localhost:4000";
async function j(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, body: data };
}

// delivery 1141 = New Hyderabad Chicken Center on trip 1008 (approved_at backdated 11 days)
console.log("BIRDS EDIT:", JSON.stringify(await j("PUT", "/api/operations/shop-sales/1141", { birds: 100 })));
console.log("WEIGHT EDIT:", JSON.stringify(await j("PUT", "/api/operations/shop-sales/1141", { weight: 100 })));
console.log("RATE EDIT:", JSON.stringify(await j("PUT", "/api/operations/shop-sales/1141", { rate: 150 })));
console.log("DELETE:", JSON.stringify(await j("DELETE", "/api/operations/shop-sales/1141")));
