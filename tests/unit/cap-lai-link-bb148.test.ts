import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { createHash } from "node:crypto";
import { POST as taoLink } from "@/app/api/admin/galleries/[id]/share-link/route";
import { POST as authGallery } from "@/app/api/auth/gallery/route";
import { NextRequest } from "next/server";
import * as staffAuth from "@/lib/auth/staff";

vi.mock("server-only", () => ({}));

describe("BB-148: Cấp lại link không làm mất ảnh khách chọn", () => {
  let client: Client;
  let branchId: string;
  let galleryId: string;
  let customerId: string;
  let staffId: string;
  let oldToken: string;
  let oldSelectionId: string;

  function asRole(role: string) {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId,
      role,
      branchIds: [branchId],
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  }

  const params = () => ({ params: Promise.resolve({ id: galleryId }) });
  const body = (v: unknown = {}) =>
    new Request("http://localhost", { method: "POST", body: JSON.stringify(v) });

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const { rows: st } = await client.query("select id from staff_profiles limit 1");
    staffId = st[0].id;

    const { rows: c } = await client.query(
      `insert into customers (branch_id, full_name)
       values ($1,'Fixture BB-148') returning id`,
      [branchId],
    );
    customerId = c[0].id;

    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count)
       values ($1,$2,'Fixture BB-148 Gallery','ready',$3,'https://example.com/x', 3)
       returning id`,
      [branchId, customerId, `fixture-bb148-${Date.now()}`],
    );
    galleryId = g[0].id;

    // Tạo 3 ảnh
    for (let i = 1; i <= 3; i++) {
      await client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, status)
         values ($1, $2, $3, 'image/jpeg', 'active')`,
        [galleryId, `drive_file_${i}`, `IMG_${i}.jpg`]
      );
    }
  });

  afterAll(async () => {
    await client.query("delete from share_links where gallery_id = $1", [galleryId]);
    await client.query("delete from photos where gallery_id = $1", [galleryId]);
    await client.query("delete from galleries where id = $1", [galleryId]);
    await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  it("1. Tạo link, khách chọn ảnh, cấp link mới, không mất lựa chọn", async () => {
    asRole("cs");

    // 1. Tạo link lần đầu
    const resCu = await taoLink(body(), params());
    expect(resCu.status).toBe(200);
    const jsonCu = await resCu.json();
    oldToken = jsonCu.data.duongDan.replace("/g/", "");

    // 2. Khách mở link lần đầu -> tạo selection primary
    const reqAuth1 = new NextRequest("http://localhost/api/auth/gallery", {
      method: "POST",
      body: JSON.stringify({ token: oldToken }),
    });
    const auth1 = await authGallery(reqAuth1);
    expect(auth1.status).toBe(200);

    // Lấy ID của lượt chọn
    const { rows: s1 } = await client.query("select id from selections where gallery_id = $1 and is_primary = true", [galleryId]);
    expect(s1.length).toBe(1);
    oldSelectionId = s1[0].id;

    // 3. Khách thả tim 3 ảnh
    const { rows: photos } = await client.query("select id from photos where gallery_id = $1", [galleryId]);
    expect(photos.length).toBe(3);
    for (const p of photos) {
      await client.query(
        `insert into selection_items (selection_id, photo_id, gallery_id, mark) values ($1, $2, $3, 'selected')`,
        [oldSelectionId, p.id, galleryId]
      );
    }

    // 4. CSKH cấp link mới (thu hồi link cũ)
    const resMoi = await taoLink(body(), params());
    expect(resMoi.status).toBe(200);
    const jsonMoi = await resMoi.json();
    const newToken = jsonMoi.data.duongDan.replace("/g/", "");

    // 5. Khách mở link CŨ -> thất bại (bị thu hồi)
    const reqAuthOld = new NextRequest("http://localhost/api/auth/gallery", {
      method: "POST",
      body: JSON.stringify({ token: oldToken }),
    });
    const authOld = await authGallery(reqAuthOld);
    expect(authOld.status).toBe(404); // NOT_FOUND

    // 6. Khách mở link MỚI -> thành công
    const reqAuthNew = new NextRequest("http://localhost/api/auth/gallery", {
      method: "POST",
      body: JSON.stringify({ token: newToken }),
    });
    const authNew = await authGallery(reqAuthNew);
    expect(authNew.status).toBe(200);

    // 7. Kiểm tra: ảnh đã chọn bằng link cũ VẪN CÒN
    const { rows: s2 } = await client.query("select id, share_link_id from selections where gallery_id = $1 and is_primary = true", [galleryId]);
    expect(s2.length).toBe(1);
    // Vẫn là selectionId cũ
    expect(s2[0].id).toBe(oldSelectionId);
    
    // Đã chuyển share_link_id sang link mới
    const { rows: sl } = await client.query("select id from share_links where token_hash = $1", [createHash("sha256").update(newToken).digest("hex")]);
    expect(s2[0].share_link_id).toBe(sl[0].id);

    // 3 ảnh vẫn còn
    const { rows: items } = await client.query("select count(*)::int as c from selection_items where selection_id = $1 and mark = 'selected'", [oldSelectionId]);
    expect(items[0].c).toBe(3);
  });
});
