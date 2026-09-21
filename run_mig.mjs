import fs from 'fs';
import pg from 'pg';

const { Client } = pg;
const dbUrl = process.env.SUPABASE_DB_URL;

const client = new Client({ connectionString: dbUrl });
await client.connect();
const sql = fs.readFileSync('db/migrations/0051-activity-logs-gallery-fk.sql', 'utf8');
await client.query(sql);
await client.end();
console.log('Migration applied');
