import pg from 'pg';
const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await client.connect();
const { rows: r1 } = await client.query('select count(*) as c from activity_logs;');
const { rows: r2 } = await client.query(`
  select count(*) as c from activity_logs 
  where entity_type = 'gallery' and entity_id not in (select id from galleries);
`);
console.log(`Tổng dòng: ${r1[0].c}`);
console.log(`Dòng mồ côi: ${r2[0].c}`);
await client.end();
