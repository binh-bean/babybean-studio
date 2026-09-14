/**
 * BB-127 — link CSKH tạo ra phải MỞ ĐƯỢC.
 *
 * Phép thử kia chỉ chứng minh dòng ghi vào cơ sở dữ liệu đúng hình dạng. Nó
 * KHÔNG chứng minh khách mở link ra thì vào được — mà đó mới là việc.
 *
 * Chuyện suýt xảy ra: `0010` đổi mô hình sang một link cho một khách, nên bản
 * đầu của route gắn link vào `customer_id`. Ràng buộc cơ sở dữ liệu chặn lại.
 * Nếu không có ràng buộc đó, link vẫn tạo ra được, vẫn trông đúng — và mở ra
 * là phiên có `galleryId` rỗng, vì nửa còn lại của mô hình theo khách chưa
 * làm xong. CSKH sẽ dán một link hỏng vào Lark và không ai biết cho tới lúc
 * khách gọi.
 *
 * Nên phép thử này đi hết đường: tạo link → đăng nhập bằng chính mã đó →
 * kiểm phiên trỏ đúng bộ ảnh.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { POST as taoLink } from "@/app/api/admin/galleries/[id]/share-link/route";
import { POST as dangNhap } from "@/app/api/auth/gallery/route";
import { NextRequest } from "next/server";

describe("BB-127: link tạo ra mở được thật", () => {
  let client: Client;
  let branchId: string;
  let galleryId: string;
  let customerId: string;
  let staffId: string;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    const { rows: st } = await client.query("select id from staff_profiles limit 1");
    staffId = st[0].id;
    const { rows: c } = await client.query(
      `insert into customers (branch_id, full_name)
       values ($1,'Fixture BB-127b Khách') returning id`,
      [branchId],
    );
    customerId = c[0].id;
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count)
       values ($1,$2,'Fixture BB-127b','ready',$3,'https://example.com/x', 7)
       returning id`,
      [branchId, customerId, `fixture-bb127b-${Date.now()}`],
    );
    galleryId = g[0].id;

    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId,
      role: "cs",
      branchIds: [branchId],
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  });

  afterAll(async () => {
    await client.query("delete from selections where gallery_id = $1", [galleryId]);
    await client.query("delete from share_links where gallery_id = $1", [galleryId]);
    await client.query("delete from galleries where id = $1", [galleryId]);
    await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  it("Tạo link rồi đăng nhập bằng chính mã đó -> vào đúng bộ ảnh", async () => {
    const tao = await taoLink(
      new Request("http://localhost", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ id: galleryId }) },
    );
    expect(tao.status).toBe(200);
    const ma = (await tao.json()).data.duongDan.replace("/g/", "");

    const res = await dangNhap(
      new NextRequest("http://localhost/api/auth/gallery", {
        method: "POST",
        body: JSON.stringify({ token: ma }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();

    // Phiên phải trỏ đúng bộ ảnh. Rỗng nghĩa là link gắn nhầm tầng.
    expect(json.data.galleryId).toBe(galleryId);
    expect(json.data.role).toBe("owner");

    // Và phải có cookie phiên, nếu không thì mọi trang sau đó đều đá ra.
    expect(res.headers.get("set-cookie")).toBeTruthy();

    // Lượt chọn được tạo ngay lần vào đầu tiên — khách thả tim là ghi được.
    const { rows } = await client.query(
      "select is_primary from selections where gallery_id = $1",
      [galleryId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].is_primary).toBe(true);
  });

  it("Mã bịa -> không vào được", async () => {
    const res = await dangNhap(
      new NextRequest("http://localhost/api/auth/gallery", {
        method: "POST",
        body: JSON.stringify({ token: "ma-bia-khong-co-that-0123456789abcdef" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).not.toBe(200);
  });
});
