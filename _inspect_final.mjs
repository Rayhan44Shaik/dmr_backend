import pg from "pg";
const p = new pg.Pool({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });
const emp = await p.query(`SELECT id, employee_no, employee_name, department, status FROM employees ORDER BY id`);
for (const x of emp.rows) console.log(x.id, "|", x.employee_no, "|", x.employee_name, "|", x.department, "|", x.status);
const t = await p.query(`SELECT id, trip_no, status, deleted, trip_date::text, created_at FROM trips ORDER BY id`);
console.log("--- trips ---");
for (const x of t.rows) console.log(x.id, "|", x.trip_no, "|", x.trip_date, "|", x.status, "| del=" + x.deleted, "|", x.created_at);
await p.end();