import pg from "pg";

const dbUrl = process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error("Missing SUPABASE_DB_URL");
  process.exit(1);
}

const u = new URL(dbUrl);
const client = new pg.Client({
  host: u.hostname,
  port: Number(u.port) || 5432,
  database: u.pathname.slice(1),
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 25_000,
});

async function main() {
  await client.connect();
  console.log("Connected to DB.");

  const res = await client.query(`SELECT id, title, photo_count FROM galleries WHERE title = 'Test Gallery'`);
  console.log(`Found ${res.rowCount} galleries named 'Test Gallery'.`);

  if (res.rowCount > 0) {
    const ids = res.rows.map(r => r.id);
    console.log("IDs:", ids);

    // Delete photos for these galleries first
    const delPhotos = await client.query(`DELETE FROM photos WHERE gallery_id = ANY($1)`, [ids]);
    console.log(`Deleted ${delPhotos.rowCount} photos.`);

    // Delete the galleries
    const delGals = await client.query(`DELETE FROM galleries WHERE id = ANY($1)`, [ids]);
    console.log(`Deleted ${delGals.rowCount} galleries.`);
  }

  await client.end();
}

main().catch(console.error);
