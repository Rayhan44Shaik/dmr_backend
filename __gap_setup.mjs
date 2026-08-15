import pg from "pg";
const client = new pg.Client({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });
await client.connect();

const vehicles = await client.query("SELECT id, vehicle_number FROM vehicles WHERE status='Active' LIMIT 3");
const drivers = await client.query("SELECT id, employee_name FROM employees WHERE department='Driver' AND status='Active' LIMIT 3");
const supervisors = await client.query("SELECT id, employee_name FROM employees WHERE department='Supervisor' AND status='Active' LIMIT 3");
const farms = await client.query("SELECT id, farm_name FROM farms WHERE status='Active' LIMIT 3");
const shops = await client.query("SELECT id, shop_name, status FROM shops LIMIT 10");
const birdTypes = await client.query("SELECT id, bird_type FROM bird_types LIMIT 3");

console.log("VEHICLES:", JSON.stringify(vehicles.rows));
console.log("DRIVERS:", JSON.stringify(drivers.rows));
console.log("SUPERVISORS:", JSON.stringify(supervisors.rows));
console.log("FARMS:", JSON.stringify(farms.rows));
console.log("SHOPS:", JSON.stringify(shops.rows));
console.log("BIRD_TYPES:", JSON.stringify(birdTypes.rows));

await client.end();
