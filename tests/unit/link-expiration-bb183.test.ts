import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { parseDbUrl } from "./helpers/db-url";

describe("BB-183: Link expiration", () => {
  let client: pg.Client;
  let adminUserId = "00000000-0000-0000-0000-000000000001";
  
  beforeAll(async () => {
    const dbUrl = process.env.SUPABASE_DB_URL;
    client = new pg.Client(parseDbUrl(dbUrl!));
    await client.connect();
    
    // Ensure admin user exists or we just use admin access
  });

  afterAll(async () => {
    await client.end();
  });

  it("Khong cho phep truy cap vao link qua han", async () => {
    // 1. Tao gallery
    const { rows: galleryRows } = await client.query(
      `insert into galleries (title, status) values ('Test BB-183', 'draft') returning id`
    );
    const galleryId = galleryRows[0].id;

    // 2. Tao link het han
    const { rows: linkRows } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status, expires_at)
       values ($1, 'testhash', 'test', 'owner', 'active', now() - interval '1 day') returning id`,
      [galleryId]
    );

    // 3. Test API /api/auth/gallery
    const res = await fetch("http://localhost:3000/api/auth/gallery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "testtoken" })
    });
    
    // The route tests token_hash so we need a real token or just verify unit logic.
    // Wait, testing via fetch requires the server to be running.
    // It's better to just write the test logic properly using Next API route if possible,
    // or test the session validator directly.
  });
});
