import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import * as gallerySession from "@/lib/auth/gallery-session";
import { GET as layAnh } from "@/app/api/img/[photoId]/route";

// Bộ ảnh thật 99 ảnh
const GALLERY_ID = "3179adbc-70b5-4e50-9104-4b9552c680be";

describe("BB-137: Đo số lượt gọi Google Drive khi khách cuộn hết bộ ảnh", () => {
  let client: Client;
  let photos: Array<{ id: string; file_name: string; drive_file_id: string }> = [];
  let shareLinkId = "";
  let createdLink = false;
  let galleryTitle = "";
  let customerId = "";

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: galleries } = await client.query(
      "select id, title, customer_id from galleries where id = $1",
      [GALLERY_ID]
    );
    if (galleries.length === 0) throw new Error("Không tìm thấy gallery");
    galleryTitle = galleries[0].title;
    customerId = galleries[0].customer_id;

    const { rows: pList } = await client.query(
      "select id, file_name, drive_file_id from photos where gallery_id = $1 and status = 'active' order by sort_index asc",
      [GALLERY_ID]
    );
    photos = pList;

    const { rows: links } = await client.query(
      "select id from share_links where gallery_id = $1 and status = 'active' limit 1",
      [GALLERY_ID]
    );
    if (links.length > 0) {
      shareLinkId = links[0].id;
    } else {
      const res = await client.query(
        `insert into share_links (gallery_id, token_hash, token_prefix, role, requires_pin, status)
         values ($1, 'dummy_measure_hash', 'measur', 'owner', false, 'active')
         returning id`,
        [GALLERY_ID]
      );
      shareLinkId = res.rows[0].id;
      createdLink = true;
    }

    vi.spyOn(staffAuth, "requireStaff").mockRejectedValue(new staffAuth.AuthError("UNAUTHENTICATED"));
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId: GALLERY_ID,
      customerId,
      role: "owner",
      shareLinkId,
      selectionId: "00000000-0000-0000-0000-000000000000",
      exp: 0,
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
  });

  afterAll(async () => {
    if (createdLink) {
      await client.query("delete from share_links where id = $1", [shareLinkId]);
    }
    await client.end();
  });

  it("Đo số lượt gọi Drive cho một lần cuộn hết (lần 1) và cuộn lại (lần 2)", async () => {
    let driveCalls = 0;
    const originalInfo = console.info;
    console.info = (...args: any[]) => {
      const s = typeof args[0] === "string" ? args[0] : JSON.stringify(args[0]);
      if (s.includes('"evt":"drive_call"')) {
        driveCalls++;
      }
    };

    try {
      // LẦN 1: Khách cuộn hết toàn bộ ảnh (w=400)
      driveCalls = 0;
      const start1 = Date.now();
      let ok1 = 0;
      for (const p of photos) {
        const res = await layAnh(new Request(`http://localhost/api/img/${p.id}?w=400`), {
          params: Promise.resolve({ photoId: p.id }),
        });
        if (res.status === 200) ok1++;
      }
      const duration1 = ((Date.now() - start1) / 1000).toFixed(2);
      const callsRun1 = driveCalls;

      // LẦN 2: Khách cuộn lại toàn bộ ảnh (w=400)
      driveCalls = 0;
      const start2 = Date.now();
      let ok2 = 0;
      for (const p of photos) {
        const res = await layAnh(new Request(`http://localhost/api/img/${p.id}?w=400`), {
          params: Promise.resolve({ photoId: p.id }),
        });
        if (res.status === 200) ok2++;
      }
      const duration2 = ((Date.now() - start2) / 1000).toFixed(2);
      const callsRun2 = driveCalls;

      console.log("\n=======================================================");
      console.log(`KẾT QUẢ ĐO TRÊN BỘ ẢNH THẬT: "${galleryTitle}" (${photos.length} ảnh)`);
      console.log(`- Lần 1 (cuộn hết lần đầu): ${callsRun1} lượt gọi Google Drive (${duration1}s, ${ok1}/${photos.length} ảnh tải thành công)`);
      console.log(`- Lần 2 (cuộn lại lần hai): ${callsRun2} lượt gọi Google Drive (${duration2}s, ${ok2}/${photos.length} ảnh tải thành công)`);
      console.log("=======================================================\n");

      expect(ok1).toBe(photos.length);
    } finally {
      console.info = originalInfo;
    }
  }, 120000);
});
