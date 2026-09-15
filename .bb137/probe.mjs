import { Client } from "pg";
const c = new Client({ connectionString: process.env.SUPABASE_DB_URL });
await c.connect();
const q = async (s, p) => (await c.query(s, p)).rows;
console.log("photos total:", (await q("select count(*)::int n from photos"))[0].n);
console.log("galleries:", (await q("select count(*)::int n from galleries"))[0].n);
console.log("top galleries by active photo count:");
console.table(await q(`select g.id, g.status, g.customer_id is not null as co_khach, count(p.id)::int as anh
  from galleries g join photos p on p.gallery_id=g.id and p.status='active'
  group by g.id, g.status, g.customer_id order by anh desc limit 5`));
console.log("median-ish gallery (~424):");
console.table(await q(`select g.id, g.status, count(p.id)::int as anh
  from galleries g join photos p on p.gallery_id=g.id and p.status='active'
  group by g.id, g.status having count(p.id) between 380 and 460 order by anh limit 5`));
console.log("share_links cols:");
console.table(await q(`select column_name, data_type, is_nullable from information_schema.columns where table_name='share_links' order by ordinal_position`));
await c.end();
