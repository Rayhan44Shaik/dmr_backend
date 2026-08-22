const { Pool } = require('pg');
const p = new Pool({ connectionString: 'postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries' });
(async () => {
  const m = await p.query('SELECT id, bill_no, maintenance_date, vehicle_id, vehicle_no, status, deleted FROM fleet_maintenance ORDER BY id');
  console.log('MAINT:');
  m.rows.forEach(r => console.log(JSON.stringify(r)));
  const v = await p.query('SELECT id, vehicle_number, vehicle_no FROM vehicles ORDER BY id');
  console.log('VEHICLES:');
  v.rows.forEach(r => console.log(JSON.stringify(r)));
  await p.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
