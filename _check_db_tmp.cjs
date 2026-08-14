const { Pool } = require('pg');
const p = new Pool({ connectionString: 'postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries' });
(async () => {
  const r = await p.query('SELECT filename FROM schema_migrations ORDER BY id');
  console.log('MIGRATIONS:');
  console.log(r.rows.map(x => x.filename).join('\n'));
  const c = await p.query('SELECT count(*)::int c FROM fleet_maintenance');
  console.log('fleet_maintenance rows:', c.rows[0].c);
  const v = await p.query('SELECT count(*)::int c FROM vehicles');
  console.log('vehicles rows:', v.rows[0].c);
  await p.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
